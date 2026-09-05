// SiteTrack Pro — /about page.

import { PageHero, Section, SectionHeading, FeatureTile, CtaBand, useSiteSeo } from "../ui";
import { WHY_ME } from "../content";
import { COMPANY, JURISDICTION } from "@/features/marketing/legalContent";

export function AboutPage(): JSX.Element {
  useSiteSeo("About — SiteTrack Pro", "SiteTrack Pro is construction-specific project software built for Indian sites — by an operator who saw the same project slip from ten different spreadsheet and WhatsApp threads.");

  return (
    <>
      <PageHero
        eyebrow="About"
        title="Construction software, from construction"
        sub="SiteTrack Pro exists because the tools builders actually use — Excel, WhatsApp and phone calls — fall apart exactly at the scale where projects start slipping."
        primary={{ label: "Start free trial", to: "/signup" }}
        secondary={{ label: "Contact us", to: "/contact" }}
      />

      <Section className="pt-0 max-w-3xl space-y-6 text-fg-secondary">
        <p>
          Every site runs on information that never gets recorded: who delivered what, which drawing is current,
          where the budget stands, what the promoter was told yesterday. That information lives in spreadsheets and
          chat threads, so nobody shares the same truth — and the last to know is usually the person paying the bill.
        </p>
        <p>
          SiteTrack Pro puts the daily record where the work happens. Progress reports are dictated, not typed.
          Finance is linked to the project from purchase order to final bill. Drawings stay in one register with an
          approval trail. And the same roles that govern the site govern the software — {COMPANY.toLowerCase()}{" "}
          believes the tools must survive contact with a live site, in Telugu as readily as in English, offline on
          a poor-signal plot just as well as on fibre.
        </p>
        <p>
          The product is operated from {JURISDICTION}, where it is also built — one team shipping, testing and
          hardening the same code against real project data.
        </p>
      </Section>

      <Section>
        <SectionHeading eyebrow="Still us" title="The principles that shape the product" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_ME.map((vp) => (
            <FeatureTile key={vp.title} icon={vp.icon} title={vp.title} body={vp.body} />
          ))}
        </div>
      </Section>

      <CtaBand title="Put the daily record to work" sub="Your first site can be on record in under an hour." primary={{ label: "Get Started", to: "/signup" }} />
    </>
  );
}