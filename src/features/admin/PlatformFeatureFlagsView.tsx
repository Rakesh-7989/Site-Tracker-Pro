import { useCallback, useEffect, useState, useRef } from "react";
import { useAuth, useCan } from "@/auth";
import { Card, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { getClient } from "@/lib/supabase";
import { FEATURE_CATALOG, FEATURE_GROUPS } from "@/lib/orgFeatureFlags";
import { listPlatformFlags, upsertPlatformFlag, type PlatformFlagRow } from "@/app/platformFlagQueries";

interface FeatureMeta {
  id: string;
  label: string;
  plan: string;
  default: boolean;
  desc: string;
}

const GROUP_LABEL: Record<string, string> = {
  nav: "Sidebar nav",
  tabs: "Project tabs",
  workflow: "Workflow features",
  orgadmin: "Org admin panels",
};

export function PlatformFeatureFlagsView(): JSX.Element {
  const { session } = useAuth();
  const can = useCan("platform:settings:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  if (!session) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return <FeatureFlagsInner userId={session.user.id} />;
}

function FeatureFlagsInner({ userId }: { userId: string }): JSX.Element {
  const [flags, setFlags] = useState<Map<string, PlatformFlagRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const featuresByGroup = FEATURE_GROUPS
    .map(g => {
      const features = Object.values(FEATURE_CATALOG)
        .filter((f: any) => f.group === g)
        .map((f: any): FeatureMeta => ({ id: f.id, label: f.label, plan: f.plan, default: f.default, desc: f.desc }));
      return { group: g, label: GROUP_LABEL[g] ?? g, features };
    })
    .filter(g => g.features.length > 0);

  const load = useCallback(async () => {
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPlatformFlags(client);
    if (res.ok) {
      const m = new Map<string, PlatformFlagRow>();
      res.data.forEach(r => m.set(r.key, r));
      setFlags(m);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const getEffective = (featureId: string): { enabled: boolean; rollout: number; note: string | null } => {
    const db = flags.get(featureId);
    return { enabled: db?.enabled ?? true, rollout: db?.rollout ?? 100, note: db?.note ?? null };
  };

  const saveFlag = async (key: string, enabled: boolean, rollout: number, note: string | null) => {
    setSaving(key);
    setError(null);
    const client = await getClient();
    if (!client) { setSaving(null); return; }
    const res = await upsertPlatformFlag(client, key, enabled, userId, rollout, note);
    if (!res.ok) setError(res.error);
    setSaving(null);
  };

  const toggle = async (featureId: string, current: boolean) => {
    const next = !current;
    setFlags(prev => { const m = new Map(prev); m.set(featureId, { key: featureId, enabled: next, rollout: 100, note: null, updated_by: userId, updated_at: null }); return m; });
    await saveFlag(featureId, next, 100, null);
  };

  const updateField = (featureId: string, field: "rollout" | "note", value: number | string | null) => {
    setFlags(prev => {
      const m = new Map(prev);
      const existing = m.get(featureId);
      const patch: Partial<PlatformFlagRow> = field === "rollout" ? { rollout: value as number } : { note: value as string | null };
      m.set(featureId, { key: featureId, enabled: existing?.enabled ?? true, rollout: existing?.rollout ?? 100, note: existing?.note ?? null, updated_by: existing?.updated_by ?? userId, updated_at: existing?.updated_at ?? null, ...patch });
      return m;
    });
    const prevTimer = timers.current.get(featureId);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(async () => {
      const eff = getEffective(featureId);
      await saveFlag(featureId, eff.enabled, eff.rollout, eff.note);
      timers.current.delete(featureId);
    }, 600);
    timers.current.set(featureId, timer);
  };

  const allFeatures = featuresByGroup.flatMap(g => g.features);
  const killedCount = allFeatures.filter(f => !getEffective(f.id).enabled).length;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">Feature Kill Switches</h1>
        <p className="text-sm text-ink-500 mt-1">
          Platform-wide toggles that override all orgs. When ON, the feature resolves
          per the org's plan + feature-flag chain. When OFF, the feature is globally disabled.
        </p>
      </div>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="grid place-items-center py-12"><Spinner size={24} /></div>
      ) : (
        <>
          {featuresByGroup.map(g => (
            <Card key={g.group} className="p-6 mb-5">
              <div className="text-[10px] font-bold tracking-widest uppercase text-safety-600 mb-1">— {g.label}</div>
              <div className="space-y-2 mt-4">
                {g.features.map(f => {
                  const eff = getEffective(f.id);
                  const busy = saving === f.id;
                  return (
                    <div key={f.id} className={`rounded-xl border transition ${eff.enabled ? "border-stone-200 bg-white" : "border-rose-200 bg-rose-50/40"}`}>
                      <div className="p-3 flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-ink-900">{f.label}</span>
                            <span className="text-[10px] text-ink-400 bg-cream-100 px-1.5 py-0.5 rounded">{f.plan}</span>
                          </div>
                          <div className="text-xs text-ink-400 mt-0.5">{f.desc}</div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {busy && <Spinner size={14} />}
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={eff.enabled} disabled={busy} onChange={() => toggle(f.id, eff.enabled)} />
                            <div className="w-9 h-5 bg-stone-300 peer-checked:bg-safety-500 rounded-full peer after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                          </label>
                        </div>
                      </div>
                      <div className="px-3 pb-3 flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-[11px] text-ink-400">
                          Rollout:
                          <input
                            type="range" min={0} max={100}
                            value={eff.rollout}
                            disabled={busy}
                            onChange={e => updateField(f.id, "rollout", Number(e.target.value))}
                            className="w-24 accent-safety-500"
                          />
                          <span className="text-xs font-mono text-ink-600 w-8 text-right">{eff.rollout}%</span>
                        </label>
                        <input
                          type="text"
                          placeholder="note (optional)"
                          value={eff.note ?? ""}
                          disabled={busy}
                          onChange={e => updateField(f.id, "note", e.target.value || null)}
                          className="flex-1 min-w-[160px] text-xs border border-stone-200 rounded-lg px-2 py-1 bg-white text-ink-700 placeholder:text-ink-300 focus:outline-none focus:border-safety-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          <div className="text-xs text-ink-400 mt-4">
            {allFeatures.length} features · {killedCount} killed
            {killedCount > 0 && <span className="ml-2 text-rose-500">· {Math.round(killedCount / allFeatures.length * 100)}% of features disabled</span>}
          </div>
        </>
      )}
    </div>
  );
}
