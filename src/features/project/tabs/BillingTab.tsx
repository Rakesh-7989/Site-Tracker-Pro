// SiteTrack Pro — consultancy billing tab (v4 C2).
// Rate cards (rate:manage) + monthly retainers (retainer:manage) + hourly
// invoice generation from approved + unbilled time (billing:generate).
// Each section is independently plan-gated (rate_cards / retainer_billing /
// hourly_billing); the tab itself is capability-gated (requiresAny in
// tabs-config.ts). Invoice lifecycle (status changes) stays in the Invoices tab.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import type { TypedSupabaseClient } from "@/lib/supabase/db";
import { useCan, useOrgSwitcher } from "@/auth";
import { PlanGate } from "@/auth/PlanGate";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, StatCard } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/queries/financeQueries";
import { listInvoices, type Invoice, type InvoiceSource } from "@/app/queries/financeQueries";
import { publishInvoiceGenerated } from "@/app/queries/outboxQueries";
import { listRateCards, upsertRateCard, deleteRateCard, type RateCard } from "@/app/queries/rateCardQueries";
import { listTimeEntries, type TimeEntry } from "@/app/queries/timeQueries";
import {
  listRetainers, createRetainer, deleteRetainer, setRetainerStatus, RETAINER_NEXT, autoBillingHint,
  type Retainer, type RetainerStatus,
} from "@/app/queries/retainerQueries";
import {
  unbilledSummary, unbilledByMember, generateHourlyInvoice, generateRetainerInvoice,
} from "@/app/queries/billingQueries";
import { listProjectMembers, type ProjectMemberRow } from "@/app/queries/queries";
import { currentMonthRange } from "@/lib/utils/dateLocal";

const RETAINER_TONE: Record<RetainerStatus, "success" | "neutral" | "danger"> = {
  active: "success", paused: "neutral", cancelled: "danger",
};

const SOURCE_TONE: Record<InvoiceSource, "info" | "success" | "neutral"> = {
  phase: "neutral", hourly: "info", retainer: "success",
};

type GenFn = (c: TypedSupabaseClient) => Promise<{ ok: boolean; error?: string }>;

export function BillingTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const orgId = activeOrg?.orgId;
  const canRates = useCan("rate:manage", { orgId, projectId });
  const canRetainers = useCan("retainer:manage", { orgId, projectId });
  const canGenerate = useCan("billing:generate", { orgId, projectId });

  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  // rate-card form
  const [rcMember, setRcMember] = useState("");
  const [rcRate, setRcRate] = useState("");
  const [rcEffective, setRcEffective] = useState("");
  const [rcNotes, setRcNotes] = useState("");

  // retainer form
  const [rtTitle, setRtTitle] = useState("");
  const [rtAmount, setRtAmount] = useState("");
  const [rtBillingDay, setRtBillingDay] = useState("1");

  // hourly generation period
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // per-retainer generate period (fallback: current month)
  const [genPeriod, setGenPeriod] = useState<Record<string, { from: string; to: string }>>({});

  const reload = useCallback(async () => {
    setLoading(true); setError(null); setSuccess(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [membersRes, cardsRes, retainersRes, invoicesRes, entriesRes] = await Promise.all([
      listProjectMembers(client, projectId),
      listRateCards(client, projectId),
      listRetainers(client, projectId),
      listInvoices(client, projectId),
      listTimeEntries(client, projectId),
    ]);
    if (membersRes.ok) setMembers(membersRes.data); else setError(membersRes.error);
    if (cardsRes.ok) setRateCards(cardsRes.data);
    if (retainersRes.ok) setRetainers(retainersRes.data);
    if (invoicesRes.ok) setInvoices(invoicesRes.data);
    if (entriesRes.ok) setEntries(entriesRes.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const addRateCard = async () => {
    const r = Number(rcRate);
    if (!rcMember || !Number.isFinite(r) || r < 0) return;
    await run("rc", c => upsertRateCard(c, { projectId, profileId: rcMember, rate: r, effectiveFrom: rcEffective || undefined, notes: rcNotes.trim() || undefined }));
    setSuccess("Rate saved.");
    setRcMember(""); setRcRate(""); setRcEffective(""); setRcNotes("");
  };

  const addRetainer = async () => {
    const a = Number(rtAmount);
    if (!rtTitle.trim() || !Number.isFinite(a) || a < 0) return;
    const day = Number(rtBillingDay);
    await run("rt", c => createRetainer(c, { projectId, title: rtTitle.trim(), monthlyAmount: a, billingDay: Number.isFinite(day) && day >= 1 && day <= 28 ? day : 1 }));
    setSuccess("Retainer added.");
    setRtTitle(""); setRtAmount(""); setRtBillingDay("1");
  };

  const runGen = async (key: string, fn: GenFn, msg: string) => {
    setGenBusy(key); setError(null); setSuccess(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setGenBusy(null); return; }
    const res = await fn(client as unknown as TypedSupabaseClient);
    if (!res.ok) { setError(res.error ?? "Generation failed."); setGenBusy(null); return; }
    await reload();
    setSuccess(msg);
    setGenBusy(null);
  };

  const genHourly = async () => {
    if (!from || !to || from > to) { setError("Pick a valid billing period."); return; }
    await runGen("gh", async c => {
      const res = await generateHourlyInvoice(c, { projectId, periodFrom: from, periodTo: to });
      if (res.ok && orgId) {
        const inv = await listInvoices(c, projectId);
        const fresh = inv.ok ? inv.data.find(i => i.id === res.data.id) : undefined;
        if (fresh) {
          await publishInvoiceGenerated(c, { orgId, projectId, invoiceId: fresh.id, invoiceNo: fresh.no, amount: fresh.amount });
        }
      }
      return res;
    }, "Hourly invoice generated — see the list below.");
  };

  const genRetainer = async (r: Retainer) => {
    const p = genPeriod[r.id] ?? currentMonthRange();
    if (p.from > p.to) { setError(`Pick a valid period for ${r.title}.`); return; }
    await runGen(`gr-${r.id}`, async c => {
      const res = await generateRetainerInvoice(c, { retainerId: r.id, periodFrom: p.from, periodTo: p.to });
      if (res.ok && orgId) {
        const inv = await listInvoices(c, projectId);
        const fresh = inv.ok ? inv.data.find(i => i.id === res.data.id) : undefined;
        if (fresh) {
          await publishInvoiceGenerated(c, { orgId, projectId, invoiceId: fresh.id, invoiceNo: fresh.no, amount: fresh.amount, projectLabel: r.title });
        }
      }
      return res;
    }, `Invoice generated for ${r.title}.`);
  };

  const unbilled = unbilledSummary(entries);
  const unbilledRows = unbilledByMember(entries);
  const generated = invoices.filter(i => i.source === "hourly" || i.source === "retainer");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Billing</h2>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {loading ? (
        <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {canRates && (
            <PlanGate feature="rate_cards">
              <Card padding="md" title={<h3 className="font-semibold text-fg-primary">Rate cards</h3>} action={<Badge tone="info">{rateCards.length} set</Badge>}>
                <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-5 items-end">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Member</span>
                    <Select className="mt-1" value={rcMember} onChange={e => setRcMember(e.target.value)} options={[{ value: "", label: "Select member…" }, ...members.map(m => ({ value: m.profileId, label: m.name }))]} />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Rate (₹/h)</span>
                    <Input className="mt-1" type="number" min={0} placeholder="2000" value={rcRate} onChange={e => setRcRate(e.target.value)} />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Effective</span>
                    <Input className="mt-1" type="date" value={rcEffective} onChange={e => setRcEffective(e.target.value)} />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span>
                    <Input className="mt-1" placeholder="optional" value={rcNotes} onChange={e => setRcNotes(e.target.value)} />
                  </div>
                  <Button size="sm" onClick={() => void addRateCard()} disabled={busy === "rc" || !rcMember || !rcRate.trim()}>{busy === "rc" ? <Spinner size={14} /> : "Save rate"}</Button>
                </div>
                {rateCards.length > 0 && (
                  <div className="space-y-1.5">
                    {rateCards.map(card => (
                      <div key={card.id} className="flex items-center justify-between gap-2 text-sm">
                        <div>
                          <span className="font-semibold text-fg-primary">{card.memberName ?? "Unknown member"}</span>
                          <span className="text-fg-tertiary"> · {fmtRupees(card.rate)}/h · from {card.effectiveFrom}</span>
                          {card.notes && <span className="text-fg-tertiary"> · {card.notes}</span>}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => void run(`drc-${card.id}`, cc => deleteRateCard(cc, card.id), { apply: () => setRateCards(prev => prev.filter(x => x.id !== card.id)), rollback: () => setRateCards(prev => [...prev, card]) })}>
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </Card>
            </PlanGate>
          )}

          {canRetainers && (
            <PlanGate feature="retainer_billing">
              <Card padding="md" title={<h3 className="font-semibold text-fg-primary">Monthly retainers</h3>} action={<Badge tone="success">{retainers.filter(r => r.status === "active").length} active</Badge>}>
                <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-4 items-end">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span>
                    <Input className="mt-1" placeholder="e.g. Advisory retainer" value={rtTitle} onChange={e => setRtTitle(e.target.value)} />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Monthly (₹)</span>
                    <Input className="mt-1" type="number" min={0} placeholder="50000" value={rtAmount} onChange={e => setRtAmount(e.target.value)} />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Billing day</span>
                    <Input className="mt-1" type="number" min={1} max={28} value={rtBillingDay} onChange={e => setRtBillingDay(e.target.value)} />
                  </div>
                  <Button size="sm" onClick={() => void addRetainer()} disabled={busy === "rt" || !rtTitle.trim() || !rtAmount.trim()}>{busy === "rt" ? <Spinner size={14} /> : "Add retainer"}</Button>
                </div>
                {retainers.length > 0 && (
                  <div className="space-y-2">
                    {retainers.map(r => {
                      const p = genPeriod[r.id] ?? currentMonthRange();
                      return (
                        <Card key={r.id} className="p-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-fg-primary truncate">{r.title}</span>
                              <Badge tone={RETAINER_TONE[r.status]}>{r.status}</Badge>
                            </div>
                            <div className="text-[11px] text-fg-tertiary">
                              {fmtRupees(r.monthlyAmount)}/mo · day {r.billingDay}
                            </div>
                            {r.status === "active" && autoBillingHint(r.billingDay) && (
                              <div className="mt-1 text-[11px] text-fg-tertiary">{autoBillingHint(r.billingDay)}</div>
                            )}
                            {r.status === "active" && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <Input fit className="h-8 w-32" type="date" value={p.from} onChange={e => setGenPeriod(prev => ({ ...prev, [r.id]: { from: e.target.value, to: prev[r.id]?.to ?? p.to } }))} />
                                <Input fit className="h-8 w-32" type="date" value={p.to} onChange={e => setGenPeriod(prev => ({ ...prev, [r.id]: { from: prev[r.id]?.from ?? p.from, to: e.target.value } }))} />
                                <Button size="sm" disabled={genBusy === `gr-${r.id}`} onClick={() => void genRetainer(r)}>{genBusy === `gr-${r.id}` ? <Spinner size={14} /> : "Generate"}</Button>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {RETAINER_NEXT[r.status] && (
                              <Button size="sm" variant="ghost" onClick={() => void run(`sr-${r.id}`, c => setRetainerStatus(c, r.id, RETAINER_NEXT[r.status]!), { apply: () => setRetainers(prev => prev.map(x => x.id === r.id ? { ...x, status: RETAINER_NEXT[r.status]! } : x)), rollback: () => setRetainers(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) })}>
                                {RETAINER_NEXT[r.status] === "paused" ? "Pause" : "Resume"}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => void run(`drt-${r.id}`, c => deleteRetainer(c, r.id), { apply: () => setRetainers(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRetainers(prev => [...prev, r]) })}>
                              Delete
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
                </div>
              </Card>
            </PlanGate>
          )}

          {canGenerate && (
            <PlanGate feature="hourly_billing">
              <Card padding="md" title={<h3 className="font-semibold text-fg-primary">Hourly billing</h3>} action={<span className="text-sm text-fg-secondary">approved + unbilled only</span>}>
                <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3 items-end">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">From</span>
                    <Input className="mt-1" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">To</span>
                    <Input className="mt-1" type="date" value={to} onChange={e => setTo(e.target.value)} />
                  </div>
                  <Button size="sm" onClick={() => void genHourly()} disabled={genBusy === "gh" || !from || !to || from > to}>{genBusy === "gh" ? <Spinner size={14} /> : "Generate invoice"}</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <StatCard label="Unbilled hours" value={unbilled.hours.toFixed(1)} sub={`${unbilled.entries} entries`} accent="blue" />
                  <StatCard label="Unbilled value" value={fmtRupees(Math.round(unbilled.value))} sub="approved × rate" accent="emerald" />
                </div>
                {unbilledRows.length > 0 && (
                  <div className="space-y-1.5">
                    {unbilledRows.map(m => (
                      <div key={m.profileId} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-fg-primary">{m.memberName ?? "Unknown"}</span>
                        <span className="text-fg-tertiary">{m.hours.toFixed(1)}h · {fmtRupees(Math.round(m.value))}</span>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </Card>
            </PlanGate>
          )}

          {generated.length > 0 && (
            <Card padding="md" title={<h3 className="font-semibold text-fg-primary">Generated invoices</h3>}>
              <div className="space-y-2">
              <div className="space-y-1.5">
                {generated.map(i => (
                  <div key={i.id}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-fg-primary truncate">{i.no}</span>
                        <Badge tone={SOURCE_TONE[i.source ?? "phase"]}>{i.source ?? "manual"}</Badge>
                        <span className="text-fg-tertiary">{i.periodFrom ?? ""}{i.periodTo ? ` → ${i.periodTo}` : ""}</span>
                      </div>
                      <span className="font-semibold text-fg-primary flex-shrink-0">{fmtRupees(i.amount)} · {i.status}</span>
                    </div>
                    {i.lines.length > 0 && (
                      <div className="ml-6 mt-0.5 space-y-0.5 border-l border-default pl-3">
                        {i.lines.map(l => (
                          <div key={l.id} className="flex items-center justify-between gap-2 text-[11px] text-fg-secondary">
                            <span className="truncate">{l.description}{l.qty !== 1 ? ` × ${l.qty}` : ""}</span>
                            <span className="font-mono text-fg-primary flex-shrink-0">{fmtRupees(l.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
