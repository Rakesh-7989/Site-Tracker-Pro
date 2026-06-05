// SiteTrack Pro — platform home (/admin, superadmin). Cross-tenant overview:
// org / user / project counts, plan mix, signup pipeline + quick links.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCan } from "@/auth";
import { Card, Icon, Badge, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";
import { getPlatformStats, PLAN_LABEL, type PlatformStats } from "@/app/platformAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }

const LINKS: Array<{ to: string; label: string; icon: IconName; desc: string }> = [
  { to: "/admin/signups", label: "Signup requests", icon: "mail", desc: "Approve / reject new firms" },
  { to: "/admin/orgs", label: "Organizations", icon: "building", desc: "Every tenant + counts" },
  { to: "/admin/users", label: "Users", icon: "users", desc: "Everyone across tenants" },
  { to: "/admin/roles", label: "Role permissions", icon: "lock", desc: "Capabilities & custom roles" },
];
const PLAN_ORDER = ["basic", "pro", "business", "custom"];

export function PlatformDashboardView(): JSX.Element {
  const can = useCan("platform:orgs:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }): JSX.Element {
  return (
    <Card className="p-4">
      <div className={`text-3xl font-display font-bold ${accent ? "text-safety-600" : "text-ink-900"}`}>{value}</div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </Card>
  );
}

function Inner(): JSX.Element {
  const [s, setS] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getPlatformStats(client); if (res.ok) setS(res.data); else setError(res.error); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Platform</h1>
          <div className="text-sm text-ink-500">Cross-tenant overview</div>
        </div>
        <Badge tone="danger">Superadmin</Badge>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Organizations" value={s?.orgCount ?? 0} />
            <Stat label="Users" value={s?.userCount ?? 0} />
            <Stat label="Projects" value={s?.projectCount ?? 0} />
            <Stat label="Pending signups" value={s?.pendingSignups ?? 0} accent={(s?.pendingSignups ?? 0) > 0} />
          </div>

          {/* Plan mix */}
          <div>
            <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400 mb-2">Plan mix</h2>
            <Card className="p-4 flex flex-wrap gap-4">
              {PLAN_ORDER.map(p => (
                <div key={p} className="text-center min-w-[64px]">
                  <div className="text-2xl font-bold text-ink-900">{s?.plans?.[p] ?? 0}</div>
                  <div className="text-[11px] text-ink-500">{PLAN_LABEL[p] ?? p}</div>
                </div>
              ))}
              <div className="text-center min-w-[64px] border-l border-cream-200 pl-4">
                <div className="text-2xl font-bold text-ink-900">{s?.approvedSignups ?? 0}</div>
                <div className="text-[11px] text-ink-500">Approved</div>
              </div>
              <div className="text-center min-w-[64px]">
                <div className="text-2xl font-bold text-ink-900">{s?.staffCount ?? 0}</div>
                <div className="text-[11px] text-ink-500">Staff</div>
              </div>
            </Card>
          </div>

          {/* Quick links */}
          <div>
            <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400 mb-2">Manage</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LINKS.map(l => (
                <Link key={l.to} to={l.to}>
                  <Card className="p-4 hover:border-safety-300 transition cursor-pointer h-full relative">
                    {l.to === "/admin/signups" && (s?.pendingSignups ?? 0) > 0 && (
                      <span className="absolute top-3 right-3 text-[10px] font-bold bg-safety-500 text-white rounded-full px-1.5 py-0.5">{s?.pendingSignups}</span>
                    )}
                    <div className="w-9 h-9 rounded-lg bg-safety-50 text-safety-600 grid place-items-center mb-2"><Icon name={l.icon} size={18} /></div>
                    <div className="text-sm font-semibold text-ink-800">{l.label}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">{l.desc}</div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
