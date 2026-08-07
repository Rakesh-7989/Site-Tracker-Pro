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
} from "@/features/project/tabs-config";import { resolveCapabilities, type AuthSession, type Capability, type CompanySegment } from "@/auth";
import { isIconName } from "@/components/ui/icons";
import { isModuleId } from "@/modules";
import { tabModuleId } from "@/features/project/tabs-config";

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
    for (const gated of ["budget", "ledger", "po", "invoices", "rabills", "rfi", "changeorders", "estimate", "approvals", "gantt"]) {
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

describe("visibleTabs — segment gating (v4 C0)", () => {
  const reviewsTab = (segments: CompanySegment[]) => ({
    id: "reviews",
    label: "Reviews",
    icon: "check" as const,
    segments,
  });

  it("a consultancy-gated tab shows only for a consultancy org", () => {
    const caps = capsFor(baseSession("pm"));
    const cat = [reviewsTab(["consultancy"])];
    const consultancy = visibleTabs(caps, "consultant", undefined, "consultancy", cat).map(t => t.id);
    const construction = visibleTabs(caps, "consultant", undefined, "construction", cat).map(t => t.id);
    expect(consultancy).toContain("reviews");
    expect(construction).not.toContain("reviews");
  });

  it("a null segment (legacy org) hides segment-gated tabs", () => {
    const caps = capsFor(baseSession("pm"));
    const cat = [reviewsTab(["consultancy"])];
    expect(visibleTabs(caps, "consultant", undefined, null, cat).map(t => t.id)).not.toContain("reviews");
  });

  it("tabs without a segments field pass for every org (back-compat)", () => {
    const caps = capsFor(baseSession("pm"));
    const cat = [{ id: "overview", label: "Overview", icon: "dashboard" as const }];
    expect(visibleTabs(caps, "consultant", undefined, "construction", cat).map(t => t.id)).toContain("overview");
  });

  it("omitting segment entirely is identical to null (no regressions)", () => {
    const caps = capsFor(baseSession("pm"));
    const cat = [reviewsTab(["consultancy"])];
    const withArg = visibleTabs(caps, "consultant", undefined, null, cat).map(t => t.id);
    const without = visibleTabs(caps, "consultant", undefined, undefined, cat).map(t => t.id);
    expect(without).toEqual(withArg);
  });
});

describe("v4 C1 — consultancy / design engagement tabs", () => {
  const proPlan = () => true;
  const basicPlan = () => false;
  const C1_TABS = ["phases", "time", "deliverables", "reviews"] as const;

  it("consultant_head sees all 4 C1 tabs on consultant + design projects (Pro plan)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    for (const type of ["consultant", "design"] as const) {
      const ids = visibleTabs(caps, type, proPlan).map(t => t.id);
      for (const tab of C1_TABS) {
        expect(ids, `type=${type} tab=${tab}`).toContain(tab);
      }
    }
  });

  it("C1 tabs never appear on construction projects (project-type gate)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    const ids = visibleTabs(caps, "construction", proPlan).map(t => t.id);
    for (const tab of C1_TABS) {
      expect(ids, `tab=${tab}`).not.toContain(tab);
    }
  });

  it("a contributor (consultant) sees deliverables + reviews + time but not phases", () => {
    const caps = capsFor(baseSession("consultant"));
    const ids = visibleTabs(caps, "consultant", proPlan).map(t => t.id);
    expect(ids).toContain("deliverables");
    expect(ids).toContain("reviews");
    expect(ids).toContain("time");
    expect(ids).not.toContain("phases");   // phase:manage is manager-only
  });

  it("client sees only the reviews tab (review:comment)", () => {
    const caps = capsFor(baseSession("client"));
    const ids = visibleTabs(caps, "consultant", proPlan).map(t => t.id);
    expect(ids).toContain("reviews");
    expect(ids).not.toContain("phases");
    expect(ids).not.toContain("time");
    expect(ids).not.toContain("deliverables");
  });

  it("C1 tabs hide on a Basic plan even for consultant_head (plan-feature gate)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    const ids = visibleTabs(caps, "consultant", basicPlan).map(t => t.id);
    for (const tab of C1_TABS) {
      expect(ids, `tab=${tab}`).not.toContain(tab);
    }
  });
});

describe("v4 C2 — consultancy billing tab", () => {
  const proPlan = () => true;

  it("manager roles see the billing tab on consultant + design projects (requiresAny)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    for (const type of ["consultant", "design"] as const) {
      const ids = visibleTabs(caps, type, proPlan).map(t => t.id);
      expect(ids, `type=${type}`).toContain("billing");
    }
  });

  it("billing tab requires ANY of rate/retainer/billing caps — contributor gets none", () => {
    const caps = capsFor(baseSession("consultant"));
    const ids = visibleTabs(caps, "consultant", proPlan).map(t => t.id);
    expect(ids).not.toContain("billing");
    expect(caps.has("rate:manage")).toBe(false);
    expect(caps.has("retainer:manage")).toBe(false);
    expect(caps.has("billing:generate")).toBe(false);
  });

  it("billing tab never appears on construction projects (project-type gate)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    const ids = visibleTabs(caps, "construction", proPlan).map(t => t.id);
    expect(ids).not.toContain("billing");
  });

  it("billing tab has no plan feature — visible even on Basic plan (internal PlanGate per section)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    const ids = visibleTabs(caps, "consultant", () => false).map(t => t.id);
    expect(ids).toContain("billing");
  });

  it("a pm with only billing:generate can still see the tab (requiresAny union)", () => {
    // Project-tier caps for pm include all C2 manager caps; simulate a custom
    // role that holds just one of the three.
    const onlyGenerate = new Set<Capability>(["billing:generate"]);
    const ids = visibleTabs(onlyGenerate, "consultant", proPlan).map(t => t.id);
    expect(ids).toContain("billing");
  });
});

describe("v4 D3 — FF&E schedule tab", () => {
  const proPlan = () => true;

  it("manager roles holding ffe:manage see the FF&E tab on design + interior projects", () => {
    for (const role of ["design_head", "consultant_head", "project_admin", "orgadmin"] as const) {
      const caps = capsFor(baseSession(role));
      expect(caps.has("ffe:manage"), `role=${role}`).toBe(true);
      for (const type of ["design", "interior"] as const) {
        const ids = visibleTabs(caps, type, proPlan).map(t => t.id);
        expect(ids, `role=${role} type=${type}`).toContain("ffe");
      }
    }
  });

  it("FF&E tab never appears on construction projects (project-type gate)", () => {
    const caps = capsFor(baseSession("design_head"));
    const ids = visibleTabs(caps, "construction", proPlan).map(t => t.id);
    expect(ids).not.toContain("ffe");
  });

  it("pm does NOT hold ffe:manage (procurement:view only) so does not see the tab", () => {
    const caps = capsFor(baseSession("pm"));
    expect(caps.has("ffe:manage")).toBe(false);
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("ffe");
  });

  it("contributors (designer) without ffe:manage do not see the FF&E tab", () => {
    const caps = capsFor(baseSession("designer"));
    expect(caps.has("ffe:manage")).toBe(false);
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("ffe");
  });

  it("client does not see the FF&E tab", () => {
    const caps = capsFor(baseSession("client"));
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("ffe");
  });

  it("FF&E tab hides on a Basic plan even for design_head (plan-feature gate)", () => {
    const caps = capsFor(baseSession("design_head"));
    const ids = visibleTabs(caps, "design", () => false).map(t => t.id);
    expect(ids).not.toContain("ffe");
  });

  it("FF&E tab has no segment gate (org-segment agnostic, project-type based)", () => {
    const def = tabById("ffe");
    expect(def?.segments).toBeUndefined();
  });
});

describe("v4 D4 — statutory approvals tab", () => {
  const proPlan = () => true;

  it("manager roles holding statutory:manage see the Statutory tab on design + interior + construction projects", () => {
    for (const role of ["design_head", "consultant_head", "project_admin", "orgadmin"] as const) {
      const caps = capsFor(baseSession(role));
      expect(caps.has("statutory:manage"), `role=${role}`).toBe(true);
      for (const type of ["design", "interior", "construction"] as const) {
        const ids = visibleTabs(caps, type, proPlan).map(t => t.id);
        expect(ids, `role=${role} type=${type}`).toContain("statutory");
      }
    }
  });

  it("pm does NOT hold statutory:manage (procurement:view only) so does not see the tab", () => {
    const caps = capsFor(baseSession("pm"));
    expect(caps.has("statutory:manage")).toBe(false);
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("statutory");
  });

  it("contributors (designer) without statutory:manage do not see the tab", () => {
    const caps = capsFor(baseSession("designer"));
    expect(caps.has("statutory:manage")).toBe(false);
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("statutory");
  });

  it("client does not see the Statutory tab", () => {
    const caps = capsFor(baseSession("client"));
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("statutory");
  });

  it("Statutory tab hides on a Basic plan even for design_head (plan-feature gate)", () => {
    const caps = capsFor(baseSession("design_head"));
    const ids = visibleTabs(caps, "design", () => false).map(t => t.id);
    expect(ids).not.toContain("statutory");
  });

  it("Statutory tab has no segment gate (project-type based)", () => {
    const def = tabById("statutory");
    expect(def?.segments).toBeUndefined();
  });
});

describe("visibleTabs — module gating (v4 Phase 3)", () => {
  const caps = capsFor(baseSession("pm"));
  const proPlan = () => true;

  it("back-compat: without a predicate, module-gated tabs still show (legacy callers)", () => {
    const ids = visibleTabs(caps, "construction", proPlan).map(t => t.id);
    expect(ids).toContain("fieldops");
    expect(ids).toContain("drawings");
    expect(ids).toContain("attendance");
  });

  it("hides a tab only when its owning module is disabled", () => {
    const onlySiteOps = (id: string) => id === "site_ops";
    const ids = visibleTabs(caps, "construction", proPlan, undefined, undefined, onlySiteOps).map(t => t.id);
    expect(ids).toContain("fieldops");        // site_ops on
    expect(ids).not.toContain("drawings");    // design off
    expect(ids).not.toContain("attendance");  // people off
    expect(ids).not.toContain("budget");      // finance off
  });

  it("shows every module-gated tab when the predicate is always true", () => {
    const ids = visibleTabs(caps, "construction", proPlan, undefined, undefined, () => true).map(t => t.id);
    expect(ids).toContain("fieldops");
    expect(ids).toContain("drawings");
    expect(ids).toContain("attendance");
  });

  it("core tabs (no moduleId) are never hidden by the module gate", () => {
    const ids = visibleTabs(caps, "construction", undefined, undefined, undefined, () => false).map(t => t.id);
    expect(ids).toContain("overview");
    expect(ids).toContain("team");
    expect(ids).not.toContain("fieldops");
  });

  it("isTabVisible honours the module predicate", () => {
    const allOff = () => false;
    expect(isTabVisible("drawings", caps, "construction", proPlan, undefined, undefined, allOff)).toBe(false);
    expect(isTabVisible("drawings", caps, "construction", proPlan, undefined, undefined, () => true)).toBe(true);
  });
});

describe("tab module ownership (v4 Phase 3)", () => {
  it("every declared moduleId on a tab is a valid ModuleId", () => {
    for (const t of TAB_CATALOG) {
      if (t.moduleId) expect(isModuleId(t.moduleId), `tab ${t.id} module=${t.moduleId}`).toBe(true);
    }
  });

  it("maps the C1–D registers to their owning modules", () => {
    expect(tabModuleId("drawings")).toBe("design");
    expect(tabModuleId("ffe")).toBe("design");
    expect(tabModuleId("phases")).toBe("consultancy");
    expect(tabModuleId("time")).toBe("consultancy");
    expect(tabModuleId("billing")).toBe("consultancy");
    expect(tabModuleId("statutory")).toBe("compliance");
    expect(tabModuleId("po")).toBe("procurement");
    expect(tabModuleId("budget")).toBe("finance");
    expect(tabModuleId("attendance")).toBe("people");
    expect(tabModuleId("fieldops")).toBe("site_ops");
  });

  it("core / always-on tabs have no owning module", () => {
    expect(tabModuleId("overview")).toBeUndefined();
    expect(tabModuleId("team")).toBeUndefined();
    expect(tabModuleId("milestones")).toBeUndefined();
  });

  it("unknown tab id yields no module", () => {
    expect(tabModuleId("nope")).toBeUndefined();
  });
});

describe("v4 Phase B — interior tabs (moodboards + rooms)", () => {
  const proPlan = () => true;

  it("manager roles holding ffe:manage see both interior tabs on design + interior projects", () => {
    for (const role of ["design_head", "consultant_head", "project_admin", "orgadmin"] as const) {
      const caps = capsFor(baseSession(role));
      expect(caps.has("ffe:manage"), `role=${role}`).toBe(true);
      for (const type of ["design", "interior"] as const) {
        const ids = visibleTabs(caps, type, proPlan).map(t => t.id);
        expect(ids, `role=${role} type=${type}`).toContain("moodboards");
        expect(ids, `role=${role} type=${type}`).toContain("rooms");
      }
    }
  });

  it("interior tabs never appear on construction projects (project-type gate)", () => {
    const caps = capsFor(baseSession("design_head"));
    const ids = visibleTabs(caps, "construction", proPlan).map(t => t.id);
    expect(ids).not.toContain("moodboards");
    expect(ids).not.toContain("rooms");
  });

  it("pm (no ffe:manage) does not see the interior tabs", () => {
    const caps = capsFor(baseSession("pm"));
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("moodboards");
    expect(ids).not.toContain("rooms");
  });

  it("client does not see the interior tabs", () => {
    const caps = capsFor(baseSession("client"));
    const ids = visibleTabs(caps, "design", proPlan).map(t => t.id);
    expect(ids).not.toContain("moodboards");
    expect(ids).not.toContain("rooms");
  });

  it("interior tabs hide on a Basic plan (plan-feature gate reuses ffe)", () => {
    const caps = capsFor(baseSession("design_head"));
    const ids = visibleTabs(caps, "design", () => false).map(t => t.id);
    expect(ids).not.toContain("moodboards");
    expect(ids).not.toContain("rooms");
  });

  it("interior tabs are owned by the design module", () => {
    expect(tabModuleId("moodboards")).toBe("design");
    expect(tabModuleId("rooms")).toBe("design");
  });
});

describe("v4 Phase C — consultancy inspection + reports tabs", () => {
  const proPlan = () => true;
  const basicPlan = () => false;
  const C_TABS = ["inspection", "reports"] as const;

  it("manager roles holding audit:manage see both tabs on consultant + design projects (Business plan)", () => {
    for (const role of ["consultant_head", "pm", "project_admin", "orgadmin"] as const) {
      const caps = capsFor(baseSession(role));
      expect(caps.has("audit:manage"), `role=${role}`).toBe(true);
      for (const type of ["consultant", "design"] as const) {
        const ids = visibleTabs(caps, type, proPlan).map(t => t.id);
        for (const tab of C_TABS) {
          expect(ids, `role=${role} type=${type} tab=${tab}`).toContain(tab);
        }
      }
    }
  });

  it("audit/reports tabs never appear on construction projects (project-type gate)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    const ids = visibleTabs(caps, "construction", proPlan).map(t => t.id);
    for (const tab of C_TABS) expect(ids).not.toContain(tab);
  });

  it("contributors (consultant) do not hold audit:manage so don't see the tabs", () => {
    const caps = capsFor(baseSession("consultant"));
    expect(caps.has("audit:manage")).toBe(false);
    const ids = visibleTabs(caps, "consultant", proPlan).map(t => t.id);
    for (const tab of C_TABS) expect(ids).not.toContain(tab);
  });

  it("client does not see the audit tabs", () => {
    const caps = capsFor(baseSession("client"));
    const ids = visibleTabs(caps, "consultant", proPlan).map(t => t.id);
    for (const tab of C_TABS) expect(ids).not.toContain(tab);
  });

  it("audit tabs hide on a Basic plan (plan-feature gate audit_reports)", () => {
    const caps = capsFor(baseSession("consultant_head"));
    const ids = visibleTabs(caps, "consultant", basicPlan).map(t => t.id);
    for (const tab of C_TABS) expect(ids).not.toContain(tab);
  });

  it("audit/reports tabs are owned by the consultancy module", () => {
    expect(tabModuleId("inspection")).toBe("consultancy");
    expect(tabModuleId("reports")).toBe("consultancy");
  });
});
