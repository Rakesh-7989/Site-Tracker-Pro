// SiteTrack Pro — /resources hub.

import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/atoms";
import { PageHero, Section, CtaBand, useSiteSeo } from "../ui";

interface ResourceCard {
  title: string;
  body: string;
  to: string;
}

const RESOURCES: ResourceCard[] = [
  {
    title: "Product overview",
    body: "A tour of what SiteTrack Pro is — projects, field ops, finance and the module system.",
    to: "/product",
  },
  {
    title: "Solutions",
    body: "How the platform fits developers, architects, interior firms and consultants.",
    to: "/solutions",
  },
  {
    title: "Product updates",
    body: "An honest changelog of what ships and when it went live.",
    to: "/blog",
  },
  {
    title: "Security",
    body: "How data is isolated, access is controlled and changes are audited.",
    to: "/security",
  },
  {
    title: "Pricing",
    body: "Per-organization plans, GST and the 14-day trial explained plainly.",
    to: "/pricing",
  },
  {
    title: "Privacy policy",
    body: "What data SiteTrack Pro holds, for how long and how it is used.",
    to: "/privacy",
  },
  {
    title: "Terms of service",
    body: "The terms under which SiteTrack Pro is provided.",
    to: "/terms",
  },
];

export function ResourcesPage(): JSX.Element {
  useSiteSeo("Resources — SiteTrack Pro", "Guides, product updates, security and policies for SiteTrack Pro.");

  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Guides, updates and policies"
        sub="Everything you might want before starting: what the product does, how it is secured, and the terms it runs on."
      />

      <Section className="pt-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCES.map((r) => (
          <Link
            key={r.title}
            to={r.to}
            className="group rounded-2xl border border-default bg-panel p-6 hover:shadow-card transition"
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-lg font-bold text-fg-primary">{r.title}</div>
              <Icon name="arrow" size={16} className="rotate-180 text-fg-tertiary group-hover:text-accent transition" />
            </div>
            <p className="mt-2 text-sm text-fg-secondary">{r.body}</p>
          </Link>
        ))}
      </Section>

      <CtaBand
        title="Still deciding?"
        sub="The fastest way to understand SiteTrack Pro is ten minutes inside it."
        primary={{ label: "Start free trial", to: "/signup" }}
        secondary={{ label: "Contact us", to: "/contact" }}
      />
    </>
  );
}