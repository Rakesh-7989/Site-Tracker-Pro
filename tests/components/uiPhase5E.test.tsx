// SiteTrack Pro — Option 4 / Phase 5: Batch 5E — OrgActivityView feed skeleton
// + compact EmptyState (via the exported `ActivityFeed` body).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ActivityFeed } from "@/features/org/OrgActivityView";
import type { OrgActivityRow } from "@/app/queries/orgAdminQueries";

const ROW: OrgActivityRow = {
  id: "a1",
  actorName: "Rakesh",
  actorRole: "orgadmin",
  action: "CREATE",
  resource: "project",
  resourceId: "abcdefgh12345678",
  message: "Created project demo",
  ts: "2026-08-11T10:00:00.000Z",
};

describe("ActivityFeed — loading skeleton", () => {
  it("renders a single structural status region while loading", () => {
    const { container } = render(<ActivityFeed rows={[]} loading error={null} />);
    const statuses = container.querySelectorAll("[role='status']");
    expect(statuses.length).toBe(1);
    expect(statuses[0]).toHaveAttribute("aria-label", "Loading activity");
    expect(statuses[0]).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("No activity recorded yet")).toBeNull();
  });
});

describe("ActivityFeed — empty state", () => {
  it("renders the compact empty state, not a spinner or rows", () => {
    const { container } = render(<ActivityFeed rows={[]} loading={false} error={null} />);
    expect(screen.getByText("No activity recorded yet")).toBeInTheDocument();
    expect(container.querySelector(".py-8")).not.toBeNull();
    expect(container.querySelector(".py-16")).toBeNull();
    expect(screen.queryByText("Rakesh")).toBeNull();
  });
});

describe("ActivityFeed — rows + error", () => {
  it("renders actor, action badge, resource, message and timestamp", () => {
    const { container } = render(<ActivityFeed rows={[ROW]} loading={false} error={null} />);
    expect(screen.getByText("CREATE")).toBeInTheDocument();
    expect(screen.getByText("Rakesh")).toBeInTheDocument();
    expect(container.textContent).toContain("project #abcdefgh");
    expect(screen.getByText("Created project demo")).toBeInTheDocument();
    expect(container.querySelector(".whitespace-nowrap")?.textContent).toMatch(/Aug/);
  });

  it("shows the error alert and hides rows when error is set", () => {
    render(<ActivityFeed rows={[ROW]} loading={false} error="Backend not configured." />);
    expect(screen.getByText("Backend not configured.")).toBeInTheDocument();
    expect(screen.queryByText("Rakesh")).toBeNull();
  });

  it("omits the message line when absent", () => {
    const { container } = render(
      <ActivityFeed rows={[{ ...ROW, message: null }]} loading={false} error={null} />
    );
    expect(container.textContent).not.toContain("Created project demo");
  });
});
