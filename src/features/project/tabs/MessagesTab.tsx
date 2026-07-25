// SiteTrack Pro — project Messages tab (v3 port). Append-only project chat.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { listMessages, postMessage, type Message } from "@/app/messageQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const fmtTs = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };

export function MessagesTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canSend = useCan("message:send", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMessages(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [rows.length]);

  const send = async () => {
    const body = text.trim(); if (!body || !session) return;
    setBusy(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const res = await postMessage(client, { projectId, body, senderId: session.user.id, senderName: session.user.name });
    if (!res.ok) setError(res.error); else setText("");
    await reload(); setBusy(false);
  };

  const myId = session?.user.id;

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: 360 }}>
      <h2 className="font-display text-lg font-bold text-ink-900 mb-3">Discussion</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {loading ? <div className="grid place-items-center h-full"><Spinner size={22} /></div>
          : rows.length === 0 ? <div className="grid place-items-center h-full text-sm text-ink-400"><div className="text-center"><Icon name="msgcircle" size={24} className="mx-auto text-ink-300 mb-2" />No messages yet. Start the conversation.</div></div>
          : rows.map(m => {
              const mine = m.senderId && m.senderId === myId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? "bg-safety-500 text-white" : "bg-cream-100 text-ink-800"}`}>
                    {!mine && <div className="text-[11px] font-semibold text-ink-500 mb-0.5">{m.senderName}</div>}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`text-[10px] mt-0.5 ${mine ? "text-white/70" : "text-ink-400"}`}>{fmtTs(m.createdAt)}</div>
                  </div>
                </div>
              );
            })}
        <div ref={endRef} />
      </div>
      {canSend && <div className="flex gap-2 pt-3 border-t border-cream-200 mt-2">
        <Input className="flex-1" placeholder="Write a message..." value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <Button onClick={() => void send()} disabled={busy || !text.trim()}>{busy ? <Spinner size={14} /> : <Icon name="send" size={16} />}</Button>
      </div>}
    </div>
  );
}
