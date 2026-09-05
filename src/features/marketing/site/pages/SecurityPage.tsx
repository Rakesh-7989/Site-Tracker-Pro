// SiteTrack Pro — /security page.
//
// Honest posture statement: every claim maps to a real technical control
// (most verified by automated harnesses against the production database).
// We deliberately do NOT claim certifications we do not hold.

import { Icon } from "@/components/ui/atoms";
import { PageHero, Section, SectionHeading, CtaBand, useSiteSeo } from "../ui";
import { CONTACT_EMAIL } from "@/features/marketing/legalContent";

interface Control {
  icon: "lock" | "shield" | "users" | "doc" | "check" | "eye";
  title: string;
  body: string;
}

const CONTROLS: Control[] = [
  {
    icon: "shield",
    title: "Tenant isolation at the row level",
    body: "Every organisation’s data is guarded by PostgreSQL Row Level Security. Policies scope reads and writes to the caller’s organisations and projects; cross-tenant access is tested by an automated matrix of 500+ assertions against the live database.",
  },
  {
    icon: "users",
    title: "Role-based access, fine-grained",
    body: "22 identity roles plus custom roles and per-capability grants. Each role sees exactly its surface — clients never hit finance tables, contractors never see payroll.",
  },
  {
    icon: "doc",
    title: "Immutable audit trail",
    body: "Important changes are recorded to an append-only audit log that is trigger-locked and grant-immutable. Trusted functions are pinned to a fixed search path to avoid privilege escalation.",
  },
  {
    icon: "check",
    title: "Financial-integrity guards",
    body: "Server-side guards cap payments at each invoice’s receivable, detect version conflicts on important records, and enforce lifecycle transitions and quota limits — reasoning that runs in the database, not only in the UI.",
  },
  {
    icon: "lock",
    title: "Encryption & transport",
    body: "All traffic is served over HTTPS. The platform runs on Supabase’s managed Postgres infrastructure, which encrypts data at rest and in transit.",
  },
  {
    icon: "eye",
    title: "Authentication & 2FA",
    body: "Email/password sign-in with session recovery, language-aware login lanes and two-factor authentication for user accounts.",
  },
];

export function SecurityPage(): JSX.Element {
  useSiteSeo("Security — SiteTrack Pro", "How SiteTrack Pro isolates tenants, controls access and audits change — row-level security, role-based access, immutable audits and financial-integrity guards.");

  return (
    <>
      <PageHero
        eyebrow="Security"
        title="Secure by default, verified by test"
        sub="SiteTrack Pro keeps the builder’s version of a bank vault: each organisation isolated from every other, every important change recorded, and the guarantees checked continuously."
      />

      <Section className="pt-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONTROLS.map((c) => (
          <div key={c.title} className="rounded-2xl border border-default bg-panel p-6">
            <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent grid place-items-center mb-3">
              <Icon name={c.icon} size={20} />
            </div>
            <div className="font-semibold text-fg-primary">{c.title}</div>
            <p className="mt-1.5 text-sm text-fg-secondary">{c.body}</p>
          </div>
        ))}
      </Section>

      <Section>
        <SectionHeading eyebrow="Our posture" title="What we won’t claim" center={false} />
        <ul className="mx-auto max-w-3xl space-y-3 text-sm text-fg-secondary">
          <li className="flex items-start gap-2 rounded-xl border border-default bg-panel p-4">
            <Icon name="check" size={15} className="text-fg-tertiary mt-0.5 flex-shrink-0" />
            No SOC 2 / ISO 27001 certification is claimed until it is actually held.
          </li>
          <li className="flex items-start gap-2 rounded-xl border border-default bg-panel p-4">
            <Icon name="check" size={15} className="text-fg-tertiary mt-0.5 flex-shrink-0" />
            We document the security model and the automated tests that enforce it, so the claims are checkable.
          </li>
          <li className="flex items-start gap-2 rounded-xl border border-default bg-panel p-4">
            <Icon name="check" size={15} className="text-fg-tertiary mt-0.5 flex-shrink-0" />
            Sensitive findings are taken seriously; reach the maintainer directly at{" "}
            <a className="text-accent font-semibold underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </li>
        </ul>
      </Section>

      <CtaBand
        title="Start with your data the safe way"
        sub="14-day free trial, per-organization isolation from the first sign-in."
        primary={{ label: "Get Started", to: "/signup" }}
        secondary={{ label: "Read the privacy policy", to: "/privacy" }}
      />
    </>
  );
}