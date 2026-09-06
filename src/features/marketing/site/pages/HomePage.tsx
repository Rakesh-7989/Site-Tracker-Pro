// SiteTrack Pro — the public homepage at `/`.
//
// Replaces the legacy LandingView route. Every claim below maps to a
// capability the product actually ships (see content.ts FEATURE_GROUPS and
// plans.ts for the pricing figures) — no fabricated customers or metrics.

import { Link, Navigate } from "react-router-dom";
import { postLoginPathForSession, readStoredLoginLane, useAuth } from "@/auth";
import { Icon, Badge } from "@/components/ui/atoms";
import { PLAN_TIERS, formatINR } from "@/features/marketing/plans";
import { FEATURE_GROUPS } from "../content";
import { PageHero, Section, SectionHeading, FeatureTile, CtaBand, useSiteSeo } from "../ui";
import { useSiteJsonLd } from "../seo";

const TITLE = "SiteTrack Pro — Construction Control Software for India";
const DESCRIPTION =
  "A construction control system for Indian builders — daily progress, spend, drawings and risk from every site in one workspace, answered in Telugu, Hindi or English before the promoter asks.";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is SiteTrack Pro built for Indian construction teams specifically?",
    answer:
      "Yes — voice daily progress reports, running account bills, RERA stage tracking, statutory approvals and GST/TDS on invoices are native capabilities, not features bolted onto a generic project tool.",
  },
  {
    question: "Can site engineers work where phone signal is poor?",
    answer:
      "Yes. Progress reports, geotagged photos and attendance queue on the phone while the site is offline and sync automatically when it comes back online, so nothing is lost on low-signal sites.",
  },
  {
    question: "Does it work in Telugu and Hindi?",
    answer:
      "Yes. A site engineer can dictate the daily progress report in Telugu, Hindi or English, and the transcript is captured with the photos it belongs to. The product itself ships in all three languages.",
  },
  {
    question: "How does pricing work?",
    answer:
      "Pricing is per organization, not per seat, and plans start at ₹5,999/month. Every plan includes a 14-day free trial with no credit card, and prices are exclusive of 18% GST which business subscribers claim as input credit.",
  },
  {
    question: "Is our data secure?",
    answer:
      "Yes. Every organization is isolated at the database row level, access follows role-based permissions, and important changes are written to an immutable audit trail.",
  },
];

export function HomePage(): JSX.Element {
  useSiteSeo(TITLE, DESCRIPTION);

  const { session, status } = useAuth();

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
    "homepage-faq"
  );

  if (status === "ready" && session) {
    return <Navigate to={postLoginPathForSession(session, readStoredLoginLane())} replace />;
  }

  return (
    <>
      <PageHero
        eyebrow="India's construction control system"
        title="Your construction site, finally under control"
        sub="Daily progress, spend, drawings and risk from every project in one workspace — dictated on site in Telugu, Hindi or English, and rolled into the answers your promoter needs every morning."
        primary={{ label: "Start free trial", to: "/signup" }}
        secondary={{ label: "See product", to: "/product" }}
      />

      <Section>
        <SectionHeading
          eyebrow="One record, no scavenger hunts"
          title="Six modules, one project record"
          sub="Status, money, drawings and labour all read from the same per-project record — so nothing has to be stitched together from WhatsApp messages, Excel sheets and phone calls."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <FeatureTile key={group.id} icon={group.icon} title={group.title} body={group.blurb} />
          ))}
        </div>
      </Section>

      <Section className="pt-2">
        <SectionHeading
          eyebrow="Construction finance, done the Indian way"
          title="Budgets, RA bills and compliance in one place"
          center={false}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm sm:text-base text-fg-secondary leading-relaxed">
              Every rupee on the site is tracked from purchase order to final bill. Budget lines
              compare what was planned against what was spent, invoices and Running Account bills
              compute GST percent and TDS and the net receivable consistently, and the register rolls
              the numbers up for the promoter — all on RERA registration stages that never slip.
            </p>
          </div>
          <ul className="space-y-2.5">
            <li className="text-sm text-fg-secondary flex items-start gap-2">
              <Icon name="check" size={15} className="text-success mt-0.5 flex-shrink-0" />
              <span>Budgets vs actuals, cash-flow and burn — per project and across the portfolio.</span>
            </li>
            <li className="text-sm text-fg-secondary flex items-start gap-2">
              <Icon name="check" size={15} className="text-success mt-0.5 flex-shrink-0" />
              <span>Invoices and RA bills with GST %, TDS and net receivable computed consistently.</span>
            </li>
            <li className="text-sm text-fg-secondary flex items-start gap-2">
              <Icon name="check" size={15} className="text-success mt-0.5 flex-shrink-0" />
              <span>RERA stage tracking and a statutory approvals / NOC register with expiry alerts.</span>
            </li>
          </ul>
        </div>
      </Section>

      <Section className="pt-2">
        <SectionHeading
          eyebrow="Pricing"
          title="Per organization, not per seat"
          sub="Add your whole team — site engineers, accounts, consultants and clients — at no extra cost. Every plan starts with a 14-day free trial, no credit card."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={
                tier.popular
                  ? "relative rounded-2xl border border-default bg-panel p-6 ring-2 ring-[var(--st-accent-light)] shadow-editorial"
                  : "relative rounded-2xl border border-default bg-panel p-6"
              }
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge tone="warning">Most popular</Badge>
                </div>
              )}
              <div className="font-display text-lg font-bold">{tier.name}</div>
              <div className="mt-1 text-sm text-fg-tertiary">{tier.tagline}</div>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold">{formatINR(tier.monthly)}</span>
                <span className="text-sm text-fg-tertiary">/month · +18% GST</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link
            to="/pricing"
            className="text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-6 py-3 rounded-xl transition inline-flex items-center gap-2"
          >
            Compare plans <Icon name="arrow" size={15} className="rotate-180" />
          </Link>
        </div>
      </Section>

      <Section className="pt-2">
        <SectionHeading eyebrow="Straight answers" title="Questions we hear often" center={false} />
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
        title="Your sites, under control — starting today"
        sub="Start a 14-day free trial, add your team, and put the first site on record — no credit card."
        primary={{ label: "Start free trial", to: "/signup" }}
        secondary={{ label: "Contact sales", to: "/contact" }}
      />
    </>
  );
}