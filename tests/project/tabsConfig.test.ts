// SiteTrack Pro — project tab-config tests (Phase 6).
//
// Verifies the role + project-type gating of detail tabs, using real
// capability sets resolved from session fixtures.

import { describe, it, expect } from "vitest";
import {
  TAB_CATALOG,
  TAB_IDS,
  DEFAULT_TAB,
  visibleTabs,
  isTabVisible,
  tabById,
} from "@/features/project/tabs-config";
import { resolveCapabilities, type AuthSession, type Capability } from "@/auth";
import { isIconName } from "@/components/ui/icons";

function capsFor(session: AuthSession, ctx: { orgId?: string; projectId?: string } = {}): Set<Capability> {
  return resolveCapabilities(session, ctx).capabilities;
}

const baseSession = (role: AuthSession["user"]["identityRole"]): AuthSession => ({
  user: { id: "u", email: "a@b", name: "T", identityRole: role, isStaff: false },
  orgs: [],
  activeOrgId: null,
  projectMemberships: [],
});

describe("TAB_CATALOG integrity", () => {
  it("has unique tab ids", () => {
    expect(new Set(TAB_IDS).size).toBe(TAB_IDS.length);
  });
  it("every tab icon is a real IconName", () => {
    for (const t of TAB_CATALOG) {
      expect(isIconName(t.icon), `tab ${t.id} icon=${t.icon}`).toBe(true);
    }
  });
  it("default tab exists", () => {
    expect(tabById(DEFAULT_TAB)).toBeDefined();
  });
});

describe("visibleTabs — capability gating", () => {
  it("always shows overview + team to any member", () => {
    const caps = capsFor(baseSession("client"));
    const ids = visibleTabs(caps, "construction").map(t => t.id);
    expect(ids).toContain("overview");
    expect(ids).toContain("team");
  });

  it("client does NOT see finance / milestone-edit tabs", () => {
    const caps = capsFor(baseSession("client"));
    const ids = visibleTabs(caps, "construction").map(t => t.id);
    expect(ids).not.toContain("budget");
    expect(ids).not.toContain("milestones");
    expect(ids).not.toContain("rabills");
  });

  it("pm sees finance + milestones but not approvals (SoD — no self-approval)", () => {
    const caps = capsFor(baseSession("pm"));
    const ids = visibleTabs(caps, "construction").map(t => t.id);
    expect(ids).toContain("milestones");
    expect(ids).toContain("budget");
    expect(ids).not.toContain("approvals");
  });

  it("project_admin sees approvals via PO approval even without change-order / RA approval (SoD)", () => {
    const caps = capsFor(baseSession("project_admin"));
    expect(caps.has("changeorder:approve")).toBe(false);
    expect(caps.has("rabill:approve")).toBe(false);
    expect(caps.has("po:approve")).toBe(true);
    const ids = visibleTabs(caps, "construction").map(t => t.id);
    expect(ids).toContain("approvals");
  });

  it("site_engineer sees field/site tabs but not finance", () => {
    const caps = capsFor(baseSession("site_engineer"));
    const ids = visibleTabs(caps, "construction").map(t => t.id);
    expect(ids).toContain("attendance");
    expect(ids).toContain("safety");
    expect(ids).not.toContain("budget");
  });
});

describe("visibleTabs — project-type gating", () => {
  it("design projects hide site-execution tabs even for a pm", () => {
    const caps = capsFor(baseSession("pm"));
    const designIds = visibleTabs(caps, "design").map(t => t.id);
    expect(designIds).not.toContain("attendance");
    expect(designIds).not.toContain("labour");
    expect(designIds).not.toContain("safety");
    expect(designIds).not.toContain("materials");
  });

  it("construction projects show site tabs for a pm", () => {
    const caps = capsFor(baseSession("pm"));
    const ids = visibleTabs(caps, "construction").map(t => t.id);
    expect(ids).toContain("attendance");
    expect(ids).toContain("materials");
  });
});

describe("isTabVisible", () => {
  it("true for a visible tab, false for a gated one", () => {
    const caps = capsFor(baseSession("client"));
    expect(isTabVisible("overview", caps, "construction")).toBe(true);
    expect(isTabVisible("budget", caps, "construction")).toBe(false);
  });
});

describe("visibleTabs — plan gating", () => {
  // A Basic-plan predicate: only base features unlocked (no finance/rfi/etc).
  const basicPlan = (f: string) => f === "whatsapp_share";
  // A Pro+ predicate: everything the predicate is asked about is unlocked.
  const proPlan = () => true;

  it("hides finance / rfi / estimate / approvals / compliance / gantt on Basic plan (even for a pm)", () => {
    const caps = capsFor(baseSession("pm"));
    const ids = visibleTabs(caps, "construction", basicPlan).map(t => t.id);
    for (const gated of ["budget", "ledger", "po", "invoices", "rabills", "rfi", "changeorders", "estimate", "approvals", "compliance", "gantt"]) {
      expect(ids, `expected ${gated} hidden on Basic`).not.toContain(gated);
    }
    // Base tabs still show
    expect(ids).toContain("overview");
    expect(ids).toContain("attendance");
  });

  it("shows the Pro+ tabs when the plan unlocks them", () => {
    const caps = capsFor(baseSession("pm"));
    const ids = visibleTabs(caps, "construction", proPlan).map(t => t.id);
    expect(ids).toContain("budget");
    expect(ids).toContain("rabills");
    // PM does NOT see approvals (SoD — no *:approve cap)
    expect(ids).not.toContain("approvals");
  });

  it("no plan predicate = role-only gating (backward compatible)", () => {
    const caps = capsFor(baseSession("pm"));
    const ids = visibleTabs(caps, "construction").map(t => t.id);
    expect(ids).toContain("budget"); // unchanged when planCan omitted
  });
});
