// SiteTrack Pro — project Updates / daily diary tab (v3 port, Batch 1,
// DB-wired to `site_updates`).

import { useCallback, useEffect, useState } from "react";

import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Textarea } from "@/components/ui/forms";
import { listUpdates, createUpdate, deleteUpdate, type SiteUpdate } from "@/app/updateQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  const mod = await import("../../../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

export function UpdatesTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("update:add", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<SiteUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState("");
  const [workers, setWorkers] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listUpdates(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (key: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client);
    if (!res.ok) setError(res.error ?? "Action failed.");
    await reload(); setBusy(null);
  }, [reload]);

  const add = async () => {
    if (!notes.trim() || !session) return;
    const wc = workers.trim() ? Number(workers) : null;
    await run("add", c => createUpdate(c, { projectId, authorId: session.user.id, notes: notes.trim(), weather: weather.trim() || undefined, workersCount: Number.isFinite(wc) ? wc : null }));
    setNotes(""); setWeather(""); setWorkers("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Site Updates</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      {canEdit && (
        <Card className="p-3 space-y-2">
          <Textarea placeholder="Today's site notes…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          <div className="flex gap-2 flex-wrap items-center">
            <Input className="w-32" placeholder="Weather" value={weather} onChange={e => setWeather(e.target.value)} />
            <Input className="w-28" type="number" placeholder="Workers" value={workers} onChange={e => setWorkers(e.target.value)} />
            <Button className="ml-auto" onClick={() => void add()} disabled={busy === "add" || !notes.trim()}>{busy === "add" ? <Spinner size={14} /> : "Post update"}</Button>
          </div>
        </Card>
      )}

      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No updates yet.</div>
        : <div className="space-y-2">
            {rows.map(u => (
              <Card key={u.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-ink-800 whitespace-pre-wrap">{u.notes}</div>
                    <div className="text-[11px] text-ink-400 mt-1">
                      {u.updateDate}{u.authorName ? ` · ${u.authorName}` : ""}
                      {u.weather ? ` · ${u.weather}` : ""}{u.workersCount != null ? ` · ${u.workersCount} workers` : ""}
                    </div>
                  </div>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${u.id}`, c => deleteUpdate(c, u.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
                </div>
              </Card>
            ))}
          </div>}
    </div>
  );
}
