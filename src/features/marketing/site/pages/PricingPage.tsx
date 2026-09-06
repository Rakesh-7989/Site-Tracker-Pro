// SiteTrack Pro — /pricing page.
//
// Single source of truth for numbers is `src/features/marketing/plans.ts`
// (PLAN_TIERS / priceFor / GST_RATE / gstInclusive / formatINR). Prices are
// EXCLUSIVE of GST; B2B subscribers claim input credit.

import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";
import { Badge, Icon } from "@/components/ui/atoms";
import { PLAN_TIERS, priceFor, gstInclusive, formatINR, type BillingPeriod } from "@/features/marketing/plans";
import { PageHero, Section, SectionHeading, CheckItem, CtaBand, useSiteSeo } from "../ui";
import { useSiteJsonLd, SITE_BASE_URL } from "../seo";

export function PricingPage(): JSX.Element {
  useSiteSeo("Pricing — SiteTrack Pro", "Simple, per-organization pricing for SiteTrack Pro. Basic, Pro and Business plans — every plan starts with a 14-day free trial, no credit card.");

  useSiteJsonLd(
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SiteTrack Pro",
      url: `${SITE_BASE_URL}/pricing`,
      operatingSystem: "Web browser, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Construction Project Management",
      inLanguage: ["en", "te", "hi"],
      offers: [
        { "@type": "Offer", price: "7999", priceCurrency: "INR", name: "Basic", description: "Per organization, per month." },
        { "@type": "Offer", price: "19999", priceCurrency: "INR", name: "Pro", description: "Per organization, per month." },
        { "@type": "Offer", price: "43333", priceCurrency: "INR", name: "Business", description: "Per organization, per month." },
      ],
    },
    "pricing-software-app"
  );

  const [period, setPeriod] = useState<BillingPeriod>("annual");

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Priced per organization, not per seat"
        sub="Add your whole team — site engineers, accounts, consultants and clients — at no extra cost. Every plan starts with a 14-day free trial, no credit card."
      />

      <div className="flex items-center justify-center gap-2 px-5 pb-8">
        <span className={cn("text-sm font-semibold", period === "monthly" ? "text-fg-primary" : "text-fg-tertiary")}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={period === "annual"}
          aria-label="Toggle annual billing"
          onClick={() => setPeriod((p) => (p === "annual" ? "monthly" : "annual"))}
          className={cn(
            "relative w-12 h-7 rounded-full transition",
            period === "annual" ? "bg-accent" : "bg-elevated border border-default"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all",
              period === "annual" ? "left-[calc(100%-1.75rem)]" : "left-0.5"
            )}
          />
        </button>
        <span className={cn("text-sm font-semibold", period === "annual" ? "text-fg-primary" : "text-fg-tertiary")}>Annual</span>
        {period === "annual" && (
          <span className="text-sm font-semibold text-success bg-success-tint px-2.5 py-1 rounded-full">2 months free</span>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-5 grid gap-5 md:grid-cols-3">
        {PLAN_TIERS.map((tier) => {
          const price = priceFor(tier, period);
          const gst = gstInclusive(period === "monthly" ? tier.monthly : tier.annual);
          return (
            <div
              key={tier.id}
              className={cn(
                "relative rounded-2xl border border-default bg-panel p-6 flex flex-col",
                tier.popular && "ring-2 ring-[var(--st-accent-light)] shadow-editorial"
              )}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge tone="warning">Most popular</Badge>
                </div>
              )}
              <div className="font-display text-lg font-bold text-fg-primary">{tier.name}</div>
              <div className="mt-1 text-sm text-fg-tertiary">{tier.tagline}</div>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold">{price.amount}</span>
                <span className="text-sm text-fg-tertiary">{price.cadence}</span>
              </div>
              {price.effectiveMonthly && period === "annual" && (
                <div className="mt-1 text-sm text-success font-semibold">
                  {price.effectiveMonthly} · save {price.savingsAmount} ({price.savingsPct}%)
                </div>
              )}
              <div className="mt-2 text-xs text-fg-tertiary">
                +18% GST · billed {period === "annual" ? "annually (" : "monthly ("}
                {formatINR(gst)} total
              </div>

              <ul className="mt-6 space-y-2.5 flex-1">
                {tier.features.map((f) => (
                  <CheckItem key={f}>{f}</CheckItem>
                ))}
              </ul>

              <Link
                to={`/signup?plan=${tier.id}&billing=${period}`}
                className={cn(
                  "mt-7 text-center text-sm font-semibold rounded-xl px-5 py-2.5 transition inline-flex items-center justify-center gap-2",
                  tier.popular
                    ? "text-white bg-accent hover:bg-accent-2"
                    : "text-fg-primary border border-default hover:bg-elevated"
                )}
              >
                Start free trial <Icon name="arrow" size={14} className="rotate-180" />
              </Link>
            </div>
          );
        })}
      </div>

      <Section>
        <SectionHeading eyebrow="Straight answers" title="Pricing questions" center={false} />
        <ul className="mx-auto max-w-3xl space-y-4">
          <li>
            <div className="font-semibold text-fg-primary">Why per organization?</div>
            <p className="text-sm text-fg-secondary mt-1">
              A site involves contractors, consultants, clients and your own engineers. Charging per seat would tax the very
              collaboration the product exists to enable — so we don’t.
            </p>
          </li>
          <li>
            <div className="font-semibold text-fg-primary">Why exclusive of GST?</div>
            <p className="text-sm text-fg-secondary mt-1">
              Business-to-business invoices carry 18% GST, and subscribers claim input credit on it. Showing pre-GST keeps the
              headline honest and the tax separate.
            </p>
          </li>
          <li>
            <div className="font-semibold text-fg-primary">What is “Unlimited projects” on Pro?</div>
            <p className="text-sm text-fg-secondary mt-1">
              Exactly what it says: Pro and Business have no project-count cap. Basic includes 5 active projects.
            </p>
          </li>
          <li>
            <div className="font-semibold text-fg-primary">What happens after the trial?</div>
            <p className="text-sm text-fg-secondary mt-1">
              You pick a plan during onboarding. No credit card is required to start, and you can upgrade or change billing
              period from the Billing screen in your workspace.
            </p>
          </li>
        </ul>
      </Section>

      <CtaBand
        title="Start your 14-day trial"
        sub="Pick a plan, add your team, and put the first site on record."
        primary={{ label: "Get Started", to: "/signup" }}
        secondary={{ label: "Contact sales", to: "/contact" }}
      />
    </>
  );
}