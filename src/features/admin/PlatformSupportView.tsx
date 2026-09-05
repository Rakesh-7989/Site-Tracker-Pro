// SiteTrack Pro — Platform Support Tickets admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { AccessDenied, Button, Icon, StatCard } from "@/components/ui/atoms";
import { Textarea } from "@/components/ui/forms";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildCsv, downloadCsv, csvDateStamp, type CsvColumn } from "@/lib/utils/genericCsv";
import { listSupportTickets, listOrgsBrief, updateSupportTicket, type Ticket } from "@/app/queries/platformSupportQueries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";


import { getClient } from "@/lib/supabase/supabase";
export function fmtTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Pure helpers (exported for the phase unit tests) ──────────────────────────

/** Inbox roll-up (open / replied / closed + total). */
export function ticketSummary(tickets: Ticket[]): { open: number; replied: number; closed: number; total: number } {
  let open = 0, replied = 0, closed = 0;
  for (const t of tickets) {
    if (t.status === "open") open++;
    else if (t.status === "replied") replied++;
    else if (t.status === "closed") closed++;
  }
  return { open, replied, closed, total: tickets.length };
}

/** CSV column spec for the support export (raw values). */
export const TICKET_CSV_COLUMNS: ReadonlyArray<CsvColumn<keyof Ticket>> = [
  { key: "subject", label: "Subject" },
  { key: "from", label: "From" },
  { key: "email", label: "Email" },
  { key: "org_id", label: "Org id" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
  { key: "replied_at", label: "Replied at" },
  { key: "closed_at", label: "Closed at" },
];

export function PlatformSupportView(): JSX.Element {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const [tRes, oRes] = await Promise.all([
      listSupportTickets(client),
      listOrgsBrief(client),
    ]);
    if (tRes.ok) { setTickets(tRes.data); if (tRes.data.length) setActive(a => a ?? tRes.data[0].id); }
    else setError(tRes.error);
    if (oRes.ok) setOrgs(Object.fromEntries(oRes.data.map(o => [o.id, o.name])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onExport = useCallback(() => {
    const content = buildCsv(tickets as unknown as Array<Record<string, unknown>>, TICKET_CSV_COLUMNS);
    if (!content) return;
    downloadCsv(`support-tickets-${csvDateStamp()}.csv`, content);
  }, [tickets]);

  const can = useCan("platform:support:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4" role="status" aria-label="Loading support tickets">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-2">
            <Skeleton decorative height={28} width="w-48" />
            <Skeleton decorative height={12} width="w-32" />
          </div>
          <Skeleton decorative height={32} width="w-28" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-panel rounded-xl border border-default p-4 space-y-3">
              <Skeleton decorative height={10} width="w-16" />
              <Skeleton decorative height={24} width="w-12" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-2">
            <Skeleton decorative height={12} width="w-24" />
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} decorative height={56} width="w-full" />)}
          </div>
          <div className="lg:col-span-8 space-y-2">
            <Skeleton decorative height={12} width="w-24" />
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} decorative height={56} width="w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  const ticket = tickets.find(t => t.id === active);
  const summary = ticketSummary(tickets);

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    const client = await getClient();
    const msg = { id: `msg_${Date.now()}`, by: "admin", text: reply.trim(), time: new Date().toISOString() };
    const ticket = tickets.find(t => t.id === active);
    const msgs = [...(ticket?.messages ?? []), msg];
    const res = await updateSupportTicket(client as unknown as TypedSupabaseClient, active, { messages: msgs, status: "replied", replied_at: new Date().toISOString() });
    if (res.ok) {
      setTickets(p => p.map(t => t.id === active ? { ...t, messages: msgs, status: "replied" } : t));
      setReply("");
    } else setError(res.error);
  };

  const close = async () => {
    if (!active) return;
    const client = await getClient();
    const res = await updateSupportTicket(client as unknown as TypedSupabaseClient, active, { status: "closed", closed_at: new Date().toISOString() });
    if (res.ok) setTickets(p => p.map(t => t.id === active ? { ...t, status: "closed" } : t));
    else setError(res.error);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-fg-primary">Support Inbox</h1>
          <p className="text-fg-tertiary text-sm mt-1">{summary.open} open · {summary.total} total</p>
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Icon name="download" size={14} />} onClick={onExport} disabled={tickets.length === 0}>
          Export CSV
        </Button>
      </div>
      {error && <div className="mb-4 rounded-lg bg-error-tint border border-error p-3 text-[13px] text-error flex items-start gap-2"><Icon name="alert" size={15} className="text-error mt-0.5" /> {error}</div>}

      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Open" value={summary.open} sub="needs reply" />
        <StatCard label="Replied" value={summary.replied} sub="awaiting customer" />
        <StatCard label="Closed" value={summary.closed} sub="resolved" />
        <StatCard label="Total" value={summary.total} sub="all tickets" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-320px)]">
        <div className="lg:col-span-4 bg-bg-primary rounded-2xl overflow-hidden border border-default flex flex-col max-h-[40vh] lg:max-h-none">
          <div className="px-4 py-3 bg-bg-secondary text-xs font-bold uppercase tracking-wider text-fg-secondary border-b border-default">{tickets.length} tickets</div>
          <div className="flex-1 overflow-y-auto divide-y divide-default">
            {tickets.map(t => (
              <button key={t.id} onClick={() => setActive(t.id)} className={`w-full text-left p-4 hover:bg-bg-secondary ${active === t.id ? "bg-warning-tint" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm truncate flex-1">{t.subject}</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ml-2 ${t.status === "open" ? "bg-error-tint text-error" : t.status === "replied" ? "bg-warning-tint text-warning" : "bg-success-tint text-success"}`}>{t.status}</span>
                </div>
                <div className="text-xs text-fg-tertiary">{orgs[t.org_id] || "—"} · {t.from}</div>
                <div className="text-xs text-fg-tertiary mt-0.5">{fmtTime(t.created)}</div>
              </button>
            ))}
            {tickets.length === 0 && <div className="p-6 text-center text-fg-tertiary italic text-sm">No tickets.</div>}
          </div>
        </div>
        <div className="lg:col-span-8 bg-bg-primary rounded-2xl overflow-hidden border border-default flex flex-col">
          {ticket ? (
            <>
              <div className="px-5 py-4 border-b border-default flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg">{ticket.subject}</div>
                  <div className="text-xs text-fg-tertiary">{orgs[ticket.org_id] || "—"} · {ticket.from} · {fmtTime(ticket.created)}</div>
                </div>
                {ticket.status !== "closed" && <Button variant="secondary" size="sm" onClick={close}>Close</Button>}
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="bg-bg-secondary rounded-xl p-4">
                  <div className="text-xs font-bold tracking-wider text-fg-tertiary uppercase mb-2">Initial message</div>
                  <p className="text-sm whitespace-pre-line">{ticket.body}</p>
                </div>
                {(ticket.messages ?? []).map(m => (
                  <div key={m.id} className="bg-warning-tint rounded-xl p-4">
                    <div className="text-xs font-bold tracking-wider text-warning uppercase mb-2">{m.by} · {fmtTime(m.time)}</div>
                    <p className="text-sm whitespace-pre-line">{m.text}</p>
                  </div>
                ))}
              </div>
              {ticket.status !== "closed" && (
                <div className="p-4 border-t border-default">
                  <Textarea rows={4} value={reply} onChange={e => setReply(e.target.value)} placeholder="Type reply..." className="mb-3" />
                  <Button onClick={sendReply}>Send reply</Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-fg-tertiary italic">Select a ticket</div>
          )}
        </div>
      </div>
    </div>
  );
}