// SiteTrack Pro — /solutions overview + per-persona role pages.
//
// Both pages render from `SOLUTION_ROLES` in content.ts — the same honest,
// codebase-verified personas used by the header/footer nav.

import { Navigate, useParams } from "react-router-dom";
import { Icon, Badge } from "@/components/ui/atoms";
import { PageHero, Section, SectionHeading, CtaBand, useSiteSeo } from "../ui";
import { SOLUTION_ROLES } from "../content";

export function SolutionsOverviewPage(): JSX.Element {
  useSiteSeo("Solutions — SiteTrack Pro", "How SiteTrack Pro serves developers & builders, project managers, site engineers and contractors & vendors.");

  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Built for every seat on the project"
        sub="Four answers to the same question — what does SiteTrack Pro do for me?"
        primary={{ label: "Start free trial", to: "/signup" }}
      />

      <Section className="pt-0 grid gap-4 md:grid-cols-2">
        {SOLUTION_ROLES.map((role) => (
          <div key={role.slug} className="rounded-2xl border border-default bg-panel p-6 flex flex-col">
            <div className="font-display text-lg font-bold text-fg-primary">{role.name}</div>
            <div className="mt-1 text-sm text-fg-tertiary">{role.short}</div>
            <p className="mt-3 text-sm text-fg-secondary flex-1">{role.tagline}</p>
            <div className="mt-5 pt-5 border-t border-default">
              <code className="text-xs text-accent bg-accent-tint px-2 py-0.5 rounded-md">/solutions/{role.slug}</code>
              <a
                href={`/solutions/${role.slug}`}
                className="mt-3 block text-sm font-semibold text-fg-primary hover:text-accent transition"
              >
                Read the solution <Icon name="arrow" size={14} className="rotate-180 inline" />
              </a>
            </div>
          </div>
        ))}
      </Section>

      <CtaBand title="Pick your seat, start a trial" sub="Every role gets a real workspace from day one." primary={{ label: "Get Started", to: "/signup" }} />
    </>
  );
}

export function SolutionRolePage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const role = SOLUTION_ROLES.find((r) => r.slug === slug);

  useSiteSeo(
    role ? `${role.name} — SiteTrack Pro` : "Solution — SiteTrack Pro",
    role ? role.tagline : undefined
  );

  if (!role) return <Navigate to="/solutions" replace />;

  return (
    <>
      <PageHero
        eyebrow="Solution"
        title={role.name}
        sub={role.tagline}
        primary={{ label: "Start free trial", to: "/signup" }}
      />

      <Section className="pt-0">
        <SectionHeading eyebrow="The pain" title="What it looks like today" center={false} />
        <ul className="mx-auto max-w-3xl space-y-3">
          {role.pains.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm text-fg-secondary rounded-xl border border-default bg-panel p-4">
              <Icon name="alert" size={16} className="text-error mt-0.5 flex-shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <SectionHeading eyebrow="The fix" title="How SiteTrack Pro helps" center={false} />
        <div className="grid gap-4 md:grid-cols-3">
          {role.howWeHelp.map((h) => (
            <div key={h.title} className="rounded-xl border border-default bg-panel p-5">
              <div className="font-semibold text-fg-primary">{h.title}</div>
              <p className="mt-1.5 text-sm text-fg-secondary">{h.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Highlights" title={`In the box for ${role.short.toLowerCase()}`} center={false} />
        <div className="flex flex-wrap gap-2">
          {role.highlights.map((h) => (
            <Badge key={h} tone="neutral">
              {h}
            </Badge>
          ))}
        </div>
      </Section>

      <CtaBand title={role.cta} sub="Start your 14-day free trial — all modules, no credit card." primary={{ label: "Get Started", to: "/signup" }} secondary={{ label: "See all solutions", to: "/solutions" }} />
    </>
  );
}