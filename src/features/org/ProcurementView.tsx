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
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { SchemaForm } from "@/components/ui";
import { ChartCard } from "@/components/ui/ChartCard";
import { BarChart, type ChartDatum } from "@/components/ui/Charts";
import { fmtRupees, fmtCompactRupees } from "@/app/financeQueries";
import { createPO } from "@/app/financeQueries";
import { listVendors, vendorOptionGroups, type Vendor } from "@/app/vendorQueries";
import { listFfeEntries, type FfeEntry } from "@/app/ffeQueries";
import {
  listOrgProjects, listOrgQuotes, upsertQuote, attachQuote, setQuoteStatus, deleteQuote,
  quoteTotal, QUOTE_NEXT, scoreQuote, bestScoredQuote, quoteFormSchema,
  type ProcurementQuote, type OrgProjectBrief, type QuoteStatus, type QuoteFormValues,
} from "@/app/procurementQuotes";

const STATUS_TONE: Record<QuoteStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  requested: "neutral", received: "info", selected: "success", rejected: "danger",
};
const STATUS_LABEL: Record<QuoteStatus, string> = {
  requested: "Requested", received: "Received", selected: "Selected", rejected: "Rejected",
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const scoreTone = (s: number): "success" | "warning" | "neutral" => (s >= 75 ? "success" : s >= 55 ? "warning" : "neutral");
const scoreLabel = (s: number): string => (s >= 75 ? "Best value" : s >= 55 ? "Good value" : "Basic");

export function ProcurementView(): JSX.Element {
  return <PlanGate feature="procurement"><ProcurementInner /></PlanGate>;
}

function ProcurementInner(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
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

  // Un-assigned quote attach form.
  const [attachQuoteId, setAttachQuoteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!orgId) { setError("No active organization."); setLoading(false); return; }
    const [projRes, quoteRes, vendorRes] = await Promise.all([
      listOrgProjects(client, orgId, undefined, memberProjectScope(session)),
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
  const vendorRating = (id: string | null): number | undefined => vendors.find(v => v.id === id)?.rating ?? undefined;

  const saveManual = async (ffeEntry: FfeEntry, values: QuoteFormValues) => {
    if (!String(values.itemName ?? "").trim() && !ffeEntry.name) return;
    const price = Number(values.unitPrice);
    if (!Number.isFinite(price) || price < 0) return;
    const vendorId = values.vendorId ? String(values.vendorId) : null;
    const itemName = String(values.itemName ?? "").trim() || ffeEntry.name;
    const qty = Math.max(1, Number(values.qty) || 1);
    const leadDays = values.leadDays != null && values.leadDays !== "" ? Number(values.leadDays) : null;
    const validUntil = values.validUntil ? String(values.validUntil) : null;
    const notes = String(values.notes ?? "").trim() || null;
    const optimistic: ProcurementQuote = {
      id: "tmp-" + Date.now(),
      orgId,
      ffeEntryId: ffeEntry.id,
      projectId: selectedProjectId || null,
      vendorId,
      vendorName: vendorName(vendorId),
      itemName,
      unitPrice: price,
      qty,
      leadDays,
      validUntil,
      status: "received",
      notes,
      createdBy: null,
      createdAt: "",
    };
    const prev = quotes;
    await run(`add-${ffeEntry.id}`, c => upsertQuote(c, {
      orgId, ffeEntryId: ffeEntry.id, projectId: selectedProjectId || null,
      vendorId, itemName,
      unitPrice: price, qty,
      leadDays, validUntil, status: "received",
      notes,
    }), {
      apply: () => setQuotes(p => [optimistic, ...p]),
      rollback: () => setQuotes(prev),
    });
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

  const QUOTE_FORM_LABELS = {
    fieldVendor: "Vendor",
    fieldItem: "Item",
    fieldUnitPrice: "Unit price",
    fieldQty: "Qty",
    fieldLeadDays: "Lead (days)",
    fieldValidUntil: "Valid until",
    fieldNotes: "Notes",
    vendorPlaceholder: "— Select vendor —",
    itemPlaceholder: "Item name",
    unitPriceRequired: "Unit price is required.",
    qtyRequired: "Qty is required.",
  };

  const quoteForm = (ffeEntry: FfeEntry) => (
    <Card className="p-3 mt-2">
      <SchemaForm
        key={ffeEntry.id}
        schema={quoteFormSchema({
          ...QUOTE_FORM_LABELS,
          itemPlaceholder: ffeEntry.name || QUOTE_FORM_LABELS.itemPlaceholder,
        }, vendorOptionGroups(vendors))}
        submitLabel="Add quote"
        cancelLabel="Cancel"
        busy={busy === `add-${ffeEntry.id}`}
        columns={2}
        onCancel={() => setFormFfeId(null)}
        onSubmit={values => void saveManual(ffeEntry, values)}
      />
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

  const quoteRow = (q: ProcurementQuote, ffeEntry: FfeEntry | null, isBest: boolean, score: number | null) => (
    <Card key={q.id} className={`p-3 ${isBest ? "border-2 border-accent" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg-primary truncate">{q.vendorName}</span>
            <Badge tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge>
            {isBest && <Badge tone="success">Best</Badge>}
            {score != null && <Badge tone={scoreTone(score)}>{scoreLabel(score)}</Badge>}
            {q.itemName && ffeEntry && q.itemName !== ffeEntry.name && <span className="text-[11px] text-fg-tertiary truncate">{q.itemName}</span>}
          </div>
          <div className="text-[11px] text-fg-tertiary">
            {q.qty} × {fmtRupees(q.unitPrice)} = <span className="font-semibold text-fg-primary">{fmtRupees(quoteTotal(q))}</span>
            {q.leadDays != null && ` · ${q.leadDays}d lead`}
            {q.validUntil && ` · valid till ${q.validUntil}`}
            {score != null && ` · score ${score}/100`}
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
                const ratings = new Map(vendors.map(v => [v.id, v.rating ?? 0]));
                const bestScored = bestScoredQuote(list, todayISO(), ratings);
                const expandedOpen = expanded[ffeEntry.id];
                const scoreOf = (q: ProcurementQuote) => scoreQuote(q, list.filter(x => x.id !== q.id), vendorRating(q.vendorId)).score;
                return (
                  <Card key={ffeEntry.id} padding="md" title={<div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-fg-primary">{ffeEntry.name}</span>
                      {ffeEntry.code && <Badge tone="neutral">{ffeEntry.code}</Badge>}
                    </div>
                    <div className="text-[11px] text-fg-tertiary">{ffeEntry.qty} × {fmtRupees(ffeEntry.unitCost)} spec'd{ffeEntry.spaceOrRoom ? ` · ${ffeEntry.spaceOrRoom}` : ""}</div>
                  </div>} action={<div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setFormFfeId(formFfeId === ffeEntry.id ? null : ffeEntry.id)}>
                      {formFfeId === ffeEntry.id ? "Cancel" : "+ Quote"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(x => ({ ...x, [ffeEntry.id]: !x[ffeEntry.id] }))}>
                      {expandedOpen ? "Hide quotes" : `Quotes (${list.length})`}
                    </Button>
                  </div>}>
                    {formFfeId === ffeEntry.id && quoteForm(ffeEntry)}
                    {expandedOpen && (
                      <div className="mt-3 space-y-2">
                        {list.length === 0 && <div className="text-sm text-fg-tertiary">No quotes yet.</div>}
                        {(() => {
                          const priceData = quotePriceData(list, bestScored !== null ? bestScored.id : null);
                          return priceData.length >= 2 ? (
                            <ChartCard
                              title="Unit price comparison"
                              empty={false}
                              height={120}
                              padding="none"
                            >
                              <BarChart data={priceData} color="var(--st-accent)" showValues formatValue={fmtCompactRupees} />
                            </ChartCard>
                          ) : null;
                        })()}
                        {list.map(q => quoteRow(
                          q,
                          ffeEntry,
                          bestScored !== null && q.id === bestScored.id,
                          bestScored !== null && q.id === bestScored.id ? bestScored.score.score : scoreOf(q),
                        ))}
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

/** Quote unit-price comparison series (vendor → unit price); rejected / zero-price quotes dropped. */
export function quotePriceData(quotes: ProcurementQuote[], bestQuoteId: string | null): ChartDatum[] {
  return quotes
    .filter(q => q.status !== "rejected" && q.unitPrice > 0)
    .map(q => ({ label: q.vendorName ?? "Vendor", value: q.unitPrice, color: q.id === bestQuoteId ? "var(--st-success)" : undefined }));
}
