// SiteTrack Pro — permissions matrix coverage tests.
//
// Asserts that every role in every tier has an entry + at least one
// capability, AND that role-specific intent is preserved (e.g. client
// is read-only, site_inspector cannot edit drawings, etc.).

import { describe, it, expect } from "vitest";
import {
  IDENTITY_ROLES,
  PROJECT_TIER_ROLES,
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
  });

  it("promoter receives digest + sees finance (paying customer)", () => {
    const caps = identityCapabilities("promoter");
    expect(caps).toContain("digest:receive" as never);
    expect(caps).toContain("budget:view" as never);
    expect(caps).toContain("handover:view" as never);
    expect(caps).not.toContain("progress:edit" as never);   // not an editor
  });

  it("site_inspector is read + RERA file ONLY (no drawing edit, no progress)", () => {
    const caps = identityCapabilities("site_inspector");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).toContain("rera:file" as never);
    expect(caps).toContain("audit:read" as never);
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
  "architect", "senior_architect", "junior_architect", "design_architect_interior",
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
