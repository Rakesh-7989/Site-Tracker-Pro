// SiteTrack Pro — platform organizations (/admin/orgs, superadmin). Tenant
// management: page-scoped KPI strip, plan mix, plan filter, CSV export, inline
// plan changes + manage modal (delete / subscription actions). Orgs rows are
// enriched with live MRR + subscription status from the `orgs` view (migration
// 135) so every tenant row shows its revenue at a glance.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan } from "@/auth";
import { Card, Badge, Button, Spinner, Alert, Icon, AccessDenied, StatCard, type IconName } from "@/components/ui/atoms";
import { Modal } from "@/components/ui/Modal";
import { FormField, Input, Select } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarChart, type ChartDatum } from "@/components/ui/Charts";
import { buildCsv, downloadCsv, csvDateStamp, type CsvColumn } from "@/lib/genericCsv";
import {
  createOrgWithAdmin, listPlatformOrgs, setOrgPlan, ASSIGNABLE_PLANS, planUnlocksCustomRoles,
  PLAN_LABEL, ADMIN_PAGE_SIZE, adminDeleteOrg, adminSetSubscriptionStatus, getOrgSubscription,
  type AssignablePlan, type PlatformOrg, type OrgSubscriptionInfo,
} from "@/app/platformAdminQueries";
import { listOrgBillingRows, type OrgBillingRow } from "@/app/platformBillingQueries";

import { getClient } from "@/lib/supabase";

const PLAN_OPTIONS = ASSIGNABLE_PLANS.map(p => ({ value: p, label: PLAN_LABEL[p] ?? p }));

const planTone = (p: string): "neutral" | "info" | "success" | "warning" => (p === "business" ? "success" : p === "pro" ? "info" : (p === "custom" || p === "enterprise") ? "warning" : "neutral");
const subTone = (s: string | null | undefined): "neutral" | "success" | "warning" | "danger" | "info" => (
  s === "active" ? "success" : s === "trial" ? "info" : s === "paused" ? "warning" : s === "past_due" ? "danger" : s === "cancelled" ? "danger" : "neutral"
);
const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

export interface EnrichedOrg extends PlatformOrg { status: string | null; mrr: number }

/** Join live MRR + subscription status (orgs view) onto paged org rows by id. */
export function enrichOrgs(rows: PlatformOrg[], billing: OrgBillingRow[]): EnrichedOrg[] {
  const byId = new Map(billing.map(b => [b.id, b]));
  return rows.map(r => {
    const b = byId.get(r.id);
    return b ? { ...r, status: b.status, mrr: b.mrr } : { ...r, status: null, mrr: 0 };
  });
}

export interface OrgSummary { orgs: number; members: number; projects: number; mrr: number }

/** Page-scoped totals for the KPI strip (reflects the current search/filter). */
export function orgSummary(rows: EnrichedOrg[]): OrgSummary {
  const acc = { orgs: 0, members: 0, projects: 0, mrr: 0 };
  for (const r of rows) {
    acc.orgs += 1;
    acc.members += r.memberCount;
    acc.projects += r.projectCount;
    acc.mrr += r.mrr;
  }
  return acc;
}

/** Canonical plan display order for the mix chart. */
export const PLAN_MIX_ORDER: readonly string[] = [...ASSIGNABLE_PLANS];

/** Plan distribution of the current page (zero-count plans dropped). */
export function orgPlanMix(rows: EnrichedOrg[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.plan, (counts.get(r.plan) ?? 0) + 1);
  return PLAN_MIX_ORDER
    .map(p => ({ label: PLAN_LABEL[p] ?? p, value: counts.get(p) ?? 0 }))
    .filter(d => d.value > 0);
}

/** Client-side plan filter over the loaded page ("all" = no filter). */
export function filterOrgsByPlan(rows: EnrichedOrg[], plan: string): EnrichedOrg[] {
  if (!plan || plan === "all") return rows;
  return rows.filter(r => r.plan === plan);
}

/** Compact INR MRR (₹ + en-IN grouping); "—" for zero/unknown. */
export function fmtMrr(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

/** CSV column spec for the org export (raw values; MRR in INR). */
export const ORG_CSV_COLUMNS: ReadonlyArray<CsvColumn<keyof EnrichedOrg>> = [
  { key: "name", label: "Organization" },
  { key: "slug", label: "Slug" },
  { key: "plan", label: "Plan" },
  { key: "memberCount", label: "Members" },
  { key: "projectCount", label: "Projects" },
  { key: "mrr", label: "MRR (INR)" },
  { key: "status", label: "Subscription" },
  { key: "createdAt", label: "Created" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function PlatformOrgsView(): JSX.Element {
  const can = useCan("platform:orgs:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

interface Settled<T> { ok: boolean; data: T | null; error?: string }

type Lazy<T> = { ok: true; data: T } | { ok: false; error: string };

async function settle<T>(p: Promise<Lazy<T>>): Promise<Settled<T>> {
  try {
    const r = await p;
    if (r.ok) return { ok: true, data: r.data };
    return { ok: false, data: null, error: r.error };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function OrgsSkeleton(): JSX.Element {
  return (
    <div className="space-y-6" role="status" aria-label="Loading organizations">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-xl border border-default p-4 space-y-3">
            <Skeleton decorative height={10} width="w-16" />
            <Skeleton decorative height={24} width="w-12" />
          </div>
        ))}
      </div>
      <div className="bg-panel rounded-xl border border-default p-4 space-y-3">
        <Skeleton decorative height={10} width="w-24" />
        <Skeleton decorative height={160} width="w-full" />
      </div>
    </div>
  );
}

function Inner(): JSX.Element {
  const { session } = useAuth();
  const isOwner = session?.user.staffTier === "owner";
  const [rows, setRows] = useState<EnrichedOrg[]>([]);
  const [billingFailed, setBillingFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [planFilter, setPlanFilter] = useState("all");
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [manageOrg, setManageOrg] = useState<EnrichedOrg | null>(null);
  const [manageSub, setManageSub] = useState<OrgSubscriptionInfo | null>(null);
  const [manageSubLoading, setManageSubLoading] = useState(false);
  const [manageAction, setManageAction] = useState<string | null>(null);
  const [manageReason, setManageReason] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const [manageResult, setManageResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOrgName, setCreateOrgName] = useState("");
  const [createAdminEmail, setCreateAdminEmail] = useState("");
  const [createAdminPhone, setCreateAdminPhone] = useState("");
  const [createAdminName, setCreateAdminName] = useState("");
  const [createPlan, setCreatePlan] = useState<AssignablePlan>("basic");
  const [createResult, setCreateResult] = useState<{ tempPassword: string; emailSent: boolean; email: string; userAlreadyExisted: boolean } | null>(null);

  useEffect(() => { const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [or, br] = await Promise.all([
      settle(listPlatformOrgs(client, { limit: ADMIN_PAGE_SIZE, offset: page * ADMIN_PAGE_SIZE, search })),
      settle(listOrgBillingRows(client)),
    ]);
    if (or.ok && or.data) setRows(enrichOrgs(or.data, br.ok ? br.data ?? [] : []));
    else setError(or.error ?? "Failed to load organizations.");
    setBillingFailed(!br.ok);
    setLoading(false);
  }, [page, search]);
  useEffect(() => { void reload(); }, [reload]);

  const onOpenManage = useCallback(async (o: EnrichedOrg) => {
    setManageOrg(o); setManageAction(null); setManageReason(""); setManageResult(null); setManageBusy(false);
    setManageSubLoading(true); setManageSub(null);
    const client = await getClient();
    if (client) {
      const res = await getOrgSubscription(client, o.id);
      if (res.ok) setManageSub(res.data);
    }
    setManageSubLoading(false);
  }, []);

  const onCloseManage = useCallback(() => {
    setManageOrg(null); setManageSub(null); setManageAction(null); setManageReason(""); setManageResult(null); setManageBusy(false);
  }, []);

  const onConfirmManage = useCallback(async () => {
    if (!manageOrg || !manageAction) return;
    const reason = manageReason.trim() || "no reason given";
    setManageBusy(true); setManageResult(null);
    const client = await getClient();
    if (!client) { setManageResult({ ok: false, message: "Backend not configured." }); setManageBusy(false); return; }

    if (manageAction === "delete") {
      const res = await adminDeleteOrg(client, manageOrg.id, reason);
      if (res.ok) {
        setRows(prev => prev.filter(r => r.id !== manageOrg.id));
        setManageResult({ ok: true, message: `"${res.data.deleted}" deleted permanently.` });
      } else {
        setManageResult({ ok: false, message: res.error });
      }
    } else {
      const statusMap: Record<string, string> = {
        pause: "paused", cancel: "cancelled", hold: "past_due", reactivate: "active",
      };
      const targetStatus = statusMap[manageAction] || manageAction;
      const res = await adminSetSubscriptionStatus(client, manageOrg.id, targetStatus, reason);
      if (res.ok) {
        setManageSub(prev => prev ? { ...prev, status: targetStatus } : { status: targetStatus, plan: null, provider: null, currentPeriodEnd: null, trialEndsAt: null });
        setRows(prev => prev.map(r => r.id === manageOrg.id ? { ...r, status: targetStatus } : r));
        setManageResult({ ok: true, message: `Subscription for "${res.data.org}" changed: ${res.data.from ?? "(none)"} \u2192 ${res.data.to}.` });
      } else {
        setManageResult({ ok: false, message: res.error });
      }
    }
    setManageBusy(false);
  }, [manageOrg, manageAction, manageReason]);

  const onChangePlan = useCallback(async (o: EnrichedOrg, plan: string) => {
    if (plan === o.plan) return;
    const unlocksCustomRoles = planUnlocksCustomRoles(plan);
    const note = unlocksCustomRoles ? "\n\nThis plan UNLOCKS per-org role + feature customization (custom roles)." : "";
    if (!window.confirm(`Change "${o.name}" plan from ${PLAN_LABEL[o.plan] ?? o.plan} \u2192 ${PLAN_LABEL[plan] ?? plan}?${note}`)) return;
    setPlanBusyId(o.id); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setPlanBusyId(null); return; }
    const res = await setOrgPlan(client, o.id, plan);
    setPlanBusyId(null);
    if (res.ok) setRows(prev => prev.map(r => r.id === o.id ? { ...r, plan } : r));
    else setError(res.error);
  }, []);

  const onCreateOrg = useCallback(async () => {
    const name = createOrgName.trim();
    const email = createAdminEmail.trim().toLowerCase();
    const phone = createAdminPhone.trim();
    if (!name) { setError("Organization name is required."); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Valid admin email is required."); return; }
    if (!phone || !/^[\d\s+\-()]{7,20}$/.test(phone)) { setError("Valid admin phone number is required."); return; }
    setCreating(true); setError(null); setNotice(null); setCreateResult(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setCreating(false); return; }
    const res = await createOrgWithAdmin(client, {
      orgName: name,
      adminEmail: email,
      adminPhone: phone,
      plan: createPlan,
      adminName: createAdminName.trim() || undefined,
    });
    setCreating(false);
    if (res.ok) {
      setCreateResult({
        tempPassword: res.data.tempPassword,
        emailSent: res.data.emailSent,
        email: res.data.user.email,
        userAlreadyExisted: res.data.userAlreadyExisted,
      });
      setNotice(
        `Created "${res.data.org.name}" on ${PLAN_LABEL[res.data.org.plan] ?? res.data.org.plan}. ` +
        (res.data.emailSent ? "Welcome email sent." : res.data.userAlreadyExisted ? "User already existed (password unchanged)." : "Email not sent \u2014 check RESEND_API_KEY.")
      );
      if (page === 0 && !search) setRows(prev => [{
        id: res.data.org.id, name: res.data.org.name, slug: res.data.org.slug,
        plan: res.data.org.plan, memberCount: 0, projectCount: 0, createdAt: res.data.org.createdAt,
        status: null, mrr: 0,
      }, ...prev].slice(0, ADMIN_PAGE_SIZE));
      else { setPage(0); setSearch(""); setQ(""); void reload(); }
    } else setError(res.error);
  }, [createOrgName, createAdminEmail, createAdminPhone, createAdminName, createPlan, page, reload, search]);

  const hasNext = rows.length === ADMIN_PAGE_SIZE;

  const filtered = filterOrgsByPlan(rows, planFilter);
  const summary = orgSummary(filtered);
  const planData = orgPlanMix(filtered);

  const onExport = useCallback(() => {
    const content = buildCsv(filtered as unknown as Array<Record<string, unknown>>, ORG_CSV_COLUMNS);
    if (!content) return;
    downloadCsv(`organizations-${csvDateStamp()}.csv`, content);
  }, [filtered]);

  const columns = [
    { key: "org", header: "Organization", render: (o: EnrichedOrg) => (
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fg-primary truncate">{o.name}</span>
          <Badge tone={planTone(o.plan)}>{PLAN_LABEL[o.plan] ?? o.plan}</Badge>
          {planUnlocksCustomRoles(o.plan) && <span title="Per-org custom roles unlocked"><Badge tone="warning"><Icon name="lock" size={11} /> custom roles</Badge></span>}
        </div>
        <div className="text-[11px] text-fg-tertiary">{o.slug} \u00b7 created {fmtDate(o.createdAt)}</div>
      </div>
    )},
    { key: "members", header: "Members", render: (o: EnrichedOrg) => (
      <div className="text-center"><div className="text-lg font-bold text-fg-primary leading-none">{o.memberCount}</div><div className="text-[10px] text-fg-tertiary uppercase tracking-wide">members</div></div>
    )},
    { key: "projects", header: "Projects", render: (o: EnrichedOrg) => (
      <div className="text-center"><div className="text-lg font-bold text-fg-primary leading-none">{o.projectCount}</div><div className="text-[10px] text-fg-tertiary uppercase tracking-wide">projects</div></div>
    )},
    { key: "revenue", header: "Revenue", render: (o: EnrichedOrg) => (
      <div className="text-center">
        <div className="text-sm font-semibold text-fg-primary leading-none">{fmtMrr(o.mrr)}</div>
        {o.status && o.status !== "active" && (
          <div className="mt-1"><Badge tone={subTone(o.status)}>{o.status}</Badge></div>
        )}
      </div>
    )},
    { key: "plan", header: "Plan", render: (o: EnrichedOrg) => (
      planBusyId === o.id
        ? <div className="grid place-items-center h-9"><Spinner size={16} /></div>
        : <Select aria-label="Change plan" options={PLAN_OPTIONS} value={o.plan} onChange={e => void onChangePlan(o, e.target.value)} />
    )},
    { key: "actions", header: "", render: (o: EnrichedOrg) => (
      <Button size="sm" variant="ghost" disabled={manageOrg?.id === o.id} onClick={() => void onOpenManage(o)}
        className="!text-accent hover:!bg-accent-tint" title="Manage organization">
        {manageOrg?.id === o.id ? <Spinner size={14} /> : <Icon name="sliders" size={16} />}
      </Button>
    )},
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-primary">Organizations</h1>
          <div className="text-sm text-fg-secondary">Every tenant on the platform</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" leftIcon={<Icon name="download" size={14} />} onClick={onExport} disabled={filtered.length === 0}>
            Export CSV
          </Button>
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
        <Card className="p-4 space-y-4">
          {createResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-success bg-success-tint px-3 py-2 rounded-lg text-sm font-semibold">
                <Icon name="check" size={16} /> Organization created successfully
              </div>
              <div className="text-sm bg-warning-tint border border-warning rounded-lg p-3 space-y-1.5">
                <p className="font-semibold text-warning">Admin login credentials</p>
                <p className="text-warning">Email: <span className="font-mono font-bold">{createResult.email}</span></p>
                <p className="text-warning">Temporary password: <span className="font-mono font-bold text-base bg-warning-tint px-2 py-0.5 rounded select-all">{createResult.tempPassword}</span></p>
                <p className="text-[11px] text-warning mt-1">Save this password \u2014 it will only be shown once.</p>
              </div>
              <p className="text-xs text-fg-secondary">
                {createResult.emailSent ? "Welcome email sent with credentials." : createResult.userAlreadyExisted ? "User already existed (original password unchanged)." : "Email not sent \u2014 configure RESEND_API_KEY."}
              </p>
              <Button size="sm" onClick={() => { setShowCreate(false); setCreateResult(null); setCreateOrgName(""); setCreateAdminEmail(""); setCreateAdminPhone(""); setCreateAdminName(""); }}>
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-fg-primary">Create a new organization with admin user</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Organization name" required htmlFor="create-org-name">
                  <Input id="create-org-name" value={createOrgName} onChange={e => setCreateOrgName(e.target.value)} placeholder="e.g. G Architects" disabled={creating} />
                </FormField>
                <FormField label="Plan" required htmlFor="create-org-plan">
                  <Select id="create-org-plan" value={createPlan} onChange={e => setCreatePlan(e.target.value as AssignablePlan)} options={PLAN_OPTIONS} disabled={creating} />
                </FormField>
                <FormField label="Admin email" required htmlFor="create-admin-email">
                  <Input id="create-admin-email" type="email" value={createAdminEmail} onChange={e => setCreateAdminEmail(e.target.value)} placeholder="admin@example.com" disabled={creating} />
                </FormField>
                <FormField label="Admin phone" required htmlFor="create-admin-phone">
                  <Input id="create-admin-phone" value={createAdminPhone} onChange={e => setCreateAdminPhone(e.target.value)} placeholder="+91 98765 43210" disabled={creating} />
                </FormField>
                <FormField label="Admin name" optional htmlFor="create-admin-name">
                  <Input id="create-admin-name" value={createAdminName} onChange={e => setCreateAdminName(e.target.value)} placeholder="e.g. Rakesh" disabled={creating} />
                </FormField>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="md" onClick={() => void onCreateOrg()} disabled={creating || !createOrgName.trim() || !createAdminEmail.trim() || !createAdminPhone.trim()}>
                  {creating ? <Spinner size={14} /> : "Create organization & admin"}
                </Button>
                <Button size="md" variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {loading ? <OrgsSkeleton /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Organizations" value={summary.orgs} sub={(search || planFilter !== "all") ? "filtered" : `page ${page + 1}`} />
            <StatCard label="Members" value={summary.members} sub="on this page" />
            <StatCard label="Projects" value={summary.projects} sub="on this page" />
            <StatCard label="MRR" value={fmtMrr(summary.mrr)} sub={billingFailed ? "unavailable" : "on this page"} />
          </div>
          <ChartCard
            title="Plan mix"
            subtitle="Organizations by plan"
            height={180}
            empty={planData.length === 0}
            emptyMessage="No organizations on this page"
          >
            <BarChart data={planData} />
          </ChartCard>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Search by name or slug\u2026" value={q} onChange={e => setQ(e.target.value)} className="sm:flex-1" />
        <Select fit aria-label="Filter by plan" value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          options={[{ value: "all", label: "All plans" }, ...PLAN_OPTIONS]} className="sm:w-44" />
      </div>
      <DataTable
        dense
        columns={columns}
        rows={filtered}
        rowKey={o => o.id}
        loading={loading}
        error={error}
        emptyMessage={search ? `No organizations match "${search}".` : planFilter !== "all" ? "No organizations on this plan." : "No organizations yet."}
        variant="card"
        pagination={{ page, hasNext, busy: loading, onPrev: () => setPage(p => Math.max(0, p - 1)), onNext: () => setPage(p => p + 1) }}
      />
      <Modal
        open={!!manageOrg}
        onClose={onCloseManage}
        title={manageOrg?.name ?? ""}
        size="lg"
        action={<div className="flex items-center gap-2">
          {manageOrg && <Badge tone={planTone(manageOrg.plan)}>{PLAN_LABEL[manageOrg.plan] ?? manageOrg.plan}</Badge>}
          {manageSubLoading ? <Spinner size={12} /> : manageSub?.status ? (
            <Badge tone={subTone(manageSub.status)}>{manageSub.status}</Badge>
          ) : <Badge tone="neutral">no subscription</Badge>}
        </div>}
      >
        {manageOrg && (<>
          <div className="space-y-4">
            {manageSub && !manageSubLoading && (
              <div className="text-[11px] text-fg-secondary flex gap-4">
                {manageSub.provider && <span>Provider: {manageSub.provider}</span>}
                {manageSub.currentPeriodEnd && <span>Period end: {fmtDate(manageSub.currentPeriodEnd)}</span>}
              </div>
            )}

            {manageAction === null ? (
              <div className="grid grid-cols-2 gap-2">
                <ActionTile icon="trash" label="Delete org" desc="Permanently delete all data" tone="danger" onClick={() => setManageAction("delete")} />
                <ActionTile icon="pause" label="Pause subscription" desc="Admin-initiated pause" onClick={() => setManageAction("pause")} />
                <ActionTile icon="x" label="Cancel subscription" desc="Permanently cancel" onClick={() => setManageAction("cancel")} />
                <ActionTile icon="alert" label="Hold for payment" desc="Mark as past-due" onClick={() => setManageAction("hold")} />
                {manageSub?.status && manageSub.status !== "active" && (
                  <ActionTile icon="play" label="Reactivate" desc="Resume subscription" onClick={() => setManageAction("reactivate")} className="col-span-2" />
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-fg-primary font-medium">
                  {manageAction === "delete" ? `Delete "${manageOrg.name}" and ALL its data?` :
                   manageAction === "pause" ? `Pause subscription for "${manageOrg.name}"?` :
                   manageAction === "cancel" ? `Cancel subscription for "${manageOrg.name}"?` :
                   manageAction === "hold" ? `Mark "${manageOrg.name}" as past-due for payment?` :
                   manageAction === "reactivate" ? `Reactivate subscription for "${manageOrg.name}"?` : ""}
                </div>
                <FormField label="Reason" required htmlFor="manage-reason">
                  <textarea id="manage-reason" value={manageReason} onChange={e => setManageReason(e.target.value)}
                    className="w-full px-3 py-2 border border-default rounded-lg text-sm bg-bg-primary min-h-[80px] resize-y"
                    placeholder="Explain why this action is being taken\u2026" disabled={manageBusy} />
                </FormField>
                {manageResult && (
                  <Alert variant={manageResult.ok ? "success" : "danger"}>{manageResult.message}</Alert>
                )}
                <div className="flex gap-2">
                  {manageResult?.ok ? (
                    <Button size="sm" onClick={onCloseManage}>Done</Button>
                  ) : (
                    <>
                      <Button size="sm" variant={manageAction === "delete" ? "danger" : "primary"}
                        loading={manageBusy} disabled={!manageReason.trim()}
                        onClick={() => void onConfirmManage()}>
                        {manageBusy ? "Processing\u2026" : "Confirm"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setManageAction(null); setManageResult(null); setManageReason(""); }} disabled={manageBusy}>Back</Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>)}
      </Modal>
    </div>
  );
}

function ActionTile({ icon, label, desc, tone = "neutral", onClick, className = "" }: {
  icon: IconName; label: string; desc: string; tone?: "neutral" | "danger"; onClick: () => void; className?: string;
}): JSX.Element {
  const c = tone === "danger"
    ? "border-error hover:bg-error-tint text-error"
    : "border-default hover:bg-bg-secondary text-fg-primary";
  return (
    <button onClick={onClick} className={`flex items-center gap-3 p-3 rounded-xl border bg-bg-primary text-left transition-all ${c} ${className}`}>
      <Icon name={icon} size={18} />
      <div>
        <div className="font-semibold text-sm leading-tight">{label}</div>
        <div className="text-[10px] text-fg-tertiary mt-0.5">{desc}</div>
      </div>
    </button>
  );
}
