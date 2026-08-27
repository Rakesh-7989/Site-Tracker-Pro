// SiteTrack Pro — CRM & Sales pipeline (v4 Phase A, /crm).
//
// Org-wide lead pipeline: leads → meetings → quotations → agreements. Shows
// funnel stats, a filterable stage list, lead create/edit with stage
// transitions, and a detail drawer per lead with its meetings, quotations
// and agreements (each addable).
//
// Gates: plan `crm` (Business+) via <PlanGate>, capability `crm:view` via
// <AccessDenied>, module `crm` via the plugin route <ModuleGuard>. Write
// actions (create/update lead, add meeting/quote/agreement) additionally
// gated by `crm:manage`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { PlanGate, useOrgSwitcher, useCan } from "@/auth";
import { defaultProjectTypeFor } from "@/auth/segmentConfig";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Alert, AccessDenied, Badge } from "@/components/ui/atoms";
import { Select, Input, Textarea, FormField } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { fmtRupees } from "@/app/queries/financeQueries";
import {
  listOrgLeads, createLead, updateLead, setLeadStage, setLeadOwner, deleteLead,
  listLeadMeetings, addMeeting, setMeetingOutcome, deleteMeeting,
  listLeadQuotations, addQuotation, setQuoteStatus,
  listLeadAgreements, addAgreement, setAgreementStatus,
  createProjectFromLead, acceptedQuote, acceptQuotationAsAgreement,
  crmRollup, LEAD_STAGES, LEAD_SOURCES, LEAD_STAGE_NEXT,
  type Lead, type LeadSource, type LeadStage, type LeadMeeting, type LeadQuotation, type LeadAgreement,
} from "@/app/queries/crmQueries";
import { useNavigate } from "react-router-dom";
import { useT } from "@/i18n/I18nProvider";

const STAGE_TONE: Record<LeadStage, "neutral" | "info" | "warning" | "success" | "danger"> = {
  new: "neutral", contacted: "info", meeting_scheduled: "info",
  quotation_sent: "warning", negotiating: "warning", agreement_signed: "success",
  won: "success", lost: "danger",
};

function stageLabel(t: (k: string, v?: Record<string, string | number>) => string, s: LeadStage): string {
  return t(`crm.stage.${s}`);
}

function FILTERS(t: (k: string, v?: Record<string, string | number>) => string) {
  return [{ value: "all", label: t("crm.filterAllStages") }, ...LEAD_STAGES.map(s => ({ value: s, label: stageLabel(t, s) }))];
}

export function CrmView(): JSX.Element {
  return <PlanGate feature="crm"><CrmInner /></PlanGate>;
}

function CrmInner(): JSX.Element {
  const t = useT();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("crm:view", { orgId: activeOrg?.orgId });
  if (!canView) return <AccessDenied message={t("crm.denied")} />;
  if (!activeOrg) return <Alert variant="warning">{t("crm.selectOrg")}</Alert>;
  return <Pipeline orgId={activeOrg.orgId} />;
}

interface LeadInput {
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: LeadSource | null;
  budget?: number | null;
  notes?: string | null;
}

function Pipeline({ orgId }: { orgId: string }): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const canManage = useCan("crm:manage", { orgId });
  const { activeOrg } = useOrgSwitcher();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("crm.backendError")); setLoading(false); return; }
    const res = await listOrgLeads(client, orgId); if (res.ok) setLeads(res.data); else setError(res.error); setLoading(false);
  }, [orgId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const { run } = useAction(reload, setError);
  const rollup = useMemo(() => crmRollup(leads), [leads]);
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leads) if (l.ownerId && !m.has(l.ownerId)) m.set(l.ownerId, l.ownerName ?? l.ownerId.slice(0, 8));
    return [...m.entries()];
  }, [leads]);
  const shown = (filter === "all" ? leads : leads.filter(l => l.stage === filter))
    .filter(l => ownerFilter === "all" || l.ownerId === ownerFilter);

  const handleCreate = async (input: LeadInput) => {
    const client = await getClient(); if (!client) return;
    let done = false;
    await run("create", async c => { const r = await createLead(c, orgId, input); done = r.ok; return r; });
    if (done) setCreating(false);
  };

  const handleHandoff = async (lead: Lead) => {
    const type = defaultProjectTypeFor(activeOrg?.segment) as string;
    const client = await getClient(); if (!client) return;
    let projectId: string | null = null;
    await run("handoff", async c => {
      const r = await createProjectFromLead(c, {
        orgId, leadId: lead.id,
        name: lead.company ? `${lead.name} — ${lead.company}` : lead.name,
        type, budget: lead.wonAmount ?? lead.budget ?? 0,
      });
      if (r.ok) projectId = r.data.projectId;
      return r;
    });
    if (projectId) navigate(`/projects/${projectId}`);
  };

  const handleAdvance = async (leadId: string, stage: LeadStage) => {
    const next = LEAD_STAGE_NEXT[stage]; if (!next) return;
    await run("advance", c => setLeadStage(c, leadId, next));
  };

  const handleMove = async (leadId: string, stage: LeadStage) => {
    await run("move", c => setLeadStage(c, leadId, stage));
  };

  const handleDelete = async (leadId: string) => {
    let done = false;
    await run("delete", async c => { const r = await deleteLead(c, leadId); done = r.ok; return r; });
    if (done) setSelected(null);
  };

  const columns = [
    {
      key: "lead", header: t("crm.colLead"), className: "flex-1 min-w-0",
      render: (l: Lead) => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{l.name}</div>
          <div className="text-[11px] text-fg-tertiary truncate">
            {l.company ?? "—"}{l.source ? ` · ${l.source.replace("_", " ")}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "contact", header: t("crm.colContact"), hideOnMobile: true, className: "flex-shrink-0",
      render: (l: Lead) => <span className="text-xs text-fg-secondary truncate">{l.phone ?? l.email ?? "—"}</span>,
    },
    {
      key: "budget", header: t("crm.colBudget"), hideOnMobile: true, className: "flex-shrink-0",
      render: (l: Lead) => <span className="text-xs text-fg-secondary">{l.budget == null ? "—" : fmtRupees(l.budget)}</span>,
    },
    {
      key: "stage", header: t("crm.colStage"), className: "flex-shrink-0",
      render: (l: Lead) => <Badge tone={STAGE_TONE[l.stage]}>{stageLabel(t, l.stage)}</Badge>,
    },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— {t("crm.eyebrow")}</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">{t("crm.title")}</h1>
            <p className="text-fg-secondary text-sm mt-2">{t("crm.subtitle")}</p>
          </div>
          {canManage && <Button onClick={() => setCreating(true)}>{t("crm.newLead")}</Button>}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("crm.statLeads")}</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.total}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("crm.statOpen")}</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.open}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("crm.statPipeline")}</div><div className="font-display text-2xl font-bold text-warning mt-1">{fmtRupees(rollup.pipelineValue)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("crm.statWon")}</div><div className="font-display text-2xl font-bold text-success mt-1">{fmtRupees(rollup.wonValue)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("crm.statWinRate")}</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.conversionRate}%</div></Card>
        <Card className="p-4 flex flex-col justify-center">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("crm.statStageSplit")}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {LEAD_STAGES.map(s => (
              <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-elevated text-fg-secondary" title={stageLabel(t, s)}>{s.replace("_", " ")} · {rollup.byStage[s]}</span>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-2 mb-6">
        <Select fit className="w-48" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
          options={[{ value: "all", label: t("crm.ownersFilter") }, ...owners.map(([id, name]) => ({ value: id, label: name }))]} />
        <Select fit className="w-44" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS(t)} />
      </div>

      {loading ? (
        <div role="status" aria-label="Loading leads" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton decorative height={14} width="w-1/3" />
                <Skeleton decorative height={12} width="w-1/4" />
              </div>
              <Skeleton decorative height={20} width="w-16" />
              <Skeleton decorative height={20} width="w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-border">
          <DataTable
            dense
            columns={columns}
            rows={shown}
            rowKey={l => l.id}
            variant="card"
            emptyMessage={filter === "all" ? t("crm.emptyAll") : t("crm.emptyStage", { stage: stageLabel(t, filter as LeadStage) })}
            onRowClick={l => setSelected(l)}
          />
        </div>
      )}

      {creating && <NewLeadModal onClose={() => setCreating(false)} onCreate={handleCreate} />}

      {selected && (
        <LeadDrawer
          lead={selected}
          canManage={!!canManage}
          onClose={() => setSelected(null)}
          onAdvance={handleAdvance}
          onMove={handleMove}
          onDelete={handleDelete}
          onHandoff={handleHandoff}
          owners={owners}
          reload={reload}
        />
      )}
    </div>
  );
}

function NewLeadModal({ onClose, onCreate }: { onClose: () => void; onCreate: (i: LeadInput) => void }): JSX.Element {
  const t = useT();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<LeadSource>("referral");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(), company: company.trim() || null, phone: phone.trim() || null,
      email: email.trim() || null, source, budget: budget ? Number(budget) : null,
      notes: notes.trim() || null,
    });
  };
  return (
    <Modal open onClose={onClose} title={t("crm.newLeadTitle")}>
      <div className="space-y-3">
        <FormField label={t("crm.fieldName")} htmlFor="lead-name"><Input value={name} onChange={e => setName(e.target.value)} placeholder={t("crm.namePlaceholder")} /></FormField>
        <FormField label={t("crm.fieldCompany")} htmlFor="lead-company"><Input value={company} onChange={e => setCompany(e.target.value)} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("crm.fieldPhone")} htmlFor="lead-phone"><Input value={phone} onChange={e => setPhone(e.target.value)} /></FormField>
          <FormField label={t("crm.fieldEmail")} htmlFor="lead-email"><Input value={email} onChange={e => setEmail(e.target.value)} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("crm.fieldSource")} htmlFor="lead-source">
            <Select value={source} onChange={e => setSource(e.target.value as LeadSource)} options={LEAD_SOURCES.map(s => ({ value: s, label: s.replace("_", " ") }))} />
          </FormField>
          <FormField label={t("crm.fieldBudget")} htmlFor="lead-budget"><Input type="number" value={budget} onChange={e => setBudget(e.target.value)} /></FormField>
        </div>
        <FormField label={t("crm.fieldNotes")} htmlFor="lead-notes"><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t("crm.cancel")}</Button>
        <Button onClick={submit} disabled={!name.trim()}>{t("crm.create")}</Button>
      </div>
    </Modal>
  );
}

function LeadDrawer({ lead, canManage, onClose, onAdvance, onMove, onDelete, onHandoff, owners, reload }: {
  lead: Lead; canManage: boolean; onClose: () => void;
  onAdvance: (id: string, s: LeadStage) => void; onMove: (id: string, s: LeadStage) => void;
  onDelete: (id: string) => void; onHandoff: (lead: Lead) => void;
  owners: [string, string][]; reload: () => void;
}): JSX.Element {
  const t = useT();
  const [tab, setTab] = useState<"meetings" | "quotations" | "agreements">("meetings");
  const next = LEAD_STAGE_NEXT[lead.stage];
  const [name, setName] = useState(lead.name);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rename = async () => {
    const v = name.trim(); if (!v || v === lead.name) return;
    setSaving(true); setMsg(null);
    const client = await getClient(); if (!client) { setMsg(t("crm.backendError")); setSaving(false); return; }
    const r = await updateLead(client, lead.id, { name: v });
    setMsg(r.ok ? t("crm.save") : r.error); setSaving(false);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={lead.name} subtitle={lead.company ?? undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STAGE_TONE[lead.stage]}>{stageLabel(t, lead.stage)}</Badge>
        {lead.budget ? <span className="text-xs text-fg-secondary">{t("crm.budgetLabel", { amount: fmtRupees(lead.budget) })}</span> : null}
        {lead.phone ? <span className="text-xs text-fg-secondary">{lead.phone}</span> : null}
        {lead.email ? <span className="text-xs text-fg-secondary">{lead.email}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {canManage && lead.stage === "won" && (
            <Button size="sm" onClick={() => onHandoff(lead)}>{t("crm.createProject")}</Button>
          )}
          {canManage && lead.stage !== "won" && lead.stage !== "lost" && next && (
            <Button size="sm" onClick={() => onAdvance(lead.id, lead.stage)}>{`→ ${stageLabel(t, next)}`}</Button>
          )}
          {canManage && (
            <>
              <Select fit className="w-36" value={lead.stage} onChange={e => onMove(lead.id, e.target.value as LeadStage)} options={LEAD_STAGES.map(s => ({ value: s, label: stageLabel(t, s) }))} />
              <Select fit className="w-36" value={lead.ownerId ?? ""} onChange={e => {
                const v = e.target.value || null;
                const doAssign = async () => {
                  const client = await getClient();
                  if (client) await setLeadOwner(client, lead.id, v);
                  void reload();
                };
                void doAssign();
              }} options={[{ value: "", label: t("crm.noOwner") }, ...owners.map(([id, name]) => ({ value: id, label: name }))]} />
              <Button size="sm" variant="danger" onClick={() => { if (confirm(t("crm.deleteLead"))) onDelete(lead.id); }}>{t("crm.delete")}</Button>
            </>
          )}
        </div>
      </div>

      {msg && <div className="mb-2 text-xs text-fg-secondary">{msg}</div>}

      {canManage && (
        <div className="mb-3 flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("crm.renamePlaceholder")} />
          <Button size="sm" variant="ghost" onClick={() => void rename()} disabled={saving || !name.trim() || name.trim() === lead.name}>{t("crm.save")}</Button>
        </div>
      )}

      <div className="flex gap-1 border-b border-default">
        {(["meetings", "quotations", "agreements"] as const).map(tt => (
          <button key={tt} onClick={() => setTab(tt)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 capitalize ${tab === tt ? "border-accent text-fg-primary" : "border-transparent text-fg-tertiary"}`}>
            {t(`crm.tab${tt.charAt(0).toUpperCase()}${tt.slice(1)}`)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "meetings" && <MeetingsPanel leadId={lead.id} canManage={canManage} />}
        {tab === "quotations" && <QuotationsPanel leadId={lead.id} canManage={canManage} />}
        {tab === "agreements" && <AgreementsPanel leadId={lead.id} canManage={canManage} />}
      </div>
    </Modal>
  );
}

// ── Meetings ──────────────────────────────────────────────────────────────
function MeetingsPanel({ leadId, canManage }: { leadId: string; canManage: boolean }): JSX.Element {
  const t = useT();
  const [rows, setRows] = useState<LeadMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sched, setSched] = useState("");
  const [agenda, setAgenda] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("crm.backendError")); setLoading(false); return; }
    const res = await listLeadMeetings(client, leadId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [leadId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    if (!sched) return;
    const client = await getClient(); if (!client) return;
    const r = await addMeeting(client, leadId, { scheduledAt: new Date(sched).toISOString(), agenda: agenda.trim() || null });
    if (r.ok) { setSched(""); setAgenda(""); void reload(); }
  };
  const outcome = async (id: string, o: "pending" | "done" | "cancelled" | "no_show") => {
    const client = await getClient(); if (!client) return;
    await setMeetingOutcome(client, id, o); void reload();
  };
  const del = async (id: string) => {
    const client = await getClient(); if (!client) return;
    await deleteMeeting(client, id); void reload();
  };

  if (loading) return (
    <div role="status" aria-label="Loading meetings" aria-busy="true" className="space-y-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-lg bg-elevated px-3 py-2 flex items-center gap-2">
          <div className="flex-1 space-y-1.5">
            <Skeleton decorative height={12} width="w-2/3" />
            <Skeleton decorative height={10} width="w-1/3" />
          </div>
          <Skeleton decorative height={20} width="w-24" />
        </div>
      ))}
    </div>
  );
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <FormField label={t("crm.fieldWhen")} htmlFor="meet-when">
            <Input fit type="datetime-local" value={sched} onChange={e => setSched(e.target.value)} className="w-52" />
          </FormField>
          <FormField label={t("crm.fieldAgenda")} htmlFor="meet-agenda">
            <Input fit value={agenda} onChange={e => setAgenda(e.target.value)} placeholder={t("crm.agendaPlaceholder")} className="w-56" />
          </FormField>
          <Button size="sm" onClick={() => void add()} disabled={!sched}>{t("crm.addMeeting")}</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-fg-tertiary py-4">{t("crm.noMeetings")}</div>
      ) : (
        rows.map(m => (
          <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-fg-primary truncate">{new Date(m.scheduledAt).toLocaleString()} {m.agenda ? `· ${m.agenda}` : ""}</div>
              <div className="text-[11px] text-fg-tertiary capitalize">{t(`crm.meetingOutcome.${m.outcome}`)}{m.notes ? ` — ${m.notes}` : ""}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Select fit className="w-28" value={m.outcome} onChange={e => void outcome(m.id, e.target.value as typeof m.outcome)} options={(["pending", "done", "cancelled", "no_show"] as const).map(o => ({ value: o, label: t(`crm.meetingOutcome.${o}`) }))} />
              {canManage && <button onClick={() => void del(m.id)} className="text-xs text-error">✕</button>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Quotations ────────────────────────────────────────────────────────────
function QuotationsPanel({ leadId, canManage }: { leadId: string; canManage: boolean }): JSX.Element {
  const t = useT();
  const [rows, setRows] = useState<LeadQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [valid, setValid] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("crm.backendError")); setLoading(false); return; }
    const res = await listLeadQuotations(client, leadId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [leadId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    const n = Number(amount); if (!Number.isFinite(n) || n < 0) return;
    const client = await getClient(); if (!client) return;
    const r = await addQuotation(client, leadId, { title: title.trim() || null, amount: n, validUntil: valid || null });
    if (r.ok) { setTitle(""); setAmount(""); setValid(""); void reload(); }
  };
  const setStatus = async (id: string, s: "draft" | "sent" | "accepted" | "rejected" | "superseded") => {
    const client = await getClient(); if (!client) return;
    await setQuoteStatus(client, id, s); void reload();
  };
  const accepted = canManage ? acceptedQuote(rows) : null;
  const convert = async (q: LeadQuotation) => {
    const client = await getClient(); if (!client) return;
    const r = await acceptQuotationAsAgreement(client, q.id);
    if (r.ok) { void reload(); }
  };

  if (loading) return (
    <div role="status" aria-label="Loading quotations" aria-busy="true" className="space-y-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-lg bg-elevated px-3 py-2 flex items-center gap-2">
          <div className="flex-1 space-y-1.5">
            <Skeleton decorative height={12} width="w-2/3" />
            <Skeleton decorative height={10} width="w-1/3" />
          </div>
          <Skeleton decorative height={20} width="w-24" />
        </div>
      ))}
    </div>
  );
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-3">
      {canManage && accepted && (
        <div className="rounded-lg bg-elevated border border-success px-3 py-2 flex items-center gap-2 text-xs">
          <span className="text-success">{t("crm.acceptedQuoteBanner", { amount: fmtRupees(accepted.amount) })}{accepted.title ? ` · ${accepted.title}` : ""}</span>
          <Button size="sm" className="ml-auto" onClick={() => void convert(accepted)}>{t("crm.createAgreement")}</Button>
        </div>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <FormField label={t("crm.fieldTitle")} htmlFor="q-title"><Input fit value={title} onChange={e => setTitle(e.target.value)} placeholder={t("crm.titlePlaceholder")} className="w-44" /></FormField>
          <FormField label={t("crm.fieldAmount")} htmlFor="q-amount"><Input fit type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" /></FormField>
          <FormField label={t("crm.fieldValidUntil")} htmlFor="q-valid"><Input fit type="date" value={valid} onChange={e => setValid(e.target.value)} className="w-36" /></FormField>
          <Button size="sm" onClick={() => void add()} disabled={amount === ""}>{t("crm.addQuotation")}</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-fg-tertiary py-4">{t("crm.noQuotations")}</div>
      ) : (
        rows.map(q => (
          <div key={q.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-fg-primary truncate">{q.title ?? t("crm.quotationTitle")} · {fmtRupees(q.amount)}</div>
              <div className="text-[11px] text-fg-tertiary capitalize">{t(`crm.quoteStatus.${q.status}`)}{q.validUntil ? ` · ${t("crm.validTo", { date: q.validUntil })}` : ""}</div>
            </div>
            {canManage && (
              <Select fit className="w-32 flex-shrink-0" value={q.status} onChange={e => void setStatus(q.id, e.target.value as typeof q.status)} options={(["draft", "sent", "accepted", "rejected", "superseded"] as const).map(s => ({ value: s, label: t(`crm.quoteStatus.${s}`) }))} />
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Agreements ────────────────────────────────────────────────────────────
function AgreementsPanel({ leadId, canManage }: { leadId: string; canManage: boolean }): JSX.Element {
  const t = useT();
  const [rows, setRows] = useState<LeadAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [signer, setSigner] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("crm.backendError")); setLoading(false); return; }
    const res = await listLeadAgreements(client, leadId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [leadId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    const n = Number(amount); if (!Number.isFinite(n) || n < 0) return;
    const client = await getClient(); if (!client) return;
    const r = await addAgreement(client, leadId, { title: title.trim() || null, amount: n });
    if (r.ok) { setTitle(""); setAmount(""); void reload(); }
  };
  const setStatus = async (id: string, s: "pending" | "signed" | "rejected" | "cancelled", signer?: string) => {
    const client = await getClient(); if (!client) return;
    await setAgreementStatus(client, id, s, signer); void reload();
  };

  if (loading) return (
    <div role="status" aria-label="Loading agreements" aria-busy="true" className="space-y-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-lg bg-elevated px-3 py-2 flex items-center gap-2">
          <div className="flex-1 space-y-1.5">
            <Skeleton decorative height={12} width="w-2/3" />
            <Skeleton decorative height={10} width="w-1/3" />
          </div>
          <Skeleton decorative height={20} width="w-24" />
        </div>
      ))}
    </div>
  );
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <FormField label={t("crm.fieldTitle")} htmlFor="ag-title"><Input fit value={title} onChange={e => setTitle(e.target.value)} placeholder={t("crm.agreementPlaceholder")} className="w-44" /></FormField>
          <FormField label={t("crm.fieldAmount")} htmlFor="ag-amount"><Input fit type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" /></FormField>
          <Button size="sm" onClick={() => void add()} disabled={amount === ""}>{t("crm.addAgreement")}</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-fg-tertiary py-4">{t("crm.noAgreements")}</div>
      ) : (
        rows.map(a => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-fg-primary truncate">{a.title ?? t("crm.agreementTitle")} · {fmtRupees(a.amount)}</div>
              <div className="text-[11px] text-fg-tertiary capitalize">{t(`crm.agreementStatus.${a.status}`)}{a.status === "signed" && a.signedAt ? ` · ${t("crm.signLabel", { date: new Date(a.signedAt).toLocaleDateString() })}` : ""}{a.signedBy ? t("crm.byLabel", { name: a.signedBy }) : ""}</div>
            </div>
            {canManage && a.status !== "signed" && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Input fit value={signer} onChange={e => setSigner(e.target.value)} placeholder={t("crm.signerPlaceholder")} className="w-28" />
                <Button size="sm" onClick={() => void setStatus(a.id, "signed", signer.trim() || undefined)}>{t("crm.sign")}</Button>
                {a.status === "pending" && <Button size="sm" variant="ghost" onClick={() => void setStatus(a.id, "rejected")}>{t("crm.reject")}</Button>}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}