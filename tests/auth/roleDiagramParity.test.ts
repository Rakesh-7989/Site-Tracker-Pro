// SiteTrack Pro — founder hand-drawn role diagram ↔ code catalog parity.
//
// Encodes the founder's hand-drawn "Role-Based" tree (site-tracker-Pro,
// photographed 2026-06-03) as the canonical source structure, then asserts
// the TS role catalog (src/auth/roles.ts) COVERS every box the founder drew.
//
// Decision (founder, 2026-06-04): RECONCILE, then CONSOLIDATE. The diagram
// is the source structure; the code keeps a few extras it omits (promoter =
// WhatsApp digest buyer, designer, consultant, pm). A second founder pass
// merged 4 redundant roles into survivors: site_supervisor + civil_engineer
// → site_engineer, project_head → pm, interior_designer →
// design_architect_interior. So this test checks COVERAGE (every drawn box
// exists), NOT equality (code is still a small deliberate superset).
//
// Why this test exists: it locks the founder's diagram to the code so a
// future refactor can't silently drop a role he explicitly drew. If a box
// here ever fails, either the catalog regressed or the diagram changed —
// both demand a conscious decision, not a silent drift.
//
// See docs/ROLE_DIAGRAM_RECONCILIATION.md for the full mapping table.

import { describe, it, expect } from "vitest";
import {
  IDENTITY_ROLES,
  PROJECT_TYPES,
  VALID_PROJECT_ROLES_BY_TYPE,
} from "@/auth/roles";

// ── The founder's diagram, transcribed to code role identifiers ────────────

// Top of the tree: identity / org-tier boxes drawn under "org admin".
// (super admin → org admin → {project admin, prospector, contractor→sub, vendors})
const DIAGRAM_ORG_BRANCH = [
  "superadmin",      // "super admin"
  "orgadmin",        // "org admin"
  "project_admin",   // "Project admin"
  "prospector",      // org box (founder confirmed: Sales/BD, not a new Inspector)
  "contractor",      // "Contractor"
  "sub_contractor",  // "Sub-contractor" (drawn under Contractor)
  "vendor",          // "vendors"
] as const;

// The four project-type subtrees, each listing exactly the roles the
// founder drew beneath that project box.
const DIAGRAM_PROJECT_TREE: Record<string, string[]> = {
  construction: [
    "architect", "senior_architect", "junior_architect",
    "mep_consultant", "structural_consultant",
    "site_engineer", "site_inspector", "client",
  ],
  interior: [
    "architect", "design_architect_interior",
    "site_engineer", "site_inspector", "client",
  ],
  design: [
    "design_head", "architect", "client",
  ],
  consultant: [
    "consultant_head", "architect", "client",
  ],
};

describe("Founder role diagram → catalog coverage (org branch)", () => {
  it("every org/identity box the founder drew exists in IDENTITY_ROLES", () => {
    for (const role of DIAGRAM_ORG_BRANCH) {
      expect(IDENTITY_ROLES).toContain(role as never);
    }
  });
});

describe("Founder role diagram → catalog coverage (project subtrees)", () => {
  it("all four drawn project types exist in PROJECT_TYPES", () => {
    for (const type of Object.keys(DIAGRAM_PROJECT_TREE)) {
      expect(PROJECT_TYPES).toContain(type as never);
    }
  });

  for (const [type, roles] of Object.entries(DIAGRAM_PROJECT_TREE)) {
    it(`${type}: every drawn role is valid for that project type`, () => {
      const valid = VALID_PROJECT_ROLES_BY_TYPE[type as keyof typeof VALID_PROJECT_ROLES_BY_TYPE];
      for (const role of roles) {
        expect(valid).toContain(role as never);
      }
    });
  }

  it("every drawn project role is also a real identity role", () => {
    const drawn = new Set(Object.values(DIAGRAM_PROJECT_TREE).flat());
    for (const role of drawn) {
      expect(IDENTITY_ROLES).toContain(role as never);
    }
  });
});

describe("Consolidation decision is explicit (2026-06-04)", () => {
  it("keeps promoter (digest buyer) + designer (design projects)", () => {
    expect(IDENTITY_ROLES).toContain("promoter" as never);
    expect(IDENTITY_ROLES).toContain("designer" as never);
  });
  it("site_engineer is the single field role — absorbed site_supervisor + civil_engineer", () => {
    expect(IDENTITY_ROLES).toContain("site_engineer" as never);
    expect(VALID_PROJECT_ROLES_BY_TYPE.construction).toContain("site_engineer");
  });
  it("the 4 consolidated roles are gone from the catalog", () => {
    for (const gone of ["site_supervisor", "project_head", "civil_engineer", "interior_designer"]) {
      expect(IDENTITY_ROLES).not.toContain(gone as never);
    }
  });
});
