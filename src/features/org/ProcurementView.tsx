// SiteTrack Pro — procurement quote-comparison view (v4 D5, /procurement).
//
// Org-level register of vendor quotes for spec'd FF&E items (and free-text
// items). Managers pick a project → its FF&E entries → expand to compare
// received quotes side-by-side with the cheapest highlighted, then raise a PO
// against the best quote (reuses the existing purchase_orders pipeline). A
// second mode lists un-assigned quotes (submitted by org-tier vendors or
// entered manually) for attachment to an FF&E entry.
//
// Gates: plan `procurement` (Business+) via <PlanGate>, capability
// `procurement:view` via <AccessDenied>. Nav shows only for architecture /
// interior / multiple-segment orgs (segments gate in nav-config).

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClient } from "@/lib/supabase";
import { PlanGate, useOrgSwitcher, useCan } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { Select, Input } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { createPO } from "@/app/financeQueries";
import { listVendors, type Vendor } from "@/app/vendorQueries";
import { listFfeEntries, type FfeEntry } from "@/app/ffeQueries";
import {
  listOrgProjects, listOrgQuotes, upsertQuote, attachQuote, setQuoteStatus, deleteQuote,
  bestQuote, quoteTotal, QUOTE_NEXT,
  type ProcurementQuote, type OrgProjectBrief, type QuoteStatus,
} from "@/app/procurementQuotes";

const STATUS_TONE: Record<QuoteStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  requested: "neutral", received: "info", selected: "success", rejected: "danger",
};
const STATUS_LABEL: Record<QuoteStatus, string> = {
  requested: "Requested", received: "Received", selected: "Selected", rejected: "Rejected",
};
const todayISO = () => new Date().toISOString().slice(0, 10);

export function ProcurementView(): JSX.Element {
  return <PlanGate feature="procurement"><ProcurementInner /></PlanGate>;
}

function ProcurementInner(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("procurement:view", { orgId: activeOrg?.orgId });
  const orgId = activeOrg?.orgId ?? "";

  const [projects, setProjects] = useState<OrgProjectBrief[]>([]);
  const [quotes, setQuotes] = useState<ProcurementQuote[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [ffe, setFfe] = useState<FfeEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual quote form (per FF&E item).
  const [formFfeId, setFormFfeId] = useState<string | null>(null);
  const [form, setForm] = useState({ vendorId: "", itemName: "", unitPrice: "", qty: "1", leadDays: "", validUntil: "", notes: "" });

  // Un-assigned quote attach form.
  const [attachQuoteId, setAttachQuoteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!orgId) { setError("No active organization."); setLoading(false); return; }
    const [projRes, quoteRes, vendorRes] = await Promise.all([
      listOrgProjects(client, orgId),
      listOrgQuotes(client, orgId),
      listVendors(client, orgId),
    ]);
    if (!projRes.ok) { setError(projRes.error); setLoading(false); return; }
    if (!quoteRes.ok) { setError(quoteRes.error); setLoading(false); return; }
    if (!vendorRes.ok) { setError(vendorRes.error); setLoading(false); return; }
    setProjects(projRes.data);
    setQuotes(quoteRes.data);
    setVendors(vendorRes.data);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const reloadFfe = useCallback(async (projectId: string) => {
    const client = await getClient();
    if (!client) return;
    const res = await listFfeEntries(client, projectId);
    if (res.ok) setFfe(res.data); else setError(res.error);
  }, []);

  useEffect(() => {
    if (selectedProjectId) void reloadFfe(selectedProjectId);
    else setFfe([]);
  }, [selectedProjectId, reloadFfe]);

  const { busy, run } = useAction(reload, setError);

  if (!canView) return <AccessDenied message="You don't have permission to view procurement." />;

  const unassigned = quotes.filter(q => !q.ffeEntryId && !q.projectId);
  const byFfe = useMemo(() => {
    const map = new Map<string, ProcurementQuote[]>();
    for (const q of quotes) {
      if (!q.ffeEntryId) continue;
      const list = map.get(q.ffeEntryId) ?? [];
      list.push(q);
      map.set(q.ffeEntryId, list);
    }
    return map;
  }, [quotes]);

  const vendorName = (id: string | null) => vendors.find(v => v.id === id)?.name ?? "Unknown vendor";

  const saveManual = async (ffeEntry: FfeEntry) => {
    if (!form.itemName.trim() && !ffeEntry.name) return;
    const price = Number(form.unitPrice);
    if (!Number.isFinite(price) || price < 0) return;
    const vendorId = form.vendorId || null;
    const optimistic: ProcurementQuote = {
      id: "tmp-" + Date.now(),
      orgId,
      ffeEntryId: ffeEntry.id,
      projectId: ffeEntry.id ? selectedProjectId || null : null,
      vendorId,
      vendorName: vendorName(vendorId),
      itemName: form.itemName.trim() || ffeEntry.name,
      unitPrice: price,
      qty: Math.max(1, Number(form.qty) || 1),
      leadDays: form.leadDays ? Number(form.leadDays) : null,
      validUntil: form.validUntil || null,
      status: "received",
      notes: form.notes.trim() || null,
      createdBy: null,
      createdAt: "",
    };
    const prev = quotes;
    await run(`add-${ffeEntry.id}`, c => upsertQuote(c, {
      orgId, ffeEntryId: ffeEntry.id, projectId: selectedProjectId || null,
      vendorId, itemName: form.itemName.trim() || ffeEntry.name,
      unitPrice: price, qty: Math.max(1, Number(form.qty) || 1),
      leadDays: form.leadDays ? Number(form.leadDays) : null,
      validUntil: form.validUntil || null, status: "received",
      notes: form.notes.trim() || null,
    }), {
      apply: () => setQuotes(p => [optimistic, ...p]),
      rollback: () => setQuotes(prev),
    });
    setForm({ vendorId: "", itemName: "", unitPrice: "", qty: "1", leadDays: "", validUntil: "", notes: "" });
    setFormFfeId(null);
  };

  const raisePO = async (ffeEntry: FfeEntry, q: ProcurementQuote) => {
    const projectId = selectedProjectId;
    if (!projectId) return;
    const amount = quoteTotal(q);
    const prevQuotes = quotes;
    const poNo = `PO-${Date.now().toString(36).toUpperCase()}`;
    await run(`po-${q.id}`, async c => {
      const po = await createPO(c, {
        projectId,
        poNo,
        items: q.itemName || ffeEntry.name || ffeEntry.code,
        amount,
        deliveryDate: null,
        vendorId: q.vendorId,
        quoteId: q.id,
      });
      if (!po.ok) return po;
      return setQuoteStatus(c, q.id, "selected");
    }, {
      apply: () => setQuotes(p => p.map(x => x.id === q.id ? { ...x, status: "selected" as const } : x)),
      rollback: () => setQuotes(prevQuotes),
    });
  };

  const submitAttach = async (q: ProcurementQuote, projectId: string, ffeEntryId: string) => {
    const prev = quotes;
    await run(`attach-${q.id}`, c => attachQuote(c, q.id, projectId, ffeEntryId, "received"), {
      apply: () => setQuotes(p => p.map(x => x.id === q.id ? { ...x, projectId, ffeEntryId, status: "received" as const } : x)),
      rollback: () => setQuotes(prev),
    });
    setAttachQuoteId(null);
  };

  const toggle = async (q: ProcurementQuote) => {
    const next = QUOTE_NEXT[q.status];
    const prev = quotes;
    await run(`s-${q.id}`, c => setQuoteStatus(c, q.id, next), {
      apply: () => setQuotes(p => p.map(x => x.id === q.id ? { ...x, status: next } : x)),
      rollback: () => setQuotes(prev),
    });
  };

  const remove = async (q: ProcurementQuote) => {
    const prev = quotes;
    await run(`d-${q.id}`, c => deleteQuote(c, q.id), {
      apply: () => setQuotes(p => p.filter(x => x.id !== q.id)),
      rollback: () => setQuotes(prev),
    });
  };

  const quoteForm = (ffeEntry: FfeEntry) => (
    <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end mt-2">
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Vendor</span>
        <Select className="mt-1" value={form.vendorId}
          options={[{ value: "", label: "— Select vendor —" }, ...vendors.map(v => ({ value: v.id, label: v.name }))]}
          onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} />
      </div>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Item</span>
        <Input className="mt-1" placeholder={ffeEntry.name || "Item name"} value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} />
      </div>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Unit price (₹)</span>
        <Input className="mt-1" type="number" min={0} value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} />
      </div>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Qty</span>
        <Input className="mt-1" type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
      </div>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Lead (days)</span>
        <Input className="mt-1" type="number" min={0} value={form.leadDays} onChange={e => setForm(f => ({ ...f, leadDays: e.target.value }))} />
      </div>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Valid until</span>
        <Input className="mt-1" type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
      </div>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span>
        <Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex gap-2 items-end">
        <Button className="flex-1" disabled={busy === `add-${ffeEntry.id}` || !(Number(form.unitPrice) >= 0)} onClick={() => void saveManual(ffeEntry)}>
          {busy === `add-${ffeEntry.id}` ? <Spinner size={14} /> : "Add quote"}
        </Button>
        <Button variant="ghost" onClick={() => setFormFfeId(null)}>Cancel</Button>
      </div>
    </Card>
  );

  const attachSelect = (q: ProcurementQuote) => (
    <div className="mt-2 p-3 border border-default rounded-lg space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Attach to project FF&E entry</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={selectedProjectId}
          options={[{ value: "", label: "— Select project —" }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
          onChange={e => setSelectedProjectId(e.target.value)} />
        <Select value=""
          options={[{ value: "", label: "— Select FF&E item —" }, ...ffe.map(f => ({ value: f.id, label: `${f.code || "FFE"} · ${f.name}` }))]}
          onChange={e => {
            if (e.target.value) void submitAttach(q, selectedProjectId, e.target.value);
          }} />
      </div>
    </div>
  );

  const quoteRow = (q: ProcurementQuote, ffeEntry: FfeEntry | null, isBest: boolean) => (
    <Card key={q.id} className={`p-3 ${isBest ? "border-2 border-accent" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg-primary truncate">{q.vendorName}</span>
            <Badge tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge>
            {isBest && <Badge tone="success">Best</Badge>}
            {q.itemName && ffeEntry && q.itemName !== ffeEntry.name && <span className="text-[11px] text-fg-tertiary truncate">{q.itemName}</span>}
          </div>
          <div className="text-[11px] text-fg-tertiary">
            {q.qty} × {fmtRupees(q.unitPrice)} = <span className="font-semibold text-fg-primary">{fmtRupees(quoteTotal(q))}</span>
            {q.leadDays != null && ` · ${q.leadDays}d lead`}
            {q.validUntil && ` · valid till ${q.validUntil}`}
            {q.notes && ` · ${q.notes}`}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {q.status === "received" && selectedProjectId && ffeEntry && (
            <Button size="sm" variant="secondary" disabled={busy === `po-${q.id}`} onClick={() => void raisePO(ffeEntry, q)}>
              {busy === `po-${q.id}` ? <Spinner size={12} /> : "Raise PO"}
            </Button>
          )}
          <button type="button" disabled={busy === `s-${q.id}`} onClick={() => void toggle(q)} title="Advance status">
            <Badge tone={STATUS_TONE[q.status]}>{QUOTE_NEXT[q.status]}</Badge>
          </button>
          <Button size="sm" variant="ghost" onClick={() => void remove(q)}>✕</Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Architecture</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Procurement</h1>
        <p className="text-fg-secondary text-sm mt-2">Compare vendor quotes for spec'd FF&E items and free-text procurements, then raise a PO against the best quote.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : (
        <div className="space-y-8">
          <div>
            <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Project</label>
            <Select className="mt-1 max-w-sm" value={selectedProjectId}
              options={[{ value: "", label: "— Select a project to compare quotes —" }, ...projects.map(p => ({ value: p.id, label: `${p.name}${p.type ? ` · ${p.type}` : ""}` }))]}
              onChange={e => setSelectedProjectId(e.target.value)} />
          </div>

          {selectedProjectId && (
            <div className="space-y-3">
              <h2 className="font-display text-lg font-bold text-fg-primary">FF&E items</h2>
              {ffe.length === 0 && (
                <Card className="p-6 text-center text-sm text-fg-secondary">No FF&E entries for this project yet. Quotes are grouped under their spec'd item.</Card>
              )}
              {ffe.map(ffeEntry => {
                const list = byFfe.get(ffeEntry.id) ?? [];
                const best = bestQuote(list, todayISO());
                const expandedOpen = expanded[ffeEntry.id];
                return (
                  <Card key={ffeEntry.id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-fg-primary">{ffeEntry.name}</span>
                          {ffeEntry.code && <Badge tone="neutral">{ffeEntry.code}</Badge>}
                        </div>
                        <div className="text-[11px] text-fg-tertiary">{ffeEntry.qty} × {fmtRupees(ffeEntry.unitCost)} spec'd{ffeEntry.spaceOrRoom ? ` · ${ffeEntry.spaceOrRoom}` : ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setFormFfeId(formFfeId === ffeEntry.id ? null : ffeEntry.id)}>
                          {formFfeId === ffeEntry.id ? "Cancel" : "+ Quote"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setExpanded(x => ({ ...x, [ffeEntry.id]: !x[ffeEntry.id] }))}>
                          {expandedOpen ? "Hide quotes" : `Quotes (${list.length})`}
                        </Button>
                      </div>
                    </div>
                    {formFfeId === ffeEntry.id && quoteForm(ffeEntry)}
                    {expandedOpen && (
                      <div className="mt-3 space-y-2">
                        {list.length === 0 && <div className="text-sm text-fg-tertiary">No quotes yet.</div>}
                        {list.map(q => quoteRow(q, ffeEntry, best !== null && q.id === best.id))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <div>
            <h2 className="font-display text-lg font-bold text-fg-primary">Unassigned quotes</h2>
            <p className="text-sm text-fg-secondary mb-3">Vendor-submitted or manual quotes not yet attached to a spec'd item.</p>
            {unassigned.length === 0 && (
              <Card className="p-6 text-center text-sm text-fg-secondary">No unassigned quotes. Vendor-portal submissions appear here.</Card>
            )}
            {unassigned.map(q => (
              <Card key={q.id} className="p-3 mb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-fg-primary truncate">{q.vendorName}</span>
                      <Badge tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge>
                      {q.itemName && <span className="text-[11px] text-fg-tertiary truncate">{q.itemName}</span>}
                    </div>
                    <div className="text-[11px] text-fg-tertiary">
                      {q.qty} × {fmtRupees(q.unitPrice)} = <span className="font-semibold text-fg-primary">{fmtRupees(quoteTotal(q))}</span>
                      {q.leadDays != null && ` · ${q.leadDays}d lead`}
                      {q.validUntil && ` · valid till ${q.validUntil}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => setAttachQuoteId(attachQuoteId === q.id ? null : q.id)}>
                      {attachQuoteId === q.id ? "Cancel" : "Attach"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(q)}>✕</Button>
                  </div>
                </div>
                {attachQuoteId === q.id && attachSelect(q)}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
