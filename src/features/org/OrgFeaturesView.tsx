// SiteTrack Pro — Org Feature Toggles view (/org/features).
// Org admin panel for enabling/disabling per-org feature flags.

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner, Icon } from "@/components/ui/atoms";
import { getOrgIdFromMember, listFeatureFlags, upsertFeatureFlag, type FeatureFlag } from "@/app/featureFlagQueries";

import { getClient } from "@/lib/supabase";
const FEATURE_GROUPS: Array<{ id: string; label: string; desc: string; features: Array<{ key: string; label: string; plan: string }> }> = [
  { id: "nav", label: "Sidebar nav", desc: "Top-level views in navigation.", features: [
    { key: "hierarchy", label: "Hierarchy", plan: "basic" },
    { key: "calendar", label: "Calendar", plan: "basic" },
    { key: "vendors", label: "Vendors", plan: "basic" },
    { key: "po", label: "Purchase Orders", plan: "basic" },
    { key: "material_prices", label: "Material Prices", plan: "basic" },
    { key: "analytics", label: "Analytics", plan: "pro" },
    { key: "activity", label: "Activity", plan: "basic" },
    { key: "messages", label: "Messages", plan: "basic" },
  ]},
  { id: "tabs", label: "Project tabs", desc: "Sub-tabs inside each project.", features: [
    { key: "compliance", label: "Compliance", plan: "pro" },
    { key: "forecast", label: "Forecast", plan: "pro" },
    { key: "delegations", label: "Delegations", plan: "pro" },
    { key: "snapshot", label: "Daily Snapshot", plan: "pro" },
  ]},
  { id: "workflow", label: "Workflow features", desc: "Cross-cutting capabilities.", features: [
    { key: "kiosk_labour", label: "Labour Kiosk", plan: "pro" },
    { key: "kiosk_site", label: "Site Wall Kiosk", plan: "pro" },
    { key: "kiosk_ar", label: "AR Drawing Overlay", plan: "business" },
  ]},
];


export function OrgFeaturesView(): JSX.Element {
  const [flags, setFlags] = useState<Map<string, boolean>>(new Map());
  const [orgId, setOrgId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const idRes = await getOrgIdFromMember(client);
    if (!idRes.ok) { setError(idRes.error); setLoading(false); return; }
    setOrgId(idRes.data);
    const fRes = await listFeatureFlags(client, idRes.data);
    if (fRes.ok) {
      const m = new Map<string, boolean>();
      fRes.data.forEach((r: FeatureFlag) => m.set(r.key, r.enabled));
      setFlags(m);
    } else { setError(fRes.error); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: string, current: boolean) => {
    setSaving(key);
    setError(null);
    const next = !current;
    const client = await getClient();
    if (!client) return;
    const res = await upsertFeatureFlag(client, orgId, key, next);
    if (res.ok) {
      setFlags(prev => { const m = new Map(prev); m.set(key, next); return m; });
    } else { setError(res.error); }
    setSaving(null);
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error && !orgId) return <div className="p-8"><div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">{error}</div></div>;

  const allFeatures = FEATURE_GROUPS.flatMap(g => g.features);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-ink-900 flex items-center gap-2">
          <Icon name="sliders" size={22} className="text-safety-500" />Feature Toggles
        </h1>
        <p className="text-ink-400 text-sm mt-1">Enable or disable features for your organisation</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm mb-4">{error}</div>}

      {FEATURE_GROUPS.map(g => {
        const features = g.features;
        return (
          <Card key={g.id} className="p-6 mb-5">
            <div className="text-[10px] font-bold tracking-widest uppercase text-safety-600 mb-1">— {g.label}</div>
            <h2 className="font-bold text-lg text-ink-900 mb-1">{g.label}</h2>
            <p className="text-xs text-ink-500 mb-4">{g.desc}</p>
            <div className="space-y-2">
              {features.map(f => {
                const enabled = flags.get(f.key) ?? true;
                const busy = saving === f.key;
                return (
                  <label key={f.key} className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all ${enabled ? "bg-emerald-50" : "bg-cream-200/40"}`}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={busy}
                      onChange={() => toggle(f.key, enabled)}
                      className="w-5 h-5 accent-safety-600"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-ink-900 text-sm">{f.label}</div>
                      <div className="text-xs text-ink-400">Plan: {f.plan}</div>
                    </div>
                    {busy && <Spinner size={14} />}
                  </label>
                );
              })}
            </div>
          </Card>
        );
      })}

      <div className="text-xs text-ink-400 mt-4">
        {allFeatures.length} features · {Array.from(flags.values()).filter(Boolean).length} enabled
      </div>
    </div>
  );
}
