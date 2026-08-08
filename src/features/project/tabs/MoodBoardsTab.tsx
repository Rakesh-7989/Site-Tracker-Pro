// SiteTrack Pro — Interior mood board tab (v4 Phase B).
// Client-facing inspiration boards (title + optional theme/media/notes) the
// design team curates per interior/design project. create/edit/delete →
// ffe:manage (reused gate); plan gated by PlanFeature "ffe" at the tab level.
// DB: mood_boards (migration 162).

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Spinner, Alert, Badge, AccessDenied } from "@/components/ui/atoms";
import { Input, Textarea } from "@/components/ui/forms";
import { listMoodBoards, upsertMoodBoard, deleteMoodBoard, type MoodBoard } from "@/app/interiorQueries";

const EMPTY = { title: "", theme: "", mediaUrl: "", notes: "" };

export function MoodBoardsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("ffe:manage", { orgId: activeOrg?.orgId, projectId });

  if (!canManage) return <AccessDenied />;

  const [rows, setRows] = useState<MoodBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMoodBoards(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const save = async () => {
    if (!form.title.trim()) return;
    const isEdit = !!editingId;
    const prev = rows;
    const optimistic: MoodBoard = {
      id: editingId ?? "tmp-" + Date.now(),
      projectId,
      title: form.title.trim(),
      theme: form.theme.trim() || null,
      mediaUrl: form.mediaUrl.trim() || null,
      notes: form.notes.trim() || null,
      createdAt: "",
    };
    await run(isEdit ? "edit" : "add", c => upsertMoodBoard(c, {
      id: editingId, projectId,
      title: form.title.trim(), theme: form.theme.trim() || null,
      mediaUrl: form.mediaUrl.trim() || null, notes: form.notes.trim() || null,
    }), {
      apply: () => setRows(prevRows =>
        isEdit ? prevRows.map(x => x.id === editingId ? optimistic : x) : [optimistic, ...prevRows]),
      rollback: () => setRows(prev),
    });
    setForm(EMPTY); setEditingId(null);
  };

  const remove = async (b: MoodBoard) => {
    const prev = rows;
    await run(`d-${b.id}`, c => deleteMoodBoard(c, b.id), {
      apply: () => setRows(prevRows => prevRows.filter(x => x.id !== b.id)),
      rollback: () => setRows(prev),
    });
  };

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Mood Boards</h2>
        <span className="text-sm text-fg-secondary">{rows.length} board{rows.length === 1 ? "" : "s"}</span>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canManage && (
        <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span>
            <Input className="mt-1" placeholder="e.g. Modern earthy kitchen" value={form.title} onChange={e => set("title")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Theme</span>
            <Input className="mt-1" placeholder="e.g. Warm minimal" value={form.theme} onChange={e => set("theme")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Image / media URL</span>
            <Input className="mt-1" placeholder="https://…" value={form.mediaUrl} onChange={e => set("mediaUrl")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span>
            <Textarea rows={1} className="mt-1" value={form.notes} onChange={e => set("notes")(e.target.value)} />
          </div>
          <div className="flex gap-2 items-end">
            <Button className="flex-1" onClick={() => void save()} disabled={busy === "add" || busy === "edit" || !form.title.trim()}>
              {busy === "add" || busy === "edit" ? <Spinner size={14} /> : editingId ? "Save" : "Add"}
            </Button>
            {editingId && <Button variant="ghost" onClick={() => { setForm(EMPTY); setEditingId(null); }}>Cancel</Button>}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-fg-secondary">No mood boards yet.{canManage ? " Add the first one above." : ""}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(b => (
            <Card key={b.id} className="p-3">
              {b.mediaUrl && (
                <div className="mb-2 rounded-lg overflow-hidden bg-elevated">
                  <img src={b.mediaUrl} alt={b.title} className="w-full h-28 object-cover" loading="lazy" />
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg-primary truncate">{b.title}</h3>
                {b.theme && <Badge tone="info">{b.theme}</Badge>}
              </div>
              {b.notes && <p className="text-[12px] text-fg-secondary mt-1">{b.notes}</p>}
              {canManage && (
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="secondary" onClick={() => {
                    setEditingId(b.id);
                    setForm({ title: b.title, theme: b.theme ?? "", mediaUrl: b.mediaUrl ?? "", notes: b.notes ?? "" });
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(b)}>Delete</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
