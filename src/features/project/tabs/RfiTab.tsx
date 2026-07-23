// SiteTrack Pro â€” project RFIs tab (v3 port, Batch 4, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Textarea } from "@/components/ui/forms";
import { listRfis, createRfi, respondRfi, deleteRfi, type Rfi, type RfiStatus } from "@/app/designQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const tone = (s: RfiStatus): "info" | "success" | "neutral" | "danger" => (s === "open" ? "info" : s === "answered" ? "success" : s === "overdue" ? "danger" : "neutral");

export function RfiTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canAsk = useCan("rfi:create", ctx);
  const canRespond = useCan("rfi:respond", ctx);
  const [rows, setRows] = useState<Rfi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [subject, setSubject] = useState(""); const [question, setQuestion] = useState("");
  const [replyFor, setReplyFor] = useState<string | null>(null); const [reply, setReply] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listRfis(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { if (!subject.trim() || !question.trim() || !session) return; const no = `RFI-${String(rows.length + 1).padStart(3, "0")}`; await run("add", c => createRfi(c, { projectId, no, subject: subject.trim(), question: question.trim(), askedBy: session.user.id })); setSubject(""); setQuestion(""); };
  const sendReply = async (id: string) => { if (!reply.trim()) return; await run(`r-${id}`, c => respondRfi(c, id, reply.trim())); setReplyFor(null); setReply(""); };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">RFIs</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canAsk && (
        <Card className="p-3 space-y-2">
          <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          <div className="flex gap-2 items-end">
            <Textarea className="flex-1" placeholder="Your questionâ€¦" rows={2} value={question} onChange={e => setQuestion(e.target.value)} />
            <Button onClick={() => void add()} disabled={busy === "add" || !subject.trim() || !question.trim()}>{busy === "add" ? <Spinner size={14} /> : "Raise"}</Button>
          </div>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No RFIs.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 flex items-center gap-2"><Badge tone={tone(r.status)}>{r.status}</Badge>{r.no} Â· {r.subject}</div>
                  <div className="text-[12px] text-ink-500 mt-0.5">{r.question}</div>
                  {r.response && <div className="text-[12px] text-emerald-700 mt-1 pl-2 border-l-2 border-emerald-300">â†³ {r.response}</div>}</div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canRespond && r.status !== "answered" && r.status !== "closed" && <Button size="sm" variant="secondary" onClick={() => { setReplyFor(replyFor === r.id ? null : r.id); setReply(""); }}>Reply</Button>}
                  {canAsk && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteRfi(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
                </div>
              </div>
              {replyFor === r.id && (
                <div className="flex gap-2 mt-2 items-end">
                  <Textarea className="flex-1" rows={2} placeholder="Responseâ€¦" value={reply} onChange={e => setReply(e.target.value)} />
                  <Button size="sm" onClick={() => void sendReply(r.id)} disabled={busy === `r-${r.id}` || !reply.trim()}>Send</Button>
                </div>
              )}
            </Card>))}</div>}
    </div>
  );
}
