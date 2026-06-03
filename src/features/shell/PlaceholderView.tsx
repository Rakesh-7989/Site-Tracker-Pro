// SiteTrack Pro — v3 placeholder for routes not yet rebuilt.
//
// Phase 3 ships the shell skeleton + dashboard/projects/create. Other
// nav destinations (DPR, activity, audit, org admin, platform admin)
// render this honest placeholder until their phase lands. It is NOT a
// frozen stub — it's a "coming in Phase N" marker for the rebuild.

import { Card, Icon } from "@/components/ui/atoms";

export function PlaceholderView({ title, phase }: { title: string; phase: string }): JSX.Element {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-display text-xl font-bold text-ink-900 mb-4">{title}</h1>
      <Card className="p-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-cream-100 text-ink-400 grid place-items-center mx-auto mb-3">
          <Icon name="clipboard" size={22} />
        </div>
        <div className="text-sm font-semibold text-ink-700">Coming in {phase}</div>
        <div className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
          This surface is part of the v3 TypeScript rebuild. The shell + auth
          layer are live; this view is rebuilt in {phase}.
        </div>
      </Card>
    </div>
  );
}

export function NotFoundView(): JSX.Element {
  return (
    <div className="max-w-3xl mx-auto">
      <Card className="p-10 text-center">
        <div className="text-4xl font-display font-bold text-ink-300">404</div>
        <div className="text-sm text-ink-500 mt-2">That page doesn't exist in the v3 shell.</div>
        <a href="/dashboard?shell=v3" className="inline-block mt-4 text-sm font-semibold text-safety-600 hover:text-safety-700">
          ← Back to dashboard
        </a>
      </Card>
    </div>
  );
}
