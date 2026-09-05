// SiteTrack Pro — /features page.

import { Icon } from "@/components/ui/atoms";
import { PageHero, Section, SectionHeading, CheckItem, CtaBand, useSiteSeo } from "../ui";
import { FEATURE_GROUPS } from "../content";

export function FeaturesPage(): JSX.Element {
  useSiteSeo("Features — SiteTrack Pro", "Every module of SiteTrack Pro: field operations, construction finance, drawings & approvals, people, compliance and collaboration — all in one workspace.");

  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything the site runs on"
        sub="A feature-by-feature walkthrough of SiteTrack Pro. Each area is per-project and visible only to the roles that should see it."
        primary={{ label: "Start free trial", to: "/signup" }}
      />

      <Section className="pt-0 space-y-16">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.id} id={group.id}>
            <SectionHeading eyebrow={group.title} title={group.blurb} center={false} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.features.map((f) => (
                <div key={f.title} className="p-5 rounded-xl border border-default bg-panel">
                  <div className="font-semibold text-fg-primary flex items-center gap-2">
                    <Icon name="check" size={16} className="text-success" />
                    {f.title}
                  </div>
                  <p className="mt-1.5 text-sm text-fg-secondary">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Breadth"
          title="And across all of it"
          sub="A few things that hold the whole platform together."
        />
        <ul className="mx-auto max-w-3xl space-y-3">
          <CheckItem strong>Role-based access — 22 identity roles, custom roles and per-capability grants.</CheckItem>
          <CheckItem strong>Plan &amp; quota enforcement — feature gating and storage/member limits enforced server-side.</CheckItem>
          <CheckItem strong>Audit trail — every important change recorded, immutable and grant-locked.</CheckItem>
          <CheckItem strong>Export &amp; share — PDFs, CSVs, share links and WhatsApp delivery.</CheckItem>
          <CheckItem strong>Mobile-first — works on any phone, including offline on poor-signal sites.</CheckItem>
        </ul>
      </Section>

      <CtaBand
        title="See it against your own workflows"
        sub="Every feature above maps to a real screen and a real database table."
        primary={{ label: "Get Started", to: "/signup" }}
        secondary={{ label: "Compare plans", to: "/pricing" }}
      />
    </>
  );
}