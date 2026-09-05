// SiteTrack Pro — /blog product-update log.
//
// An honest changelog of what has actually shipped (mapped to real sessions
// and migrations). No fabricated customers, metrics or dates.

import { PageHero, Section, CtaBand, useSiteSeo } from "../ui";

interface Update {
  title: string;
  when: string;
  tag: string;
  body: string;
}

const UPDATES: Update[] = [
  {
    title: "Voice daily progress reports in Telugu, Hindi and English",
    when: "Field ops",
    tag: "Core",
    body: "Site engineers can dictate a DPR instead of typing it. The transcript, geotagged photos and voice recording are captured together, queue offline and sync back when the phone has signal.",
  },
  {
    title: "Construction finance end to end",
    when: "Finance",
    tag: "Core",
    body: "Budgets vs actuals, purchase orders against quotes, goods receipts that post GRN to inventory automatically, RA bills, invoices with GST %/TDS and an org-wide net-receivable register.",
  },
  {
    title: "Unified team chat",
    when: "Collaboration",
    tag: "Workspace",
    body: "Channels, direct messages, @mentions and reactions replace the split between project messages and org teams — with project admins deciding who talks to whom.",
  },
  {
    title: "Cross-org partner collaboration",
    when: "Collaboration",
    tag: "Workspace",
    body: "A partner firm joins a project under its own organisation with read-only access — a consultant or contractor sees shared scope without shared logins and without seeing your money tables.",
  },
  {
    title: "Client approval portal & secure share links",
    when: "Collaboration",
    tag: "New",
    body: "Clients review approved drawings, milestones and payments in their own portal, and external reviewers get password/OTP-gated share links with expiry and download control. Drawing comments place x/y pins exactly where the change is.",
  },
  {
    title: "Risk signals computed nightly",
    when: "Intelligence",
    tag: "New",
    body: "A nightly score per project watches schedule slip, budget burn and open high-severity issues — surfaced on dashboards and in the promoter digest before problems compound.",
  },
  {
    title: "Reasoning: hardening the money paths",
    when: "Platform",
    tag: "Security",
    body: "Server-side guards now cap payments at each invoice’s receivable, lock versioned concurrency on important records, enforce project-lifecycle transitions and gate cross-tenant reads at the row level — all verified by automated harnesses against the production database.",
  },
  {
    title: "One-click payment links for invoices",
    when: "Finance",
    tag: "New",
    body: "Invoices carry a Razorpay payment link customers can settle directly, with the webhook reconciling payment status against the invoice.",
  },
];

export function BlogPage(): JSX.Element {
  useSiteSeo("Product updates — SiteTrack Pro", "An honest changelog of what ships in SiteTrack Pro and when it went live.");

  return (
    <>
      <PageHero
        eyebrow="Product updates"
        title="What ships, when"
        sub="A changelog of notable releases. We record what we actually built — no vaporware, no press releases."
      />

      <Section className="pt-0 max-w-3xl space-y-5">
        {UPDATES.map((u) => (
          <article key={u.title} className="rounded-2xl border border-default bg-panel p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wide text-accent">{u.tag}</span>
              <span className="text-xs text-fg-tertiary">{u.when}</span>
            </div>
            <h2 className="mt-2 font-display text-xl font-bold text-fg-primary">{u.title}</h2>
            <p className="mt-2 text-sm text-fg-secondary">{u.body}</p>
          </article>
        ))}
      </Section>

      <CtaBand
        title="Don’t take the log’s word for it"
        sub="These updates are running on production right now. See them in a trial workspace."
        primary={{ label: "Start free trial", to: "/signup" }}
        secondary={{ label: "Read the product overview", to: "/product" }}
      />
    </>
  );
}