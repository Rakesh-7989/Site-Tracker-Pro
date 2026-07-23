// SiteTrack Pro â€” cross-project Messages inbox (/messages).
// Lists messages per-project with a project selector (mirrors legacy MessagesView).

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { listMessages, postMessage, type Message } from "@/app/messageQueries";

import { getClient } from "@/lib/supabase";
interface ProjectBrief {
  id: string;
  name: string;
}


const fmtTs = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function MessagesView(): JSX.Element {
  const { session } = useAuth();
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [pid, setPid] = useState<string>("");
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const { data, error: e } = await client.from("projects").select("id, name").order("name");
      if (e) { setError(String(e.message ?? e)); } else {
        const list: ProjectBrief[] = (data ?? []).map((r: any) => ({ id: r.id, name: r.name }));
        setProjects(list);
        if (list.length > 0 && !pid) setPid(list[0].id);
      }
      setLoading(false);
    })();
  }, [pid]);

  const reload = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoadingMsgs(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoadingMsgs(false); return; }
    const res = await listMessages(client, projectId); if (res.ok) setMsgs(res.data); else setError(res.error);
    setLoadingMsgs(false);
  }, []);

  useEffect(() => { if (pid) void reload(pid); }, [pid, reload]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async () => {
    const body = text.trim(); if (!body || !session) return;
    setBusy(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const res = await postMessage(client, { projectId: pid, body, senderId: session.user.id, senderName: session.user.name });
    if (!res.ok) setError(res.error); else setText("");
    await reload(pid); setBusy(false);
  };

  const myId = session?.user.id;
  const curProject = projects.find(p => p.id === pid);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-ink-900 flex items-center gap-2">
            <Icon name="msgcircle" size={22} className="text-safety-500" />Messages
          </h1>
          <p className="text-ink-400 text-sm mt-1">Project chat</p>
        </div>
        <select
          value={pid}
          onChange={e => setPid(e.target.value)}
          className="p-3 bg-white border border-cream-200 rounded-xl text-sm outline-none focus:border-safety-400"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-cream-100">
          <div className="font-bold text-ink-900">{curProject?.name ?? "Select a project"}</div>
          <div className="text-xs text-ink-400">{msgs.length} messages</div>
        </div>

        <div className="p-4 space-y-3 min-h-[360px] max-h-[520px] overflow-y-auto bg-cream-50">
          {loadingMsgs ? <div className="grid place-items-center h-48"><Spinner size={20} /></div>
            : msgs.length === 0 ? <div className="text-center py-16 text-ink-400">No messages yet</div>
            : msgs.map(m => {
                const mine = m.senderId && m.senderId === myId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? "bg-safety-500 text-white" : "bg-white text-ink-700 border border-cream-200"}`}>
                      {!mine && <div className="text-xs font-bold text-ink-500 mb-1">{m.senderName}</div>}
                      <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                      <div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-ink-400"}`}>{fmtTs(m.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
          <div ref={endRef} />
        </div>

        <div className="p-4 border-t border-cream-100 space-y-3">
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="Type a message..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            />
            <Button onClick={() => void send()} disabled={busy || !text.trim()}>
              {busy ? <Spinner size={14} /> : <Icon name="send" size={16} />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
