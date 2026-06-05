// Throwaway codegen: emits docs/ROLE_FEATURES.md from the LIVE permissions
// matrix + the shared capability labels so the founder reference can never
// drift from the code. Run explicitly:
//   npx vitest run tests/_gen/roleFeatures.gen.test.ts
// (Excluded from the default suite via vitest.config.js — it writes a file.)

import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  IDENTITY_ROLES, ROLE_LABEL, ROLE_CATEGORY,
  CAPABILITIES,
  baseCapabilitiesFor, capabilityGroups, capabilityLabel,
  type IdentityRole,
} from "@/auth";

// One-line role descriptions (founder-facing).
const ROLE_DESC: Record<string, string> = {
  superadmin: "Platform owner (you). Full access to every org + every feature.",
  orgadmin: "Firm owner / workspace admin. Runs the org — members, billing, settings.",
  promoter: "Paying builder / firm owner. Gets the 7am WhatsApp digest; finance + handover view. Owns the org but rarely logs in.",
  project_admin: "Back-office paperwork — invoices, RA bills, RERA / GST / EPFO filings.",
  prospector: "Sales / BD. Creates draft projects for prospects; minimal access.",
  pm: "Project Manager. Runs project execution end-to-end (absorbed Project Head — full approval power).",
  architect: "Drawings + RFIs + BOQ + change orders.",
  senior_architect: "Senior architect — supervises juniors, approves RFIs + change orders.",
  junior_architect: "Junior architect — drafting + drawing revisions.",
  design_architect_interior: "Interior design lead (absorbed Interior Designer) — drawings + materials.",
  design_head: "Design Project lead — runs the design team.",
  consultant_head: "Consultant Project lead.",
  mep_consultant: "MEP (mechanical / electrical / plumbing) consultant.",
  structural_consultant: "Structural engineer / consultant.",
  consultant: "Generic consultant — markup + RFIs.",
  designer: "Designer (design projects) — drawings + updates.",
  site_engineer: "The field role. Files DPRs (voice + photo), runs site ops + attendance (absorbed Site Supervisor + Civil Engineer).",
  contractor: "Contractor — updates, attendance, RA bills, photos.",
  sub_contractor: "Sub-contractor — updates, attendance, RFIs, photos.",
  vendor: "Material supplier — vendor portal: quotes, invoices, price master.",
  client: "Unit buyer — read-only progress + payments + handover; client portal.",
  site_inspector: "External RERA / govt inspector — read-only audit + RERA filing.",
};

const CATEGORY_ORDER = ["platform","org-leadership","project-execution","design-discipline","engineering-discipline","field-supervision","supply-chain","external"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  platform: "Platform", "org-leadership": "Org Leadership",
  "project-execution": "Architecture & Project Execution", "design-discipline": "Design",
  "engineering-discipline": "Engineering & Field", "field-supervision": "Field Supervision",
  "supply-chain": "Supply Chain", external: "External / Clients",
};

function featureLines(role: IdentityRole): string[] {
  const caps = baseCapabilitiesFor(role);
  const lines: string[] = [];
  for (const group of capabilityGroups()) {
    const items = group.capabilities.filter(c => caps.has(c)).map(capabilityLabel);
    if (items.length) lines.push(`- **${group.label}:** ${items.join(", ")}`);
  }
  return lines;
}

it("generates docs/ROLE_FEATURES.md from the live permissions matrix", () => {
  const out: string[] = [];
  out.push("# Role → Features Reference");
  out.push("");
  out.push("*Auto-generated from `src/auth/permissions-matrix.ts` + `capabilityLabels.ts`");
  out.push("— the single source of truth. Do not hand-edit; regenerate after a role change.*");
  out.push("");
  out.push("## How to read this");
  out.push("");
  out.push("SiteTrack has a **3-axis** role model — a user can hold a role at the");
  out.push("identity, org, and project level, and their real access is the **union**");
  out.push("of all three. The features below show the **base set a role gets when");
  out.push("provisioned the normal way**. A superadmin can further grant/revoke any");
  out.push("feature per role from **Role Permissions** (`/admin/roles`, migration 69).");
  out.push("");
  out.push(`**22 roles · ${CAPABILITIES.length} total capabilities.** Consolidated 2026-06-04.`);
  out.push("");

  out.push("## Quick index");
  out.push("");
  out.push("| Role | What they are | Features |");
  out.push("|---|---|---|");
  for (const role of IDENTITY_ROLES) {
    const n = role === "superadmin" ? CAPABILITIES.length : baseCapabilitiesFor(role).size;
    out.push(`| **${ROLE_LABEL[role]}** (\`${role}\`) | ${ROLE_DESC[role] ?? ""} | ${n} |`);
  }
  out.push("");

  for (const cat of CATEGORY_ORDER) {
    const roles = IDENTITY_ROLES.filter(r => ROLE_CATEGORY[r] === cat);
    if (!roles.length) continue;
    out.push(`## ${CATEGORY_LABEL[cat]}`);
    out.push("");
    for (const role of roles) {
      out.push(`### ${ROLE_LABEL[role]} \`${role}\``);
      out.push("");
      out.push(`*${ROLE_DESC[role] ?? ""}*`);
      out.push("");
      if (role === "superadmin") {
        out.push("- **Everything.** Full platform + every org + every feature, including impersonation, cross-org audit, and role-permission config.");
      } else {
        out.push(...featureLines(role));
      }
      out.push("");
    }
  }

  out.push("## Notes");
  out.push("");
  out.push("- **Customisable.** A superadmin can grant/revoke any feature to any role");
  out.push("  per org (or globally) at `/admin/roles` — these overrides layer on top");
  out.push("  of the defaults below without a code change (migration 69).");
  out.push("- **Promoter = firm owner.** Provisioned as org `admin`, so they *can* do");
  out.push("  everything in their org — the finance-first dashboard is a UI choice.");
  out.push("- **site_engineer** is the single field role (absorbed site_supervisor +");
  out.push("  civil_engineer); it owns the voice-DPR wedge. **pm** absorbed project_head.");
  out.push("- Read-only roles (client, site_inspector, prospector) deliberately lack");
  out.push("  edit/approve features — least-privilege by design.");
  out.push("");
  out.push("*Regenerate after any role/capability change:");
  out.push("`npx vitest run tests/_gen/roleFeatures.gen.test.ts`*");
  out.push("");

  writeFileSync(join(process.cwd(), "docs", "ROLE_FEATURES.md"), out.join("\n"), "utf8");
  expect(out.length).toBeGreaterThan(50);
});
