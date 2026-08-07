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
import { getClient } from "@/lib/supabase";
import { PlanGate, useOrgSwitcher, useCan } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Spinner, Alert, AccessDenied, Badge } from "@/components/ui/atoms";
import { Select, Input, Textarea, FormField } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import {
  listOrgLeads, createLead, updateLead, setLeadStage, deleteLead,
  listLeadMeetings, addMeeting, setMeetingOutcome, deleteMeeting,
  listLeadQuotations, addQuotation, setQuoteStatus,
  listLeadAgreements, addAgreement, setAgreementStatus,
  crmRollup, LEAD_STAGES, LEAD_SOURCES, LEAD_STAGE_NEXT,
  type Lead, type LeadSource, type LeadStage, type LeadMeeting, type LeadQuotation, type LeadAgreement,
} from "@/app/crmQueries";

const STAGE_TONE: Record<LeadStage, "neutral" | "info" | "warning" | "success" | "danger"> = {
  new: "neutral", contacted: "info", meeting_scheduled: "info",
  quotation_sent: "warning", negotiating: "warning", agreement_signed: "success",
  won: "success", lost: "danger",
};

const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New", contacted: "Contacted", meeting_scheduled: "Meeting", quotation_sent: "Quoted",
  negotiating: "Negotiating", agreement_signed: "Agreement", won: "Won", lost: "Lost",
};

const FILTERS = [{ value: "all", label: "All stages" }, ...LEAD_STAGES.map(s => ({ value: s, label: STAGE_LABEL[s] }))];

export function CrmView(): JSX.Element {
  return <PlanGate feature="crm"><CrmInner /></PlanGate>;
}

function CrmInner(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("crm:view", { orgId: activeOrg?.orgId });
  if (!canView) return <AccessDenied message="You don't have permission to view the sales pipeline." />;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
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
  const canManage = useCan("crm:manage", { orgId });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listOrgLeads(client, orgId); if (res.ok) setLeads(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const { run } = useAction(reload, setError);
  const rollup = useMemo(() => crmRollup(leads), [leads]);
  const shown = filter === "all" ? leads : leads.filter(l => l.stage === filter);

  const handleCreate = async (input: LeadInput) => {
    const client = await getClient(); if (!client) return;
    let done = false;
    await run("create", async c => { const r = await createLead(c, orgId, input); done = r.ok; return r; });
    if (done) setCreating(false);
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
      key: "lead", header: "Lead", className: "flex-1 min-w-0",
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
      key: "contact", header: "Contact", hideOnMobile: true, className: "flex-shrink-0",
      render: (l: Lead) => <span className="text-xs text-fg-secondary truncate">{l.phone ?? l.email ?? "—"}</span>,
    },
    {
      key: "budget", header: "Budget", hideOnMobile: true, className: "flex-shrink-0",
      render: (l: Lead) => <span className="text-xs text-fg-secondary">{l.budget == null ? "—" : fmtRupees(l.budget)}</span>,
    },
    {
      key: "stage", header: "Stage", className: "flex-shrink-0",
      render: (l: Lead) => <Badge tone={STAGE_TONE[l.stage]}>{STAGE_LABEL[l.stage]}</Badge>,
    },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Sales</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Pipeline</h1>
            <p className="text-fg-secondary text-sm mt-2">Leads, quotations and agreements — from prospecting to signed client.</p>
          </div>
          {canManage && <Button onClick={() => setCreating(true)}>New lead</Button>}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Leads</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.total}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Open</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.open}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Pipeline</div><div className="font-display text-2xl font-bold text-warning mt-1">{fmtRupees(rollup.pipelineValue)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Won</div><div className="font-display text-2xl font-bold text-success mt-1">{fmtRupees(rollup.wonValue)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Win rate</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rollup.conversionRate}%</div></Card>
        <Card className="p-4 flex flex-col justify-center">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Stage split</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {LEAD_STAGES.map(s => (
              <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-elevated text-fg-secondary" title={STAGE_LABEL[s]}>{s.replace("_", " ")} · {rollup.byStage[s]}</span>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex justify-end mb-6">
        <Select className="w-44" value={filter} onChange={e => setFilter(e.target.value)} options={FILTERS} />
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-border">
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={l => l.id}
            variant="card"
            emptyMessage={filter === "all" ? "No leads in the pipeline yet — add your first one." : `No leads at the "${STAGE_LABEL[filter as LeadStage]}" stage.`}
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
        />
      )}
    </div>
  );
}

function NewLeadModal({ onClose, onCreate }: { onClose: () => void; onCreate: (i: LeadInput) => void }): JSX.Element {
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
    <Modal open onClose={onClose} title="New lead">
      <div className="space-y-3">
        <FormField label="Name *" htmlFor="lead-name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Client / contact" /></FormField>
        <FormField label="Company" htmlFor="lead-company"><Input value={company} onChange={e => setCompany(e.target.value)} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Phone" htmlFor="lead-phone"><Input value={phone} onChange={e => setPhone(e.target.value)} /></FormField>
          <FormField label="Email" htmlFor="lead-email"><Input value={email} onChange={e => setEmail(e.target.value)} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Source" htmlFor="lead-source">
            <Select value={source} onChange={e => setSource(e.target.value as LeadSource)} options={LEAD_SOURCES.map(s => ({ value: s, label: s.replace("_", " ") }))} />
          </FormField>
          <FormField label="Budget (₹)" htmlFor="lead-budget"><Input type="number" value={budget} onChange={e => setBudget(e.target.value)} /></FormField>
        </div>
        <FormField label="Notes" htmlFor="lead-notes"><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></FormField>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!name.trim()}>Create</Button>
      </div>
    </Modal>
  );
}

function LeadDrawer({ lead, canManage, onClose, onAdvance, onMove, onDelete }: {
  lead: Lead; canManage: boolean; onClose: () => void;
  onAdvance: (id: string, s: LeadStage) => void; onMove: (id: string, s: LeadStage) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const [tab, setTab] = useState<"meetings" | "quotations" | "agreements">("meetings");
  const next = LEAD_STAGE_NEXT[lead.stage];
  const [name, setName] = useState(lead.name);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rename = async () => {
    const v = name.trim(); if (!v || v === lead.name) return;
    setSaving(true); setMsg(null);
    const client = await getClient(); if (!client) { setMsg("Backend not configured."); setSaving(false); return; }
    const r = await updateLead(client, lead.id, { name: v });
    setMsg(r.ok ? "Saved." : r.error); setSaving(false);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={lead.name} subtitle={lead.company ?? undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STAGE_TONE[lead.stage]}>{STAGE_LABEL[lead.stage]}</Badge>
        {lead.budget ? <span className="text-xs text-fg-secondary">Budget {fmtRupees(lead.budget)}</span> : null}
        {lead.phone ? <span className="text-xs text-fg-secondary">{lead.phone}</span> : null}
        {lead.email ? <span className="text-xs text-fg-secondary">{lead.email}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {canManage && lead.stage !== "won" && lead.stage !== "lost" && next && (
            <Button size="sm" onClick={() => onAdvance(lead.id, lead.stage)}>{`→ ${STAGE_LABEL[next]}`}</Button>
          )}
          {canManage && (
            <>
              <Select className="w-36" value={lead.stage} onChange={e => onMove(lead.id, e.target.value as LeadStage)} options={LEAD_STAGES.map(s => ({ value: s, label: STAGE_LABEL[s] }))} />
              <Button size="sm" variant="danger" onClick={() => { if (confirm("Delete this lead?")) onDelete(lead.id); }}>Delete</Button>
            </>
          )}
        </div>
      </div>

      {msg && <div className="mb-2 text-xs text-fg-secondary">{msg}</div>}

      {canManage && (
        <div className="mb-3 flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Lead name" />
          <Button size="sm" variant="ghost" onClick={() => void rename()} disabled={saving || !name.trim() || name.trim() === lead.name}>Save</Button>
        </div>
      )}

      <div className="flex gap-1 border-b border-default">
        {(["meetings", "quotations", "agreements"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 capitalize ${tab === t ? "border-accent text-fg-primary" : "border-transparent text-fg-tertiary"}`}>
            {t}
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
  const [rows, setRows] = useState<LeadMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sched, setSched] = useState("");
  const [agenda, setAgenda] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLeadMeetings(client, leadId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [leadId]);
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

  if (loading) return <Spinner size={18} />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <FormField label="When" htmlFor="meet-when">
            <Input type="datetime-local" value={sched} onChange={e => setSched(e.target.value)} className="w-52" />
          </FormField>
          <FormField label="Agenda" htmlFor="meet-agenda">
            <Input value={agenda} onChange={e => setAgenda(e.target.value)} placeholder="Purpose" className="w-56" />
          </FormField>
          <Button size="sm" onClick={() => void add()} disabled={!sched}>Add meeting</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-fg-tertiary py-4">No meetings yet.</div>
      ) : (
        rows.map(m => (
          <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-fg-primary truncate">{new Date(m.scheduledAt).toLocaleString()} {m.agenda ? `· ${m.agenda}` : ""}</div>
              <div className="text-[11px] text-fg-tertiary capitalize">{m.outcome}{m.notes ? ` — ${m.notes}` : ""}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Select className="w-28" value={m.outcome} onChange={e => void outcome(m.id, e.target.value as typeof m.outcome)} options={["pending", "done", "cancelled", "no_show"].map(o => ({ value: o, label: o.replace("_", " ") }))} />
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
  const [rows, setRows] = useState<LeadQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [valid, setValid] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLeadQuotations(client, leadId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [leadId]);
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

  if (loading) return <Spinner size={18} />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <FormField label="Title" htmlFor="q-title"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Interior fit-out" className="w-44" /></FormField>
          <FormField label="Amount (₹)" htmlFor="q-amount"><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" /></FormField>
          <FormField label="Valid until" htmlFor="q-valid"><Input type="date" value={valid} onChange={e => setValid(e.target.value)} className="w-36" /></FormField>
          <Button size="sm" onClick={() => void add()} disabled={amount === ""}>Add quotation</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-fg-tertiary py-4">No quotations yet.</div>
      ) : (
        rows.map(q => (
          <div key={q.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-fg-primary truncate">{q.title ?? "Quotation"} · {fmtRupees(q.amount)}</div>
              <div className="text-[11px] text-fg-tertiary capitalize">{q.status}{q.validUntil ? ` · valid to ${q.validUntil}` : ""}</div>
            </div>
            {canManage && (
              <Select className="w-32 flex-shrink-0" value={q.status} onChange={e => void setStatus(q.id, e.target.value as typeof q.status)} options={["draft", "sent", "accepted", "rejected", "superseded"].map(s => ({ value: s, label: s }))} />
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Agreements ────────────────────────────────────────────────────────────
function AgreementsPanel({ leadId, canManage }: { leadId: string; canManage: boolean }): JSX.Element {
  const [rows, setRows] = useState<LeadAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [signer, setSigner] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLeadAgreements(client, leadId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [leadId]);
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

  if (loading) return <Spinner size={18} />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <FormField label="Title" htmlFor="ag-title"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Client agreement" className="w-44" /></FormField>
          <FormField label="Amount (₹)" htmlFor="ag-amount"><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" /></FormField>
          <Button size="sm" onClick={() => void add()} disabled={amount === ""}>Add agreement</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-fg-tertiary py-4">No agreements yet.</div>
      ) : (
        rows.map(a => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-fg-primary truncate">{a.title ?? "Agreement"} · {fmtRupees(a.amount)}</div>
              <div className="text-[11px] text-fg-tertiary capitalize">{a.status}{a.status === "signed" && a.signedAt ? ` · signed ${new Date(a.signedAt).toLocaleDateString()}` : ""}{a.signedBy ? ` by ${a.signedBy}` : ""}</div>
            </div>
            {canManage && a.status !== "signed" && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Input value={signer} onChange={e => setSigner(e.target.value)} placeholder="Signer" className="w-28" />
                <Button size="sm" onClick={() => void setStatus(a.id, "signed", signer.trim() || undefined)}>Sign</Button>
                {a.status === "pending" && <Button size="sm" variant="ghost" onClick={() => void setStatus(a.id, "rejected")}>Reject</Button>}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}