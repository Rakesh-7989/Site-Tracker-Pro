// SiteTrack Pro — /contact page.

import { PageHero, Section, CtaBand, useSiteSeo } from "../ui";
import { CONTACT_EMAIL } from "@/features/marketing/legalContent";
import { Icon } from "@/components/ui/atoms";

export function ContactPage(): JSX.Element {
  useSiteSeo("Contact — SiteTrack Pro", "Reach SiteTrack Pro: product and support questions, or security reporting.");

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to the team that builds it"
        sub="SiteTrack Pro is run by its builders. Email gets you a real answer — there is no ticket labyrinth in between."
      />

      <Section className="pt-0 max-w-3xl space-y-5">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="group flex items-center gap-4 rounded-2xl border border-default bg-panel p-6 hover:shadow-card transition"
        >
          <div className="w-12 h-12 rounded-xl bg-accent-tint text-accent grid place-items-center flex-shrink-0">
            <Icon name="mail" size={22} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-fg-primary">Email the maintainer</div>
            <div className="text-sm text-fg-secondary truncate">{CONTACT_EMAIL}</div>
          </div>
          <Icon name="arrow" size={18} className="rotate-180 ml-auto text-fg-tertiary group-hover:text-accent transition" />
        </a>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-default bg-panel p-6">
            <div className="font-semibold text-fg-primary flex items-center gap-2">
              <Icon name="msgcircle" size={18} className="text-accent" />
              Product &amp; support
            </div>
            <p className="mt-1.5 text-sm text-fg-secondary">
              Questions about features, plans, onboarding or anything the product does — including something it
              doesn’t yet.
            </p>
          </div>
          <div className="rounded-2xl border border-default bg-panel p-6">
            <div className="font-semibold text-fg-primary flex items-center gap-2">
              <Icon name="shield" size={18} className="text-accent" />
              Security reporting
            </div>
            <p className="mt-1.5 text-sm text-fg-secondary">
              Found a vulnerability? Email the maintainer directly and it will be treated as a priority.
            </p>
          </div>
        </div>
      </Section>

      <CtaBand
        title="The fastest line, though, is trying it"
        sub="Most questions answer themselves inside a 14-day trial."
        primary={{ label: "Start free trial", to: "/signup" }}
      />
    </>
  );
}