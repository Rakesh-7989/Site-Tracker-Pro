// SiteTrack Pro — permissions matrix coverage tests.
//
// Asserts that every role in every tier has an entry + at least one
// capability, AND that role-specific intent is preserved (e.g. client
// is read-only, site_inspector cannot edit drawings, etc.).

import { describe, it, expect } from "vitest";
import {
  IDENTITY_ROLES,
  PROJECT_TIER_ROLES,
  type IdentityRole,
  type ProjectTierRole,
} from "@/auth/roles";
import {
  identityCapabilities,
  projectTierCapabilities,
} from "@/auth/permissions-matrix";

describe("Identity-tier coverage", () => {
  it("every role has at least one capability", () => {
    for (const r of IDENTITY_ROLES) {
      const caps = identityCapabilities(r);
      expect(caps.length, `role=${r}`).toBeGreaterThan(0);
    }
  });

  it("superadmin holds EVERY capability", () => {
    const caps = identityCapabilities("superadmin");
    // Superadmin gets the full set — should match CAPABILITIES length.
    expect(caps.length).toBeGreaterThan(50);   // sanity: matrix grew past 50
  });

  it("project:delete is superadmin-only (irreversible)", () => {
    expect(identityCapabilities("superadmin")).toContain("project:delete" as never);
    for (const r of IDENTITY_ROLES) {
      if (r === "superadmin") continue;
      expect(identityCapabilities(r), `role=${r}`).not.toContain("project:delete" as never);
    }
  });

  it("prospector cannot resolve issues / edit progress (sales-only); has export", () => {
    const caps = identityCapabilities("prospector");
    expect(caps).not.toContain("issue:resolve" as never);
    expect(caps).not.toContain("progress:edit" as never);
    expect(caps).toContain("export:pdf" as never);
    expect(caps).toContain("export:csv" as never);
  });

  it("client is read-mostly (no progress edit, no issue resolve)", () => {
    const caps = identityCapabilities("client");
    expect(caps).not.toContain("progress:edit" as never);
    expect(caps).not.toContain("issue:resolve" as never);
    expect(caps).not.toContain("milestone:add" as never);
    expect(caps).toContain("handover:view" as never);
  });

  it("site_engineer has DPR submit + voice + photo (absorbed site_supervisor)", () => {
    const caps = identityCapabilities("site_engineer");
    expect(caps).toContain("dpr:submit" as never);
    expect(caps).toContain("voice:record" as never);
    expect(caps).toContain("photo:upload" as never);
    expect(caps).not.toContain("dpr:approve" as never); // SoD: submits, pm approves
  });

  it("promoter receives digest + sees finance (paying customer)", () => {
    const caps = identityCapabilities("promoter");
    expect(caps).toContain("digest:receive" as never);
    expect(caps).toContain("budget:view" as never);
    expect(caps).toContain("handover:view" as never);
    expect(caps).not.toContain("progress:edit" as never);   // not an editor
  });

  it("site_inspector is read + audit ONLY (no RERA filing, no drawing edit, no progress)", () => {
    const caps = identityCapabilities("site_inspector");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).toContain("audit:read" as never);
    expect(caps).not.toContain("rera:file" as never);   // external role files nothing; project_admin files RERA
    expect(caps).not.toContain("drawings:edit" as never);
    expect(caps).not.toContain("progress:edit" as never);
  });

  it("contractor can submit updates + RA bills but cannot manage team", () => {
    const caps = identityCapabilities("contractor");
    expect(caps).toContain("update:add" as never);
    expect(caps).toContain("rabill:create" as never);
    expect(caps).not.toContain("rabill:approve" as never);
    expect(caps).not.toContain("team:manage" as never);
    expect(caps).not.toContain("expense:approve" as never);
  });

  it("project_admin can approve POs but not self-approved invoices/RA bills (SoD)", () => {
    const caps = identityCapabilities("project_admin");
    expect(caps).toContain("po:approve" as never);
    expect(caps).toContain("invoice:create" as never);
    expect(caps).not.toContain("invoice:approve" as never); // SoD: create != approve
    expect(caps).toContain("rabill:create" as never);
    expect(caps).not.toContain("rabill:approve" as never);  // SoD: create != approve
    expect(caps).not.toContain("changeorder:approve" as never);
  });
});

describe("Project-tier coverage", () => {
  it("every project role has at least one capability", () => {
    for (const r of PROJECT_TIER_ROLES) {
      expect(projectTierCapabilities(r).length, `role=${r}`).toBeGreaterThan(0);
    }
  });
  it("site_engineer (project tier) carries the Sprint 2 DPR flow", () => {
    const caps = projectTierCapabilities("site_engineer");
    expect(caps).toContain("dpr:submit" as never);
    expect(caps).toContain("voice:record" as never);
    expect(caps).toContain("photo:upload" as never);
    expect(caps).not.toContain("dpr:approve" as never); // SoD: submits, pm approves
  });
  it("client (project tier) is read + handover-only", () => {
    const caps = projectTierCapabilities("client");
    expect(caps).toContain("dpr:view" as never);
    expect(caps).toContain("handover:view" as never);
    expect(caps).not.toContain("progress:edit" as never);
  });
  it("site_inspector (project tier) cannot edit drawings", () => {
    const caps = projectTierCapabilities("site_inspector");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).not.toContain("rera:file" as never);   // read-only on project too
    expect(caps).not.toContain("drawings:edit" as never);
    expect(caps).not.toContain("drawings:release" as never);
  });
  it("senior_architect (project tier) supersedes architect (more approve caps)", () => {
    const a = projectTierCapabilities("architect");
    const s = projectTierCapabilities("senior_architect");
    expect(s.length).toBeGreaterThan(a.length);
    expect(s).toContain("rfi:close" as never);
    expect(s).toContain("changeorder:approve" as never);
    expect(a).not.toContain("changeorder:approve" as never);
  });
});

// Vendor capability split (founder decision 2026-06-06):
//   vendor:manage = curate the directory (/vendors page). Admins + prospector only.
//   vendor:select = pick a vendor inside a PO / material / invoice form. Broader.
describe("Vendor capability split", () => {
  it("vendor:manage is restricted to admins + prospector", () => {
    expect(identityCapabilities("orgadmin")).toContain("vendor:manage" as never);
    expect(identityCapabilities("prospector")).toContain("vendor:manage" as never);
    expect(identityCapabilities("pm")).not.toContain("vendor:manage" as never);
    expect(identityCapabilities("contractor")).not.toContain("vendor:manage" as never);
    expect(identityCapabilities("site_engineer")).not.toContain("vendor:manage" as never);
    expect(identityCapabilities("client")).not.toContain("vendor:manage" as never);
  });

  it("vendor:select is broad — every role that creates POs / materials / invoices gets it", () => {
    expect(identityCapabilities("pm")).toContain("vendor:select" as never);
    expect(identityCapabilities("contractor")).toContain("vendor:select" as never);
    expect(identityCapabilities("site_engineer")).toContain("vendor:select" as never);
    expect(identityCapabilities("project_admin")).toContain("vendor:select" as never);
    expect(identityCapabilities("design_architect_interior")).toContain("vendor:select" as never);
    expect(identityCapabilities("orgadmin")).toContain("vendor:select" as never);
    expect(identityCapabilities("prospector")).toContain("vendor:select" as never);
    expect(projectTierCapabilities("pm")).toContain("vendor:select" as never);
    expect(projectTierCapabilities("contractor")).toContain("vendor:select" as never);
    expect(projectTierCapabilities("site_engineer")).toContain("vendor:select" as never);
    expect(projectTierCapabilities("project_admin")).toContain("vendor:select" as never);
  });

  it("clients + read-only roles never get vendor:select", () => {
    expect(identityCapabilities("client")).not.toContain("vendor:select" as never);
    expect(identityCapabilities("site_inspector")).not.toContain("vendor:select" as never);
    expect(projectTierCapabilities("client")).not.toContain("vendor:select" as never);
  });
});

describe("Session gap fixes — material:price:view on changeorder roles", () => {
  const coRoles = [
    "senior_architect", "architect", "design_head", "consultant_head",
    "mep_consultant", "structural_consultant", "contractor",
  ] as const;
  for (const role of coRoles) {
    it(`${role} (identity) has material:price:view for changeorder context`, () => {
      expect(identityCapabilities(role)).toContain("material:price:view" as never);
    });
  }
  const projRoles = [
    "senior_architect", "design_head", "consultant_head",
    "mep_consultant", "structural_consultant", "contractor",
  ] as const;
  for (const role of projRoles) {
    it(`${role} (project) has material:price:view`, () => {
      expect(projectTierCapabilities(role)).toContain("material:price:view" as never);
    });
  }
  // architect has material:price:view in identity tier only (project tier lacks changeorder:create)
  it("architect (project) does NOT get material:price:view (no changeorder:create at project tier)", () => {
    expect(projectTierCapabilities("architect")).not.toContain("material:price:view" as never);
  });
});

describe("Session gap fixes — pm compliance + safety", () => {
  it("pm (identity) has compliance:view + safety:close", () => {
    const caps = identityCapabilities("pm");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).toContain("safety:close" as never);
  });
  it("pm (project) has compliance:view + safety:close", () => {
    const caps = projectTierCapabilities("pm");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).toContain("safety:close" as never);
  });
});

describe("Session gap fixes — site_engineer safety:close + material:price:view", () => {
  it("site_engineer (identity) has safety:close + material:price:view", () => {
    const caps = identityCapabilities("site_engineer");
    expect(caps).toContain("safety:close" as never);
    expect(caps).toContain("material:price:view" as never);
  });
  it("site_engineer (project) has safety:close + material:price:view", () => {
    const caps = projectTierCapabilities("site_engineer");
    expect(caps).toContain("safety:close" as never);
    expect(caps).toContain("material:price:view" as never);
  });
});

describe("Session gap fixes — junior_architect rfi:respond + issue:add", () => {
  it("junior_architect (identity) has rfi:respond + issue:add", () => {
    const caps = identityCapabilities("junior_architect");
    expect(caps).toContain("rfi:respond" as never);
    expect(caps).toContain("issue:add" as never);
  });
  it("junior_architect (project) has rfi:respond + issue:add", () => {
    const caps = projectTierCapabilities("junior_architect");
    expect(caps).toContain("rfi:respond" as never);
    expect(caps).toContain("issue:add" as never);
  });
});

describe("Session gap fixes — designer rfi:create", () => {
  it("designer (identity) has rfi:create", () => {
    expect(identityCapabilities("designer")).toContain("rfi:create" as never);
  });
  it("designer (project) has rfi:create", () => {
    expect(projectTierCapabilities("designer")).toContain("rfi:create" as never);
  });
});

describe("Session gap fixes — prospector messaging", () => {
  it("prospector (identity) has message:send + whatsapp:send", () => {
    const caps = identityCapabilities("prospector");
    expect(caps).toContain("message:send" as never);
    expect(caps).toContain("whatsapp:send" as never);
  });
});

// ── v4 C1 consultancy capabilities (2026-07-31) ──────────────────────────────
// Fee phases + billable time + deliverables + review rounds + utilization.
// Contributor tier: log time / create deliverables / comment on reviews.
// Manager tier: manage time+phases, approve deliverables, manage reviews,
// view utilization (heads + pm + project_admin + orgadmin).
const C1_CONTRIBUTOR = ["time:log", "deliverable:manage", "review:comment"] as const;
const C1_MANAGER = [
  "time:manage", "phase:manage", "deliverable:approve", "review:manage", "utilization:view",
] as const;
const C1_CONTRIBUTOR_ROLES = [
  "architect", "senior_architect", "junior_architect",
  "designer", "consultant", "mep_consultant", "structural_consultant",
] as const;
const C1_MANAGER_ROLES = ["design_head", "consultant_head", "pm", "project_admin"] as const;

describe("v4 C1 — consultancy capability assignment (identity tier)", () => {
  for (const role of C1_CONTRIBUTOR_ROLES) {
    it(`${role} is a consultancy contributor`, () => {
      const caps = identityCapabilities(role);
      for (const c of C1_CONTRIBUTOR) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    });
  }
  for (const role of C1_MANAGER_ROLES) {
    it(`${role} is a consultancy manager (contributor + manager caps)`, () => {
      const caps = identityCapabilities(role);
      for (const c of C1_CONTRIBUTOR) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
      for (const c of C1_MANAGER) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    });
  }
  it("orgadmin is a consultancy manager", () => {
    const caps = identityCapabilities("orgadmin");
    for (const c of [...C1_CONTRIBUTOR, ...C1_MANAGER]) {
      expect(caps, `cap=${c}`).toContain(c as never);
    }
  });
  it("client can comment on review rounds but cannot manage/approve", () => {
    const caps = identityCapabilities("client");
    expect(caps).toContain("review:comment" as never);
    expect(caps).not.toContain("review:manage" as never);
    expect(caps).not.toContain("deliverable:approve" as never);
    expect(caps).not.toContain("time:log" as never);
  });
});

describe("v4 C1 — consultancy capability assignment (project tier)", () => {
  it("mirrors the identity-tier assignment on a project", () => {
    for (const role of C1_CONTRIBUTOR_ROLES) {
      const caps = projectTierCapabilities(role);
      for (const c of C1_CONTRIBUTOR) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    }
    for (const role of C1_MANAGER_ROLES) {
      const caps = projectTierCapabilities(role);
      for (const c of C1_MANAGER) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    }
  });
  it("client (project) can comment on review rounds but not manage", () => {
    const caps = projectTierCapabilities("client");
    expect(caps).toContain("review:comment" as never);
    expect(caps).not.toContain("review:manage" as never);
  });
});

describe("v4 C1 — no dead capabilities", () => {
  it("each new cap is granted to at least one identity role", () => {
    for (const cap of [...C1_CONTRIBUTOR, ...C1_MANAGER]) {
      const granted = IDENTITY_ROLES.some(r => identityCapabilities(r).includes(cap as never));
      expect(granted, `cap=${cap}`).toBe(true);
    }
  });
  it("each new cap is denied to at least one identity role", () => {
    for (const cap of [...C1_CONTRIBUTOR, ...C1_MANAGER]) {
      const denied = IDENTITY_ROLES.some(r => !identityCapabilities(r).includes(cap as never));
      expect(denied, `cap=${cap}`).toBe(true);
    }
  });
});

// ── v4 C2 consultancy billing capabilities (2026-07-31) ──────────────────────
// Rate cards + time-entry approval + retainer/hourly invoice generation.
// Manager tier only (heads + pm + project_admin + orgadmin); contributors log
// pending time but cannot approve, bill, or set rates; client sees none.
const C2_MANAGER = [
  "rate:manage", "time:approve", "retainer:manage", "billing:generate", "revenue:view",
] as const;
const C2_MANAGER_ROLES = ["design_head", "consultant_head", "pm", "project_admin"] as const;

describe("v4 C2 — billing capability assignment (identity tier)", () => {
  for (const role of C2_MANAGER_ROLES) {
    it(`${role} holds all C2 billing caps`, () => {
      const caps = identityCapabilities(role);
      for (const c of C2_MANAGER) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    });
  }
  it("orgadmin holds all C2 billing caps", () => {
    const caps = identityCapabilities("orgadmin");
    for (const c of C2_MANAGER) expect(caps, `cap=${c}`).toContain(c as never);
  });
  it("contributors get no C2 billing caps (log time, managers bill)", () => {
    for (const role of [...C1_CONTRIBUTOR_ROLES, "client", "site_engineer", "contractor"] as const) {
      const caps = identityCapabilities(role);
      for (const c of C2_MANAGER) expect(caps, `role=${role} cap=${c}`).not.toContain(c as never);
    }
  });
});

describe("v4 C2 — billing capability assignment (project tier)", () => {
  it("mirrors the identity-tier assignment on a project", () => {
    for (const role of C2_MANAGER_ROLES) {
      const caps = projectTierCapabilities(role);
      for (const c of C2_MANAGER) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    }
  });
  it("client (project) holds no C2 billing caps", () => {
    const caps = projectTierCapabilities("client");
    for (const c of C2_MANAGER) expect(caps, `cap=${c}`).not.toContain(c as never);
  });
});

describe("v4 C2 — no dead capabilities", () => {
  it("each C2 cap is granted to at least one identity role", () => {
    for (const cap of C2_MANAGER) {
      const granted = IDENTITY_ROLES.some(r => identityCapabilities(r).includes(cap as never));
      expect(granted, `cap=${cap}`).toBe(true);
    }
  });
  it("each C2 cap is denied to at least one identity role", () => {
    for (const cap of C2_MANAGER) {
      const denied = IDENTITY_ROLES.some(r => !identityCapabilities(r).includes(cap as never));
      expect(denied, `cap=${cap}`).toBe(true);
    }
  });
});

// ── v4 D architecture segment capabilities (2026-08-04) ──────────────────────
// FF&E schedules + statutory/NOC approvals + procurement quote compare.
// Design-heads / project-admin / orgadmin own the registers; PM gets
// procurement:view only (procurement is a finance/proc action, while FF&E +
// statutory are design-register ownership); contributors + client see none.
const D_MANAGER = ["ffe:manage", "statutory:manage", "procurement:view"] as const;
const D_MANAGER_ROLES = ["design_head", "consultant_head", "project_admin", "design_architect_interior"] as const;

describe("v4 D — architecture capability assignment (identity tier)", () => {
  for (const role of D_MANAGER_ROLES) {
    it(`${role} holds all D architecture caps`, () => {
      const caps = identityCapabilities(role);
      for (const c of D_MANAGER) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    });
  }
  it("orgadmin holds all D architecture caps", () => {
    const caps = identityCapabilities("orgadmin");
    for (const c of D_MANAGER) expect(caps, `cap=${c}`).toContain(c as never);
  });
  it("pm holds procurement:view but not the design-register caps", () => {
    const caps = identityCapabilities("pm");
    expect(caps).toContain("procurement:view" as never);
    expect(caps).not.toContain("ffe:manage" as never);
    expect(caps).not.toContain("statutory:manage" as never);
  });
  it("contributors + client get no D architecture caps", () => {
    for (const role of [...C1_CONTRIBUTOR_ROLES, "client", "site_engineer", "contractor"] as const) {
      const caps = identityCapabilities(role);
      for (const c of D_MANAGER) expect(caps, `role=${role} cap=${c}`).not.toContain(c as never);
    }
  });
});

describe("D — architecture capability assignment (project tier)", () => {
  it("mirrors the identity-tier assignment on a project", () => {
    for (const role of D_MANAGER_ROLES) {
      const caps = projectTierCapabilities(role);
      for (const c of D_MANAGER) expect(caps, `role=${role} cap=${c}`).toContain(c as never);
    }
  });
  it("project-tier pm holds procurement:view only", () => {
    const caps = projectTierCapabilities("pm");
    expect(caps).toContain("procurement:view" as never);
    expect(caps).not.toContain("ffe:manage" as never);
    expect(caps).not.toContain("statutory:manage" as never);
  });
  it("client (project) holds no D architecture caps", () => {
    const caps = projectTierCapabilities("client");
    for (const c of D_MANAGER) expect(caps, `cap=${c}`).not.toContain(c as never);
  });
});

describe("D — no dead capabilities", () => {
  it("each D cap is granted to at least one identity role", () => {
    for (const cap of D_MANAGER) {
      const granted = IDENTITY_ROLES.some(r => identityCapabilities(r).includes(cap as never));
      expect(granted, `cap=${cap}`).toBe(true);
    }
  });
  it("each D cap is denied to at least one identity role", () => {
    for (const cap of D_MANAGER) {
      const denied = IDENTITY_ROLES.some(r => !identityCapabilities(r).includes(cap as never));
      expect(denied, `cap=${cap}`).toBe(true);
    }
  });
});

// ── Separation of duties invariant (2026-08-04) ──────────────────────────────
// No ROLE IN THE SECURITY-ANALYSIS SCOPE may both CREATE and APPROVE the same
// financial document type in the resolved union (identity ∪ project tier).
// The 2026-06-21 RBAC security analysis targeted pm + project_admin (removed
// self-approval) and site_engineer/orgadmin; senior_architect deliberately
// keeps changeorder:create + changeorder:approve per founder intent
// (ROLE_FEATURES.md) and is NOT in scope. superadmin is the platform override.
const FINANCE_DOMAINS: Array<{ create: string; approve: string }> = [
  { create: "po:create", approve: "po:approve" },
  { create: "changeorder:create", approve: "changeorder:approve" },
  { create: "rabill:create", approve: "rabill:approve" },
  { create: "invoice:create", approve: "invoice:approve" },
  { create: "expense:add", approve: "expense:approve" },
];

const SOD_SCOPE: readonly string[] = ["pm", "project_admin", "site_engineer", "orgadmin"];

describe("Separation of duties — no self-approval", () => {
  it("no in-scope role holds create + approve on the same finance domain", () => {
    for (const role of SOD_SCOPE) {
      const resolved = new Set(identityCapabilities(role as IdentityRole));
      if ((PROJECT_TIER_ROLES as readonly string[]).includes(role)) {
        for (const c of projectTierCapabilities(role as ProjectTierRole)) resolved.add(c);
      }
      for (const d of FINANCE_DOMAINS) {
        const hasCreate = resolved.has(d.create as never);
        const hasApprove = resolved.has(d.approve as never);
        expect(
          hasCreate && hasApprove,
          `SoD violation: ${role} can both ${d.create} and ${d.approve}`,
        ).toBe(false);
      }
    }
  });
});

// ── v4 Phase A — CRM & Sales capabilities (2026-08-07) ────────────────────────
// crm:view = see the org pipeline; crm:manage = create/update leads + meetings +
// quotations + agreements. Sales/BD (prospector) owns the pipeline; orgadmin
// manages; pm + project_admin see read-only context.
const CRM_MANAGE_ROLES = ["prospector", "orgadmin"] as const;
const CRM_VIEW_ONLY = ["pm", "project_admin"] as const;

describe("v4 A — CRM capability assignment (identity tier)", () => {
  for (const role of CRM_MANAGE_ROLES) {
    it(`${role} holds crm:view + crm:manage`, () => {
      const caps = identityCapabilities(role);
      expect(caps).toContain("crm:view" as never);
      expect(caps).toContain("crm:manage" as never);
    });
  }
  for (const role of CRM_VIEW_ONLY) {
    it(`${role} holds crm:view but not crm:manage`, () => {
      const caps = identityCapabilities(role);
      expect(caps).toContain("crm:view" as never);
      expect(caps).not.toContain("crm:manage" as never);
    });
  }
  it("project contributors / clients hold no CRM caps", () => {
    for (const role of [...C1_CONTRIBUTOR_ROLES, "client", "vendor", "sub_contractor", "superadmin"] as const) {
      // superadmin holds everything by construction — exclude from the deny check.
      if (role === "superadmin") continue;
      const caps = identityCapabilities(role);
      expect(caps, `role=${role}`).not.toContain("crm:view" as never);
      expect(caps, `role=${role}`).not.toContain("crm:manage" as never);
    }
  });
});

// research:view = read the org research library (documents, collections);
// research:manage = create/edit documents + collections, add/remove docs.
// orgadmin manages + holds view; pm + project_admin also manage; design /
// consultancy / field identities get read-only library access. prospector
// is excluded — sales owns CRM, not the technical library.
const RESEARCH_MANAGE_ROLES = ["orgadmin", "pm", "project_admin"] as const;
const RESEARCH_VIEW_ONLY = [
  "architect", "senior_architect", "design_architect_interior", "design_head",
  "consultant_head", "mep_consultant", "structural_consultant", "consultant",
  "site_engineer", "promoter",
] as const;
const RESEARCH_DENY_ROLES = ["junior_architect", "designer", "client", "vendor", "sub_contractor"] as const;

describe("v4 A — research capability assignment (identity tier)", () => {
  for (const role of RESEARCH_MANAGE_ROLES) {
    it(`${role} holds research:view + research:manage`, () => {
      const caps = identityCapabilities(role);
      expect(caps).toContain("research:view" as never);
      expect(caps).toContain("research:manage" as never);
    });
  }
  for (const role of RESEARCH_VIEW_ONLY) {
    it(`${role} holds research:view but not research:manage`, () => {
      const caps = identityCapabilities(role);
      expect(caps).toContain("research:view" as never);
      expect(caps).not.toContain("research:manage" as never);
    });
  }
  it("prospector + non-technical roles hold no research caps", () => {
    for (const role of [...RESEARCH_DENY_ROLES, "prospector"] as const) {
      const caps = identityCapabilities(role);
      expect(caps, `role=${role}`).not.toContain("research:view" as never);
      expect(caps, `role=${role}`).not.toContain("research:manage" as never);
    }
  });
});

describe("v4 A — no dead capabilities", () => {
  it("crm:view + crm:manage are granted to at least one identity role", () => {
    for (const cap of ["crm:view", "crm:manage"] as const) {
      const granted = IDENTITY_ROLES.some(r => identityCapabilities(r).includes(cap as never));
      expect(granted, `cap=${cap}`).toBe(true);
    }
  });
  it("crm:view + crm:manage are denied to at least one identity role", () => {
    for (const cap of ["crm:view", "crm:manage"] as const) {
      const denied = IDENTITY_ROLES.some(r => !identityCapabilities(r).includes(cap as never));
      expect(denied, `cap=${cap}`).toBe(true);
    }
  });
  it("research:view + research:manage are granted to at least one identity role", () => {
    for (const cap of ["research:view", "research:manage"] as const) {
      const granted = IDENTITY_ROLES.some(r => identityCapabilities(r).includes(cap as never));
      expect(granted, `cap=${cap}`).toBe(true);
    }
  });
  it("research:view + research:manage are denied to at least one identity role", () => {
    for (const cap of ["research:view", "research:manage"] as const) {
      const denied = IDENTITY_ROLES.some(r => !identityCapabilities(r).includes(cap as never));
      expect(denied, `cap=${cap}`).toBe(true);
    }
  });
});

describe("v4 C - consultancy audit capability (audit:manage, identity tier)", () => {
  it("manager + orgadmin roles hold audit:manage", () => {
    for (const role of ["consultant_head", "design_head", "pm", "project_admin", "orgadmin"] as const) {
      const caps = identityCapabilities(role);
      expect(caps, `role=${role}`).toContain("audit:manage" as never);
    }
  });
  it("contributors / clients / vendors hold no audit:manage", () => {
    for (const role of [...C1_CONTRIBUTOR_ROLES, "client", "vendor", "sub_contractor", "prospector"] as const) {
      const caps = identityCapabilities(role);
      expect(caps, `role=${role}`).not.toContain("audit:manage" as never);
    }
  });
  it("superadmin holds audit:manage (ALL by construction)", () => {
    expect(identityCapabilities("superadmin")).toContain("audit:manage" as never);
  });
});

describe("v4 C - no dead capability: audit:manage", () => {
  it("audit:manage is granted to at least one identity role", () => {
    const granted = IDENTITY_ROLES.some(r => identityCapabilities(r).includes("audit:manage" as never));
    expect(granted).toBe(true);
  });
  it("audit:manage is denied to at least one identity role", () => {
    const denied = IDENTITY_ROLES.some(r => !identityCapabilities(r).includes("audit:manage" as never));
    expect(denied).toBe(true);
  });
});

// v5 Phase B1 — Client Approval & Revision System capability assignment.
// drawing:comment = pin/reply/resolve comment threads on released drawings.
// drawing:approve = approve / reject / lock a drawing revision (final gate).
// share:link:manage = create / update / revoke project share links.
// Client reviews + approves drawings directly (the whole point of B1);
// managers (identity + project tier) approve/lock; contributors comment;
// external roles (vendor/sub_contractor/prospector) get none.
const B1_COMMENT_ROLES = [
  "orgadmin", "superadmin", "pm", "project_admin", "design_head", "consultant_head",
  "architect", "senior_architect", "junior_architect", "design_architect_interior",
  "designer", "consultant", "mep_consultant", "structural_consultant", "site_engineer",
  "client",
] as const;
const B1_APPROVE_ROLES = [
  "orgadmin", "superadmin", "pm", "project_admin", "design_head", "consultant_head",
  "architect", "senior_architect", "client",
] as const;
const B1_LINK_MANAGE_ROLES = [
  "orgadmin", "superadmin", "pm", "project_admin", "design_head", "consultant_head",
] as const;
const B1_DENY_ROLES = ["vendor", "sub_contractor", "prospector"] as const;

describe("v5 B1 - client approval capability assignment (identity tier)", () => {
  it("client holds drawing:comment + drawing:approve (core B1 review loop)", () => {
    const caps = identityCapabilities("client");
    expect(caps).toContain("drawing:comment" as never);
    expect(caps).toContain("drawing:approve" as never);
    expect(caps).not.toContain("share:link:manage" as never);
  });
  it("approve+manage roles hold all three B1 capabilities", () => {
    for (const role of B1_LINK_MANAGE_ROLES as readonly IdentityRole[]) {
      const caps = identityCapabilities(role);
      expect(caps, `role=${role}`).toContain("drawing:comment" as never);
      expect(caps, `role=${role}`).toContain("drawing:approve" as never);
      expect(caps, `role=${role}`).toContain("share:link:manage" as never);
    }
  });
  it("comment-only roles hold drawing:comment but not drawing:approve / share:link:manage", () => {
    for (const role of B1_COMMENT_ROLES as readonly IdentityRole[]) {
      if ((B1_APPROVE_ROLES as readonly string[]).includes(role)) continue;
      const caps = identityCapabilities(role);
      expect(caps, `role=${role}`).toContain("drawing:comment" as never);
      expect(caps, `role=${role}`).not.toContain("drawing:approve" as never);
      expect(caps, `role=${role}`).not.toContain("share:link:manage" as never);
    }
  });
  it("external roles hold none of the B1 capabilities", () => {
    for (const role of B1_DENY_ROLES as readonly IdentityRole[]) {
      const caps = identityCapabilities(role);
      for (const cap of ["drawing:comment", "drawing:approve", "share:link:manage"] as const) {
        expect(caps, `role=${role} cap=${cap}`).not.toContain(cap as never);
      }
    }
  });
  it("superadmin holds all three (ALL by construction)", () => {
    const caps = identityCapabilities("superadmin");
    for (const cap of ["drawing:comment", "drawing:approve", "share:link:manage"] as const) {
      expect(caps).toContain(cap as never);
    }
  });
});

describe("v5 B1 - client approval capability assignment (project tier)", () => {
  it("project-tier client holds drawing:comment + drawing:approve", () => {
    const caps = projectTierCapabilities("client");
    expect(caps).toContain("drawing:comment" as never);
    expect(caps).toContain("drawing:approve" as never);
    expect(caps).not.toContain("share:link:manage" as never);
  });
  it("project-tier managers hold all three B1 capabilities", () => {
    for (const role of ["pm", "project_admin", "design_head", "consultant_head"] as readonly ProjectTierRole[]) {
      const caps = projectTierCapabilities(role);
      expect(caps, `role=${role}`).toContain("drawing:comment" as never);
      expect(caps, `role=${role}`).toContain("drawing:approve" as never);
      expect(caps, `role=${role}`).toContain("share:link:manage" as never);
    }
  });
  it("project-tier contributors hold drawing:comment but not approve/manage", () => {
    for (const role of [
      "junior_architect", "design_architect_interior",
      "designer", "consultant", "mep_consultant", "structural_consultant", "site_engineer",
    ] as readonly ProjectTierRole[]) {
      const caps = projectTierCapabilities(role);
      expect(caps, `role=${role}`).toContain("drawing:comment" as never);
      expect(caps, `role=${role}`).not.toContain("drawing:approve" as never);
      expect(caps, `role=${role}`).not.toContain("share:link:manage" as never);
    }
  });
});

describe("v5 B1 - no dead capabilities", () => {
  it("all three B1 caps granted to at least one identity role", () => {
    for (const cap of ["drawing:comment", "drawing:approve", "share:link:manage"] as const) {
      const granted = IDENTITY_ROLES.some(r => identityCapabilities(r).includes(cap as never));
      expect(granted, `cap=${cap}`).toBe(true);
    }
  });
  it("all three B1 caps denied to at least one identity role", () => {
    for (const cap of ["drawing:comment", "drawing:approve", "share:link:manage"] as const) {
      const denied = IDENTITY_ROLES.some(r => !identityCapabilities(r).includes(cap as never));
      expect(denied, `cap=${cap}`).toBe(true);
    }
  });
});
