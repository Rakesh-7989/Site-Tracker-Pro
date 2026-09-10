import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";

import { I18nProvider } from "@/i18n/I18nProvider";
import {
  GuidedTour,
  filterStepsForDom,
  readTourSeen,
  markTourSeen,
  TOUR_STORAGE_KEY,
  GUIDED_TOUR_STEPS,
} from "@/features/shell/GuidedTour";
import type { GuidedTourGate } from "@/features/shell/GuidedTour";
import { isOnboardingDone } from "@/app/queries/onboardingQueries";
import { getClient } from "@/lib/supabase/supabase";

const media = vi.hoisted(() => ({ isDesktop: true }));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => media.isDesktop,
}));

const sessionMock = vi.hoisted(() => ({
  session: {
    user: {
      profileCompleted: true,
    },
    activeOrgId: "org-123",
  },
}));

vi.mock("@/auth", () => ({
  useAuth: () => sessionMock,
}));

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

vi.mock("@/lib/supabase/supabase", () => ({
  getClient: vi.fn(),
}));

vi.mock("@/app/queries/onboardingQueries", () => ({
  isOnboardingDone: vi.fn(),
}));

type MockButtonProps = {
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: string;
  size?: string;
  type?: string;
  loading?: boolean;
  leftIcon?: ReactNode;
  [key: string]: unknown;
};

vi.mock("@/components/ui/atoms", () => ({
  Button: ({ children, onClick, className, ...rest }: MockButtonProps) => {
    const { variant: _variant, size: _size, type: _type, loading: _loading, leftIcon: _leftIcon, ...buttonProps } = rest;
    return (
      <button type="button" onClick={onClick} className={className} {...buttonProps}>
        {children}
      </button>
    );
  },
}));

function renderTour(gate?: GuidedTourGate) {
  return render(
    <I18nProvider>
      <GuidedTour gate={gate} />
    </I18nProvider>
  );
}

function appendAnchor(href: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.textContent = href;
  document.body.appendChild(a);
  return a;
}

describe("GuidedTour helpers", () => {
  it("filterStepsForDom keeps unanchored steps and only matching anchors", () => {
    const present = new Set(['a[href="/dpr"]', 'a[href="/projects"]']);
    const filtered = filterStepsForDom(GUIDED_TOUR_STEPS, (sel) => present.has(sel));
    expect(filtered.map((s) => s.id)).toEqual(["welcome", "dpr", "projects", "finish"]);
  });

  it("filterStepsForDom with no anchors keeps only unanchored steps", () => {
    const filtered = filterStepsForDom(GUIDED_TOUR_STEPS, () => false);
    expect(filtered.map((s) => s.id)).toEqual(["welcome", "finish"]);
  });

  it("readTourSeen / markTourSeen round-trips per org in localStorage", () => {
    expect(readTourSeen("org-1")).toBe(false);
    markTourSeen("org-1");
    expect(readTourSeen("org-1")).toBe(true);
    expect(readTourSeen("org-2")).toBe(false);
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY("org-1"))).toBe("1");
  });
});

describe("GuidedTour", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    media.isDesktop = true;
    vi.clearAllMocks();
  });

  it("renders the welcome card when the gate resolves true (desktop)", async () => {
    renderTour(async () => true);
    const dialog = await screen.findByRole("dialog", { name: "Product tour" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Welcome to SiteTrack Pro")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("advances to finish, Back returns, and Done dismisses + persists seen", async () => {
    renderTour(async () => true);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("You are all set")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Welcome to SiteTrack Pro")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readTourSeen("org-123")).toBe(true);
  });

  it("Skip dismisses and persists seen in localStorage", async () => {
    renderTour(async () => true);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readTourSeen("org-123")).toBe(true);
  });

  it("Escape dismisses the tour", async () => {
    renderTour(async () => true);
    await screen.findByRole("dialog");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("includes anchored steps whose selectors resolve in the DOM", async () => {
    appendAnchor("/dpr");
    appendAnchor("/projects");
    renderTour(async () => true);
    await screen.findByRole("dialog");

    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Daily Progress Reports")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("does not render when the gate resolves false", async () => {
    const gate = vi.fn(async () => false);
    renderTour(gate);
    await flushAsync();
    expect(gate).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("default gate suppresses an already-seen tour without querying onboarding", async () => {
    markTourSeen("org-123");
    renderTour();
    await flushAsync();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(isOnboardingDone).not.toHaveBeenCalled();
  });

  it("default gate shows the tour when onboarding is not done", async () => {
    vi.mocked(getClient).mockResolvedValue({} as never);
    vi.mocked(isOnboardingDone).mockResolvedValue(false);
    renderTour();
    expect(await screen.findByRole("dialog", { name: "Product tour" })).toBeInTheDocument();
    expect(isOnboardingDone).toHaveBeenCalledWith({}, "org-123");
  });

  it("does not render on mobile even when the gate would pass", async () => {
    media.isDesktop = false;
    renderTour(async () => true);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});