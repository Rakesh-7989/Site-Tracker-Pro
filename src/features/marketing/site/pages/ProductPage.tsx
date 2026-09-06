// SiteTrack Pro — /product overview page.

import { PageHero, Section, SectionHeading, FeatureTile, CtaBand, useSiteSeo } from "../ui";
import { useSiteJsonLd, SITE_BASE_URL } from "../seo";
import { FEATURE_GROUPS, WHY_ME } from "../content";
import { CheckItem } from "../ui";
import { Icon } from "@/components/ui/atoms";

export function ProductPage(): JSX.Element {
  useSiteSeo("Product — SiteTrack Pro", "SiteTrack Pro is a construction & AEC project operating system for Indian teams — field ops, finance, drawings, people and compliance in one workspace.");

  useSiteJsonLd(
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "SiteTrack Pro",
      url: `${SITE_BASE_URL}/product`,
      operatingSystem: "Web browser, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Construction Project Management",
      inLanguage: ["en", "te", "hi"],
      description:
        "Construction project software for Indian builders, contractors and architects — voice daily progress reports, RA bills with GST/TDS, RERA stage tracking, drawings, labour and client approvals in one workspace.",
      offers: {
        "@type": "Offer",
        price: "7999",
        priceCurrency: "INR",
        description: "Per organization, not per seat. 14-day free trial.",
      },
    },
    "product-software-app"
  );

  return (
    <>
      <PageHero
        eyebrow="Product"
        title="One system for the entire project lifecycle"
        sub="SiteTrack Pro brings daily site reporting, construction finance, drawings, workforce and compliance into one per-project workspace — built for how Indian construction teams actually work."
        primary={{ label: "Start free trial", to: "/signup" }}
        secondary={{ label: "See pricing", to: "/pricing" }}
      />

      <Section className="pt-0">
        <SectionHeading
          eyebrow="Modules"
          title="Everything the project touches"
          sub="Six modules that share the same projects, people and numbers — no imports, no sync glue."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.id} className="rounded-2xl border border-default bg-panel">
              <div className="p-5 border-b border-default flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent grid place-items-center">
                  <Icon name={group.icon} size={20} />
                </div>
                <div>
                  <div className="font-semibold text-fg-primary">{group.title}</div>
                  <div className="text-xs text-fg-tertiary">{group.features.length} capabilities</div>
                </div>
              </div>
              <ul className="p-5 space-y-2">
                {group.features.slice(0, 4).map((f) => (
                  <CheckItem key={f.title} strong>
                    {f.title}
                  </CheckItem>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Why SiteTrack Pro" title="Built for sites, not spreadsheets" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_ME.map((vp) => (
            <FeatureTile key={vp.title} icon={vp.icon} title={vp.title} body={vp.body} />
          ))}
        </div>
      </Section>

      <CtaBand
        title="Put your next project on one system"
        sub="Start with a 14-day free trial — all modules, no credit card."
        primary={{ label: "Get Started", to: "/signup" }}
        secondary={{ label: "Talk to us", to: "/contact" }}
      />
    </>
  );
}