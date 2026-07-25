// SiteTrack Pro — Platform Support Tickets admin view.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { Spinner, AccessDenied } from "@/components/ui/atoms";
import { listSupportTickets, listOrgsBrief, updateSupportTicket, type Ticket } from "@/app/platformSupportQueries";


import { getClient } from "@/lib/supabase";
function fmtTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function PlatformSupportView(): JSX.Element {
  const can = useCan("platform:orgs:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const [tRes, oRes] = await Promise.all([
      listSupportTickets(client),
      listOrgsBrief(client),
    ]);
    if (tRes.ok) { setTickets(tRes.data); if (tRes.data.length) setActive(tRes.data[0].id); }
    if (oRes.ok) setOrgs(Object.fromEntries(oRes.data.map(o => [o.id, o.name])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    const client = await getClient();
    const msg = { id: `msg_${Date.now()}`, by: "admin", text: reply.trim(), time: new Date().toISOString() };
    const ticket = tickets.find(t => t.id === active);
    const msgs = [...(ticket?.messages ?? []), msg];
    await updateSupportTicket(client, active, { messages: msgs, status: "replied", replied_at: new Date().toISOString() });
    setTickets(p => p.map(t => t.id === active ? { ...t, messages: msgs, status: "replied" } : t));
    setReply("");
  };

  const close = async () => {
    if (!active) return;
    const client = await getClient();
    await updateSupportTicket(client, active, { status: "closed", closed_at: new Date().toISOString() });
    setTickets(p => p.map(t => t.id === active ? { ...t, status: "closed" } : t));
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  const ticket = tickets.find(t => t.id === active);
  const openCount = tickets.filter(t => t.status === "open").length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto h-[calc(100vh-100px)]">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ink-900">Support Inbox</h1>
        <p className="text-ink-400 text-sm mt-1">{openCount} open · {tickets.length} total</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
        <div className="lg:col-span-4 bg-white rounded-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[40vh] lg:max-h-none">
          <div className="px-4 py-3 bg-stone-50 text-xs font-bold uppercase tracking-wider text-ink-500 border-b border-stone-200">{tickets.length} tickets</div>
          <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
            {tickets.map(t => (
              <button key={t.id} onClick={() => setActive(t.id)} className={`w-full text-left p-4 hover:bg-stone-50 ${active === t.id ? "bg-amber-50" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm truncate flex-1">{t.subject}</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ml-2 ${t.status === "open" ? "bg-red-100 text-red-700" : t.status === "replied" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{t.status}</span>
                </div>
                <div className="text-xs text-ink-400">{orgs[t.org_id] || "—"} · {t.from}</div>
                <div className="text-xs text-ink-400 mt-0.5">{fmtTime(t.created)}</div>
              </button>
            ))}
            {tickets.length === 0 && <div className="p-6 text-center text-ink-400 italic text-sm">No tickets.</div>}
          </div>
        </div>
        <div className="lg:col-span-8 bg-white rounded-2xl overflow-hidden border border-stone-200 flex flex-col">
          {ticket ? (
            <>
              <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg">{ticket.subject}</div>
                  <div className="text-xs text-ink-400">{orgs[ticket.org_id] || "—"} · {ticket.from} · {fmtTime(ticket.created)}</div>
                </div>
                {ticket.status !== "closed" && <button onClick={close} className="px-3 py-1.5 bg-stone-100 text-xs font-bold rounded-lg hover:bg-stone-200">Close</button>}
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="bg-stone-50 rounded-xl p-4">
                  <div className="text-xs font-bold tracking-wider text-ink-400 uppercase mb-2">Initial message</div>
                  <p className="text-sm whitespace-pre-line">{ticket.body}</p>
                </div>
                {(ticket.messages ?? []).map(m => (
                  <div key={m.id} className="bg-amber-50 rounded-xl p-4">
                    <div className="text-xs font-bold tracking-wider text-amber-700 uppercase mb-2">{m.by} · {fmtTime(m.time)}</div>
                    <p className="text-sm whitespace-pre-line">{m.text}</p>
                  </div>
                ))}
              </div>
              {ticket.status !== "closed" && (
                <div className="p-4 border-t border-stone-200">
                  <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Type reply..." className="w-full p-3 border border-stone-200 rounded-xl text-sm resize-none h-24 mb-3" />
                  <button onClick={sendReply} className="px-5 py-2 bg-amber-600 text-white font-bold rounded-xl text-sm">Send reply</button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-ink-400 italic">Select a ticket</div>
          )}
        </div>
      </div>
    </div>
  );
}
