// SiteTrack Pro — generic tab placeholder (Phase 6).
//
// Tabs whose full feature port lands in a later sub-phase render this.
// It is NOT a frozen stub — it's an honest "rebuilt soon" marker that
// still respects the role gating (the tab only appears if the user's
// capabilities unlock it).

import { Card, Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";

export function TabPlaceholder({ label, icon }: { label: string; icon: IconName }): JSX.Element {
  return (
    <Card className="p-10 text-center">
      <div className="w-12 h-12 rounded-xl bg-cream-100 text-ink-400 grid place-items-center mx-auto mb-3">
        <Icon name={icon} size={22} />
      </div>
      <div className="text-sm font-semibold text-ink-700">{label}</div>
      <div className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
        This tab is part of the v3 TypeScript rebuild. The role gating + data
        layer are live; the full {label.toLowerCase()} surface is rebuilt in a
        Phase 6 sub-pass.
      </div>
    </Card>
  );
}
