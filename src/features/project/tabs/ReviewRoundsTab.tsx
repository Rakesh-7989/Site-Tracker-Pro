// SiteTrack Pro — design review rounds tab (v4 C1).
// The back-and-forth on a deliverable: pick a deliverable, see its review
// rounds, comment (review:comment — open to contributors + client), open a
// new round, and close a round (review:manage). Round numbers auto-increment.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Select, Textarea } from "@/components/ui/forms";
import {
  listDeliverables, listReviewRounds, createReviewRound, closeReviewRound, nextRoundNo,
  type Deliverable, type ReviewRound,
} from "@/app/deliverableQueries";

export function ReviewRoundsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const profileId = session?.user.id ?? "";
  const canComment = useCan("review:comment", { orgId: activeOrg?.orgId, projectId });
  const canManage = useCan("review:manage", { orgId: activeOrg?.orgId, projectId });

  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rounds, setRounds] = useState<ReviewRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listDeliverables(client, projectId);
    if (res.ok) setDeliverables(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const loadRounds = useCallback(async (deliverableId: string) => {
    if (!deliverableId) { setRounds([]); return; }
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listReviewRounds(client, deliverableId);
    if (res.ok) setRounds(res.data); else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) void loadRounds(selectedId);
  }, [selectedId, loadRounds]);

  const reloadRounds = useCallback(() => {
    return selectedId ? loadRounds(selectedId) : Promise.resolve();
  }, [selectedId, loadRounds]);

  const { busy, run } = useAction(reloadRounds, setError);

  const submitRound = async () => {
    if (!selectedId || !comment.trim()) return;
    const tmpId = "tmp-" + Date.now();
    const roundNo = nextRoundNo(rounds);
    await run("add", c => createReviewRound(c, { deliverableId: selectedId, roundNo, requestedBy: profileId || null, comments: comment.trim() }), {
      apply: () => setRounds(prev => [...prev, { id: tmpId, roundNo, status: "open", requestedBy: profileId || null, requestedByName: null, comments: comment.trim(), closedBy: null, closedByName: null, closedAt: null, createdAt: "" }]),
      rollback: () => setRounds(prev => prev.filter(x => x.id !== tmpId)),
    });
    setComment("");
  };

  const pickDeliverable = (id: string) => {
    setSelectedId(id);
    setRounds([]);
    setError(null);
    if (id) void loadRounds(id);
  };

  const selected = deliverables.find(d => d.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Review Rounds</h2>
        {selected && (
          <span className="text-sm text-fg-secondary">{rounds.filter(r => r.status === "closed").length}/{rounds.length} closed</span>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="p-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Deliverable</span>
        <Select
          className="mt-1"
          options={[{ value: "", label: "— select a deliverable —" }, ...deliverables.map(d => ({ value: d.id, label: d.title }))]}
          value={selectedId}
          onChange={e => pickDeliverable(e.target.value)}
        />
      </Card>

      {selectedId && (
        <Card padding="sm" title={<div className="text-sm font-semibold text-fg-primary">{selected?.title}</div>} action={selected && <Badge tone={selected.status === "issued" ? "success" : "info"}>{selected.status}</Badge>}>
          {selected?.dueDate && <div className="text-[11px] text-fg-tertiary">Due {selected.dueDate}</div>}
        </Card>
      )}

      {selectedId && canComment && (
        <Card className="p-3 space-y-2">
          <Textarea rows={3} placeholder="Feedback / comments for this round…" value={comment} onChange={e => setComment(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void submitRound()} disabled={busy === "add" || !comment.trim()}>
              {busy === "add" ? <Spinner size={14} /> : `Submit round ${nextRoundNo(rounds)}`}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : !selectedId ? (
        <div className="text-sm text-fg-secondary">Select a deliverable to see its review rounds.</div>
      ) : rounds.length === 0 ? (
        <div className="text-sm text-fg-secondary">No review rounds yet.{canComment ? " Submit the first one above." : ""}</div>
      ) : (
        <div className="space-y-2">
          {rounds.map(r => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-fg-primary">Round {r.roundNo}</span>
                  <Badge tone={r.status === "closed" ? "success" : "info"}>{r.status}</Badge>
                </div>
                {canManage && r.status === "open" && (
                  <Button size="sm" variant="ghost" disabled={busy === `c-${r.id}`} onClick={() => void run(`c-${r.id}`, c => closeReviewRound(c, r.id, profileId), { apply: () => setRounds(prev => prev.map(x => x.id === r.id ? { ...x, status: "closed", closedAt: new Date().toISOString() } : x)), rollback: () => setRounds(prev => prev.map(x => x.id === r.id ? { ...x, status: "open", closedAt: null } : x)) })}>
                    Close
                  </Button>
                )}
              </div>
              {r.comments && <div className="mt-1 text-sm text-fg-primary whitespace-pre-wrap">{r.comments}</div>}
              <div className="mt-1 text-[11px] text-fg-tertiary">
                {r.requestedByName ?? "You"} · {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                {r.closedAt && ` · Closed ${r.closedByName ?? ""}`}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
