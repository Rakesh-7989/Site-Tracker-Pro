import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { guardRoutes, isStaleChunkError } from "@/app/RouteErrorBoundary";
import { captureException } from "@/lib/sentry";

vi.mock("@/lib/sentry", () => ({ captureException: vi.fn().mockResolvedValue(undefined) }));

function Boom(): never {
  throw new Error("kaboom in view");
}

function StaleChunk(): never {
  throw new Error("Failed to fetch dynamically imported module: /a.js");
}

function mountAt(path: string): void {
  const routes = guardRoutes([
    {
      path: "/",
      element: <Outlet />,
      children: [
        { path: "ok", element: <div>fine</div> },
        { path: "boom", element: <Boom /> },
        { path: "stale", element: <StaleChunk /> },
      ],
    },
  ]);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the error card inside the parent layout when a child view crashes", async () => {
    mountAt("/boom");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong here/i)).toBeInTheDocument();
    expect(screen.getByText(/kaboom in view/)).toBeInTheDocument();
  });

  it("captures the error to Sentry once", async () => {
    mountAt("/boom");
    await screen.findByRole("alert");
    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    const [err, ctx] = vi.mocked(captureException).mock.calls[0];
    expect((err as Error).message).toBe("kaboom in view");
    expect(ctx).toMatchObject({ extra: { source: "route-error-boundary" } });
  });

  it("offers reload + dashboard actions", async () => {
    mountAt("/boom");
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to dashboard/i })).toHaveAttribute("href", "/dashboard");
  });

  it("shows the stale-chunk update message for chunk-load failures (no raw stack)", async () => {
    vi.stubGlobal("location", { reload: vi.fn() });
    mountAt("/stale");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/new version of SiteTrack was deployed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload to update/i })).toBeInTheDocument();
    expect(captureException).toHaveBeenCalled();
  });

  it("does not capture route-error-responses (404-style) to Sentry", async () => {
    function ThrowResponse(): never {
      throw Object.assign(new Error("not found"), { status: 404, statusText: "Not Found", internal: false, data: null });
    }
    const routes = guardRoutes([
      { path: "/", element: <Outlet />, children: [{ path: "resp", element: <ThrowResponse /> }] },
    ]);
    const router = createMemoryRouter(routes, { initialEntries: ["/resp"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("alert");
    await waitFor(() => expect(captureException).not.toHaveBeenCalled());
  });
});

describe("guardRoutes", () => {
  it("attaches errorElement to every node incl. nested children and preserves existing ones", () => {
    const keep = <div>custom</div>;
    const guarded = guardRoutes([
      { path: "a", children: [{ path: "b" }, { path: "c", errorElement: keep }] },
      { path: "d" },
    ]);
    expect(guarded[0]?.children?.[0]?.errorElement).toBeTruthy();
    expect(guarded[0]?.children?.[1]?.errorElement).toBe(keep);
    expect(guarded[1]?.errorElement).toBeTruthy();
  });

  it("does not mutate the input array", () => {
    const input = [{ path: "a", children: [{ path: "b" }] }];
    const snapshot = JSON.stringify(input);
    guardRoutes(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("isStaleChunkError", () => {
  it.each([
    ["Failed to fetch dynamically imported module: https://x/a.js", true],
    ["Importing a module script failed.", true],
    ["Loading chunk 42 failed.", true],
    ["TypeError: cannot read properties of undefined", false],
    ["", false],
  ])("%s -> %s", (msg, expected) => {
    expect(isStaleChunkError(new Error(msg))).toBe(expected);
  });

  it("handles non-Error values", () => {
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError("Importing a module script failed.")).toBe(true);
  });
});
