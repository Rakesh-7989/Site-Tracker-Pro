// Impersonation hardening (P1) — pure helpers + provider behavior.
//
// Covers: state builder (reason trim + TTL), expiry math, audit RPC on start
// AND stop (incl. the auto-expiry path), and the banner countdown surface.
//
// Note: real timers on purpose — vi.useFakeTimers breaks React 18 concurrent
// act() scheduling here ("Element type is invalid" render crashes). The
// auto-expiry test instead seeds a session that expires ~60 ms after start.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ImpersonationProvider,
  buildImpersonationState,
  isImpersonationExpired,
  remainingMs,
  IMPERSONATION_TTL_MS,
  useImpersonation,
  type ImpersonationState,
} from "@/features/admin/ImpersonationContext";
import { ImpersonationBanner } from "@/features/admin/ImpersonationBanner";
import { getClient } from "@/lib/supabase/supabase";

vi.mock("@/lib/supabase/supabase", () => ({ getClient: vi.fn() }));

const REAL = { id: "u-admin", name: "Ops Admin", email: "ops@sitetrackpro.in" };
const AS = { id: "u-target", name: "Client User", email: "client@sitetrackpro.in", role: "client" };
const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

/** Session that still has `msLeft` before the 15-min TTL elapses. */
function stateWithMsLeft(msLeft: number): ImpersonationState {
  return buildImpersonationState(REAL, AS, "support ticket #1234", Date.now() - (IMPERSONATION_TTL_MS - msLeft));
}

function Harness(): JSX.Element {
  const { impersonating, startImpersonating, stopImpersonating } = useImpersonation();
  return (
    <div>
      <span data-testid="state">{impersonating ? `${impersonating.asUser.email}|${impersonating.reason}` : "none"}</span>
      <button onClick={() => startImpersonating(buildImpersonationState(REAL, AS, "  support ticket #1234  "))}>start</button>
      <button onClick={() => startImpersonating(stateWithMsLeft(60))}>start-expiring</button>
      <button onClick={stopImpersonating}>stop</button>
    </div>
  );
}

function renderHarness(): void {
  render(
    <ImpersonationProvider>
      <Harness />
      <ImpersonationBanner />
    </ImpersonationProvider>,
  );
}

describe("buildImpersonationState", () => {
  it("trims the reason and stamps startedAt/expiresAt = startedAt + TTL", () => {
    const now = Date.UTC(2026, 7, 30, 10, 0, 0);
    const st = buildImpersonationState(REAL, AS, "  reproduce billing bug  ", now);
    expect(st.reason).toBe("reproduce billing bug");
    expect(st.startedAt).toBe(new Date(now).toISOString());
    expect(st.expiresAt).toBe(new Date(now + IMPERSONATION_TTL_MS).toISOString());
    expect(IMPERSONATION_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe("isImpersonationExpired / remainingMs", () => {
  const st = buildImpersonationState(REAL, AS, "reason", Date.UTC(2026, 7, 30, 10, 0, 0));

  it("not expired before expiry, expired at/after", () => {
    expect(isImpersonationExpired(st, Date.UTC(2026, 7, 30, 10, 14, 59))).toBe(false);
    expect(isImpersonationExpired(st, Date.UTC(2026, 7, 30, 10, 15, 0))).toBe(true);
    expect(isImpersonationExpired(st, Date.UTC(2026, 7, 30, 10, 20, 0))).toBe(true);
  });

  it("remainingMs counts down and clamps to 0", () => {
    expect(remainingMs(st, Date.UTC(2026, 7, 30, 10, 0, 0))).toBe(IMPERSONATION_TTL_MS);
    expect(remainingMs(st, Date.UTC(2026, 7, 30, 10, 10, 0))).toBe(5 * 60 * 1000);
    expect(remainingMs(st, Date.UTC(2026, 7, 30, 11, 0, 0))).toBe(0);
  });
});

describe("ImpersonationProvider", () => {
  beforeEach(() => {
    rpc.mockClear();
    vi.mocked(getClient).mockResolvedValue({ rpc } as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start shows the banner with reason + countdown and audits IMPERSONATE", async () => {
    renderHarness();
    expect(screen.getByTestId("state")).toHaveTextContent("none");
    expect(screen.queryByText(/Impersonating/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("start"));

    expect(screen.getByTestId("state")).toHaveTextContent("client@sitetrackpro.in|support ticket #1234");
    expect(screen.getByText(/Impersonating/)).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("record_audit_v2", expect.objectContaining({
      p_action: "IMPERSONATE",
      p_resource: "profiles",
      p_resource_id: AS.id,
      p_message: expect.stringContaining("support ticket #1234"),
    }));
  });

  it("stop clears the banner and writes the session-closed audit", async () => {
    renderHarness();
    fireEvent.click(screen.getByText("start"));
    expect(screen.getByTestId("state")).not.toHaveTextContent("none");

    fireEvent.click(screen.getByText("stop"));

    expect(screen.getByTestId("state")).toHaveTextContent("none");
    expect(screen.queryByText(/Impersonating/)).not.toBeInTheDocument();

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenLastCalledWith("record_audit_v2", expect.objectContaining({
      p_action: "IMPERSONATE",
      p_message: expect.stringContaining("Ended impersonation of client@sitetrackpro.in"),
    }));
  });

  it("auto-expires through the audited stop path", async () => {
    renderHarness();
    fireEvent.click(screen.getByText("start-expiring"));
    expect(screen.getByTestId("state")).not.toHaveTextContent("none");

    await waitFor(
      () => expect(screen.getByTestId("state")).toHaveTextContent("none"),
      { timeout: 2000 },
    );
    expect(screen.queryByText(/Impersonating/)).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2); // start + auto-expired stop
  });
});
