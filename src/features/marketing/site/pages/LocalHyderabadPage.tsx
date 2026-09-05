// SiteTrack Pro — local page for Hyderabad, Telangana at
// `/construction-software-hyderabad` (linked from the site footer).
//
// Every claim maps to a shipped capability — Telugu voice DPRs, offline
// queueing, RA bills with GST/TDS, RERA stage tracking, statutory NOC
// register. No fabricated stats or testimonials.

import { FEATURE_GROUPS } from "../content";
import { PageHero, Section, SectionHeading, CheckItem, FeatureTile, CtaBand, useSiteSeo } from "../ui";
import { useSiteJsonLd } from "../seo";

const TITLE = "Construction Software in Hyderabad — SiteTrack Pro";
const DESCRIPTION =
  "Construction project software for Hyderabad builders — Telugu voice DPRs, RERA Telangana stage tracking, RA bills with GST, and offline site work.";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Does SiteTrack Pro help with RERA Telangana filings?",
    answer:
      "SiteTrack Pro tracks RERA stage-wise timelines on every project so a stage is never filed late, and keeps the supporting register — NOCs, approvals, progress photos, promoter handovers — in the same record. It does not file returns on your behalf.",
  },
  {
    question: "Can a site engineer use it on low-signal sites across Hyderabad?",
    answer:
      "Yes. Progress reports, geotagged photos and attendance queue on the phone while the site is offline and sync automatically when back in range, so work carries on in basements and on the outskirts where networks drop.",
  },
  {
    question: "Does it support Telugu day-to-day reporting?",
    answer:
      "Yes. A site engineer can dictate the daily progress report in Telugu, Hindi or English, and the geo-tagged photos are captured with the report they belong to. The product interface itself ships in all three languages.",
  },
];

export function LocalHyderabadPage(): JSX.Element {
  useSiteSeo(TITLE, DESCRIPTION);

  useSiteJsonLd(
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
    "hyderabad-faq"
  );

  return (
    <>
      <PageHero
        eyebrow="Hyderabad · Telangana"
        title="Construction software for builders in Hyderabad"
        sub="SiteTrack Pro runs the daily work of real-estate and construction teams across Hyderabad — Telugu voice DPRs, RA bills with GST and TDS, RERA Telangana stage tracking, drawings and labour — on sites from Hitec City to the new corridors on the city's edges."
        primary={{ label: "Start free trial", to: "/signup" }}
        secondary={{ label: "See product", to: "/product" }}
      />

      <Section>
        <SectionHeading
          eyebrow="Why Hyderabad teams choose it"
          title="Built around how projects run here"
          center={false}
        />
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4 text-sm sm:text-base text-fg-secondary leading-relaxed">
            <p>
              Construction in Hyderabad runs on day-to-day reporting, running account bills and
              approvals — in Telugu as much as in English. SiteTrack Pro is organized around that
              reality: a site engineer's daily progress report is dictated in Telugu or Hindi and
              captured with its geo-tagged photos, the same record flows into the RA bill in the
              accounts office, and the valuation reflects wherever the construction actually stands
              that morning.
            </p>
            <p>
              Oversight works across multiple sites at once. The executive dashboard rolls up budgets
              against actuals, cash flow and delayed milestones per project, so a builder running
              several projects in the city sees the full picture without chasing WhatsApp messages.
              Statutory approvals and NOC registers track expiry dates, and RERA stage timelines stay
              on every project's record so nothing slips between stages.
            </p>
          </div>
          <ul className="space-y-2.5">
            <CheckItem strong>Voice DPRs in Telugu, Hindi or English — with geo-tagged photos.</CheckItem>
            <CheckItem>Running account bills with GST percent, TDS and net receivable computed consistently.</CheckItem>
            <CheckItem>RERA stage tracking and a statutory approvals / NOC register with expiry alerts.</CheckItem>
            <CheckItem>Offline-first: reports, photos and attendance queue on low-signal sites and sync automatically.</CheckItem>
            <CheckItem>Client approval and revision flow with secure share links.</CheckItem>
          </ul>
        </div>
      </Section>

      <Section className="pt-2">
        <SectionHeading
          eyebrow="Inside the workspace"
          title="The modules a Hyderabad site needs"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.slice(0, 6).map((group) => (
            <FeatureTile key={group.id} icon={group.icon} title={group.title} body={group.blurb} />
          ))}
        </div>
      </Section>

      <Section className="pt-2">
        <SectionHeading
          eyebrow="Compliance"
          title="Registers that keep approvals in order"
          center={false}
        />
        <ul className="grid gap-3 md:grid-cols-2 max-w-4xl">
          <CheckItem>RERA Telangana stage-wise tracking on every project record.</CheckItem>
          <CheckItem>NOC register across fire, municipal, electrical, labour and occupancy approvals.</CheckItem>
          <CheckItem>Invoices with 18% GST (CGST/SGST intra-state) and TDS handled in the tax lane.</CheckItem>
          <CheckItem>Budget, cash-flow and cost-forecast rollups per project and across the portfolio.</CheckItem>
        </ul>
      </Section>

      <Section className="pt-2">
        <SectionHeading
          eyebrow="Straight answers"
          title="Questions we hear from Hyderabad teams"
          center={false}
        />
        <ul className="mx-auto max-w-3xl space-y-4">
          {FAQ_ITEMS.map((item) => (
            <li key={item.question}>
              <div className="font-semibold text-fg-primary">{item.question}</div>
              <p className="text-sm text-fg-secondary mt-1">{item.answer}</p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand
        title="Put your first Hyderabad site on record"
        sub="14-day free trial, no credit card. Per organization, not per seat."
        primary={{ label: "Get Started", to: "/signup" }}
        secondary={{ label: "Contact sales", to: "/contact" }}
      />
    </>
  );
}