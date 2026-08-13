// SiteTrack Pro — Platform System Settings admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { Card, AccessDenied, Alert, Spinner } from "@/components/ui/atoms";
import { Checkbox } from "@/components/ui/Checkbox";
import { Skeleton } from "@/components/ui/Skeleton";
import { listOpsToggles, upsertOpsToggle } from "@/app/platformSettingsQueries";
import { UpiSettingsCard } from "@/features/admin/UpiSettingsCard";

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
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listOpsToggles(client);
    const map: Record<string, boolean> = {};
    if (res.ok) { res.data.forEach((r) => { map[r.key] = r.value === "true"; }); setToggles(map); }
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: string) => {
    setSaving(key); setSaveError(null);
    const next = !toggles[key];
    const client = await getClient();
    if (client) {
      const res = await upsertOpsToggle(client, key, String(next));
      if (res.ok) setToggles(p => ({ ...p, [key]: next }));
      else setSaveError(res.error);
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4" role="status" aria-label="Loading settings">
        <div className="space-y-2">
          <Skeleton decorative height={28} width="w-48" />
          <Skeleton decorative height={12} width="w-40" />
        </div>
        <div className="bg-panel rounded-xl border border-default p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} decorative height={52} width="w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-fg-primary mb-1">System Settings</h1>
        <p className="text-fg-tertiary text-sm">Platform-wide operational toggles</p>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {saveError && <Alert variant="danger">Save failed: {saveError}</Alert>}

      <Card padding="lg" title={<div>
        <h2 className="font-bold text-lg">Operational toggles</h2>
        <p className="text-xs text-fg-tertiary">Control which surfaces are available across all orgs.</p>
      </div>}>
        <div className="space-y-2">
          {OPS_TOGGLES.map(t => {
            const enabled = toggles[t.key] ?? false;
            const busy = saving === t.key;
            return (
              <label key={t.key} className={`flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all ${enabled ? "bg-success-tint" : "bg-secondary"}`}>
                <Checkbox checked={enabled} disabled={busy} onChange={() => toggle(t.key)} />
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

      <UpiSettingsCard />
    </div>
  );
}