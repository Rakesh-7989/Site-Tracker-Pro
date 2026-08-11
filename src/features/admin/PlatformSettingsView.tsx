// SiteTrack Pro — Platform System Settings admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { Card, Spinner, AccessDenied } from "@/components/ui/atoms";
import { listOpsToggles, upsertOpsToggle } from "@/app/platformSettingsQueries";

import { getClient } from "@/lib/supabase";
interface ToggleRow { id: string; key: string; label: string; desc: string; enabled: boolean; }


const OPS_TOGGLES: ToggleRow[] = [
  { id: "demoLoaderEnabled", key: "demoLoaderEnabled", label: "Demo data loader", desc: "Show demo data button on login.", enabled: false },
  { id: "kioskLabourEnabled", key: "kioskLabourEnabled", label: "Labour Attendance Kiosk", desc: "Tablet kiosk for site entry attendance.", enabled: false },
  { id: "kioskSiteEnabled", key: "kioskSiteEnabled", label: "Site Wall Kiosk", desc: "Wall-mounted site awareness display.", enabled: false },
  { id: "kioskArEnabled", key: "kioskArEnabled", label: "AR Drawing Overlay", desc: "Phone camera overlay for as-builts.", enabled: false },
];

export function PlatformSettingsView(): JSX.Element {
  const can = useCan("platform:settings:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const res = await listOpsToggles(client);
    const map: Record<string, boolean> = {};
    if (res.ok) res.data.forEach((r) => { map[r.key] = r.value === "true"; });
    setToggles(map);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: string) => {
    setSaving(key);
    const next = !toggles[key];
    const client = await getClient();
    if (client) await upsertOpsToggle(client, key, String(next));
    setToggles(p => ({ ...p, [key]: next }));
    setSaving(null);
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-black text-fg-primary mb-1">System Settings</h1>
      <p className="text-fg-tertiary text-sm mb-6">Platform-wide operational toggles</p>

      <Card padding="lg" className="mb-6" title={<div>
        <h2 className="font-bold text-lg">Operational toggles</h2>
        <p className="text-xs text-fg-tertiary">Control which surfaces are available across all orgs.</p>
      </div>}>
        <div className="space-y-2">
          {OPS_TOGGLES.map(t => {
            const enabled = toggles[t.key] ?? false;
            const busy = saving === t.key;
            return (
              <label key={t.key} className={`flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all ${enabled ? "bg-success-tint" : "bg-secondary"}`}>
                <input type="checkbox" checked={enabled} disabled={busy} onChange={() => toggle(t.key)} className="mt-1 w-5 h-5 accent-[var(--st-accent)]" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-fg-tertiary">{t.desc}</div>
                </div>
                {busy && <Spinner size={14} />}
              </label>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
