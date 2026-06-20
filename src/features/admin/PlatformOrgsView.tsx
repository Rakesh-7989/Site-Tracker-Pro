// SiteTrack Pro — platform Organizations (/admin/orgs, superadmin). Cross-tenant
// list of every org with member + project counts. Owner can also create orgs.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan } from "@/auth";
import { Card, Badge, Button, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { FormField, Input, Select } from "@/components/ui/forms";
import { createPlatformOrg, listPlatformOrgs, setOrgPlan, ASSIGNABLE_PLANS, planUnlocksCustomRoles, PLAN_LABEL, ADMIN_PAGE_SIZE, type AssignablePlan, type PlatformOrg } from "@/app/platformAdminQueries";
import { deleteOrganization } from "@/app/orgAdminQueries";
import { Pager } from "@/components/ui/Pager";

const PLAN_OPTIONS = ASSIGNABLE_PLANS.map(p => ({ value: p, label: PLAN_LABEL[p] ?? p }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const planTone = (p: string): "neutral" | "info" | "success" | "warning" => (p === "business" ? "success" : p === "pro" ? "info" : (p === "custom" || p === "enterprise") ? "warning" : "neutral");
const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

export function PlatformOrgsView(): JSX.Element {
  const can = useCan("platform:orgs:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

function Inner(): JSX.Element {
  const { session } = useAuth();
  const isOwner = session?.user.staffTier === "owner";
  const [rows, setRows] = useState<PlatformOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");   // debounced, server-side
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgPlan, setNewOrgPlan] = useState<AssignablePlan>("basic");

  // Debounce the search box → server-side query, reset to first page.
  useEffect(() => { const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPlatformOrgs(client, { limit: ADMIN_PAGE_SIZE, offset: page * ADMIN_PAGE_SIZE, search });
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [page, search]);
  useEffect(() => { void reload(); }, [reload]);

  const onDelete = useCallback(async (o: PlatformOrg) => {
    // Two-step confirm: must retype the org name. DPDP erasure — irreversible.
    const typed = window.prompt(`Permanently delete "${o.name}" and ALL its data?\n\nThis cannot be undone. Type the org name to confirm:`);
    if (typed == null) return; // cancelled
    if (typed.trim() !== o.name) { window.alert("Name did not match — deletion cancelled."); return; }
    setDeletingId(o.id); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setDeletingId(null); return; }
    const res = await deleteOrganization(client, o.id);
    setDeletingId(null);
    if (res.ok) { setRows(prev => prev.filter(r => r.id !== o.id)); }
    else setError(res.error);
  }, []);

  const onChangePlan = useCallback(async (o: PlatformOrg, plan: string) => {
    if (plan === o.plan) return;
    const unlocksCustomRoles = planUnlocksCustomRoles(plan);
    const note = unlocksCustomRoles ? "\n\nThis plan UNLOCKS per-org role + feature customization (custom roles)." : "";
    if (!window.confirm(`Change "${o.name}" plan from ${PLAN_LABEL[o.plan] ?? o.plan} → ${PLAN_LABEL[plan] ?? plan}?${note}`)) return;
    setPlanBusyId(o.id); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setPlanBusyId(null); return; }
    const res = await setOrgPlan(client, o.id, plan);
    setPlanBusyId(null);
    if (res.ok) setRows(prev => prev.map(r => r.id === o.id ? { ...r, plan } : r));
    else setError(res.error);
  }, []);

  const onCreateOrg = useCallback(async () => {
    const name = newOrgName.trim();
    if (!name) { setError("Organization name is required."); return; }
    setCreating(true); setError(null); setNotice(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setCreating(false); return; }
    const res = await createPlatformOrg(client, { name, plan: newOrgPlan });
    setCreating(false);
    if (res.ok) {
      setNotice(`Created ${res.data.name} on ${PLAN_LABEL[res.data.plan] ?? res.data.plan}.`);
      setNewOrgName("");
      setNewOrgPlan("basic");
      setShowCreate(false);
      if (page === 0 && !search) setRows(prev => [res.data, ...prev].slice(0, ADMIN_PAGE_SIZE));
      else { setPage(0); setSearch(""); setQ(""); void reload(); }
    } else setError(res.error);
  }, [newOrgName, newOrgPlan, page, reload, search]);

  const hasNext = rows.length === ADMIN_PAGE_SIZE;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-ink-900">Organizations</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-500">{search ? "filtered" : `page ${page + 1}`}</span>
          {isOwner && (
            <Button size="sm" onClick={() => setShowCreate(v => !v)} leftIcon={<Icon name="plus" size={14} />}>
              New organization
            </Button>
          )}
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {showCreate && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <FormField label="Organization name" htmlFor="platform-new-org-name">
              <Input
                id="platform-new-org-name"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                placeholder="e.g. G Architects"
                disabled={creating}
              />
            </FormField>
            <FormField label="Plan" htmlFor="platform-new-org-plan">
              <Select
                id="platform-new-org-plan"
                value={newOrgPlan}
                onChange={e => setNewOrgPlan(e.target.value as AssignablePlan)}
                options={PLAN_OPTIONS}
                disabled={creating}
              />
            </FormField>
            <div className="flex gap-2">
              <Button size="md" onClick={() => void onCreateOrg()} disabled={creating || !newOrgName.trim()}>
                {creating ? <Spinner size={14} /> : "Create"}
              </Button>
              <Button size="md" variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}
      <Input placeholder="Search by name or slug…" value={q} onChange={e => setQ(e.target.value)} />
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div>
        : rows.length === 0 ? <Card className="p-8 text-center text-sm text-ink-500"><Icon name="building" size={24} className="mx-auto text-ink-300 mb-2" />No organizations{search ? " match your search." : " yet."}</Card>
        : <><div className="space-y-2">{rows.map(o => (
            <Card key={o.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink-900 truncate">{o.name}</span>
                  <Badge tone={planTone(o.plan)}>{PLAN_LABEL[o.plan] ?? o.plan}</Badge>
                  {planUnlocksCustomRoles(o.plan) && <span title="Per-org custom roles unlocked"><Badge tone="warning"><Icon name="lock" size={11} /> custom roles</Badge></span>}
                </div>
                <div className="text-[11px] text-ink-400">{o.slug} · created {fmtDate(o.createdAt)}</div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 text-center">
                <div><div className="text-lg font-bold text-ink-900 leading-none">{o.memberCount}</div><div className="text-[10px] text-ink-400 uppercase tracking-wide">members</div></div>
                <div><div className="text-lg font-bold text-ink-900 leading-none">{o.projectCount}</div><div className="text-[10px] text-ink-400 uppercase tracking-wide">projects</div></div>
                <div className="w-28">
                  {planBusyId === o.id
                    ? <div className="grid place-items-center h-9"><Spinner size={16} /></div>
                    : <Select aria-label="Change plan" options={PLAN_OPTIONS} value={o.plan} onChange={e => void onChangePlan(o, e.target.value)} />}
                </div>
                <Button size="sm" variant="ghost" disabled={deletingId === o.id} onClick={() => void onDelete(o)}
                  className="!text-rose-600 hover:!bg-rose-50" title="Delete organization">
                  {deletingId === o.id ? <Spinner size={14} /> : <Icon name="trash" size={16} />}
                </Button>
              </div>
            </Card>
          ))}</div>
          <Pager page={page} hasNext={hasNext} busy={loading} onPrev={() => setPage(p => Math.max(0, p - 1))} onNext={() => setPage(p => p + 1)} />
          </>}
    </div>
  );
}
