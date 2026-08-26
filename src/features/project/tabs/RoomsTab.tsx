// SiteTrack Pro — Interior rooms + installation tracking tab (v4 Phase B).
// Rooms being fit-out per interior/design project, each carrying install line
// items with their own status + planned/done dates. create/edit/delete →
// ffe:manage (reused gate); plan gated by PlanFeature "ffe" at the tab level.
// DB: interior_rooms / room_installations (migration 162).

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import {
  listInteriorRooms, upsertRoom, setRoomFinishStatus, deleteRoom,
  listInstallations, addInstallation, setInstallStatus, deleteInstallation,
  roomProgress, ROOM_FINISH_NEXT, INSTALL_NEXT, ROOM_FINISH_LABEL, INSTALL_LABEL,
  type InteriorRoom, type RoomFinishStatus, type RoomInstallation, type InstallStatus,
} from "@/app/interiorQueries";

const FINISH_TONE: Record<RoomFinishStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  planned: "neutral", in_progress: "info", installed: "success", cancelled: "danger",
};
const INSTALL_TONE: Record<InstallStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  planned: "neutral", ordered: "warning", installed: "success", cancelled: "danger",
};

const EMPTY = { name: "", area: "", notes: "" };

function Installations({ roomId, canManage }: { roomId: string; canManage: boolean }): JSX.Element {
  const [rows, setRows] = useState<RoomInstallation[]>([]);
  const [item, setItem] = useState("");
  const [plannedStr, setPlannedStr] = useState("");

  const reload = useCallback(async () => {
    const client = await getClient(); if (!client) return;
    const res = await listInstallations(client, roomId);
    if (res.ok) setRows(res.data);
  }, [roomId]);

  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    if (!item.trim()) return;
    const client = await getClient(); if (!client) return;
    const r = await addInstallation(client, { roomId, item: item.trim(), plannedDate: plannedStr || null });
    if (r.ok) { setItem(""); setPlannedStr(""); void reload(); }
  };

  const toggle = async (i: RoomInstallation) => {
    const client = await getClient(); if (!client) return;
    await setInstallStatus(client, i.id, INSTALL_NEXT[i.status]); void reload();
  };
  const del = async (id: string) => {
    const client = await getClient(); if (!client) return;
    await deleteInstallation(client, id); void reload();
  };

  return (
    <div className="mt-2 space-y-1.5">
      {canManage && (
        <div className="flex flex-wrap gap-2 items-center">
          <Input fit className="w-48" placeholder="Item e.g. Wardrobe" value={item} onChange={e => setItem(e.target.value)} />
          <Input fit type="date" className="w-36" value={plannedStr} onChange={e => setPlannedStr(e.target.value)} />
          <Button size="sm" onClick={() => void add()} disabled={!item.trim()}>Add item</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="text-[12px] text-fg-tertiary">No installation items yet.</div>
      ) : (
        rows.map(i => (
          <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-2.5 py-1.5">
            <div className="text-sm text-fg-primary truncate">{i.item}</div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {canManage ? (
                <button type="button" onClick={() => void toggle(i)} title="Advance status">
                  <Badge tone={INSTALL_TONE[i.status]}>{INSTALL_LABEL[i.status]}</Badge>
                </button>
              ) : (
                <Badge tone={INSTALL_TONE[i.status]}>{INSTALL_LABEL[i.status]}</Badge>
              )}
              {canManage && <button onClick={() => void del(i.id)} className="text-[11px] text-error">✕</button>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function RoomsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("ffe:manage", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<InteriorRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listInteriorRooms(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);
  const progress = useMemo(() => roomProgress(rows), [rows]);

  if (!canManage) return <AccessDenied />;

  const save = async () => {
    if (!form.name.trim()) return;
    const isEdit = !!editingId;
    const prev = rows;
    const optimistic: InteriorRoom = {
      id: editingId ?? "tmp-" + Date.now(),
      projectId,
      name: form.name.trim(),
      area: form.area ? Number(form.area) : null,
      finishStatus: "planned",
      notes: form.notes.trim() || null,
      createdAt: "",
    };
    await run(isEdit ? "edit" : "add", c => upsertRoom(c, {
      id: editingId, projectId,
      name: form.name.trim(), area: form.area ? Number(form.area) : null,
      finishStatus: "planned", notes: form.notes.trim() || null,
    }), {
      apply: () => setRows(prevRows =>
        isEdit ? prevRows.map(x => x.id === editingId ? optimistic : x) : [optimistic, ...prevRows]),
      rollback: () => setRows(prev),
    });
    setForm(EMPTY); setEditingId(null);
  };

  const toggle = async (r: InteriorRoom) => {
    const next = ROOM_FINISH_NEXT[r.finishStatus];
    const prevRows = rows;
    await run(`s-${r.id}`, c => setRoomFinishStatus(c, r.id, next), {
      apply: () => setRows(prevRows => prevRows.map(x => x.id === r.id ? { ...x, finishStatus: next } : x)),
      rollback: () => setRows(prevRows),
    });
  };

  const remove = async (r: InteriorRoom) => {
    const prev = rows;
    await run(`d-${r.id}`, c => deleteRoom(c, r.id), {
      apply: () => setRows(prevRows => prevRows.filter(x => x.id !== r.id)),
      rollback: () => setRows(prev),
    });
  };

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Rooms & Installations</h2>
        <span className="text-sm text-fg-secondary">{progress.installed}/{progress.total} installed · {progress.pct}%</span>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canManage && (
        <Card className="p-3 grid gap-2 sm:grid-cols-4 items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Room</span>
            <Input className="mt-1" placeholder="e.g. Master bedroom" value={form.name} onChange={e => set("name")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Area (sq ft)</span>
            <Input className="mt-1" type="number" min={0} value={form.area} onChange={e => set("area")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span>
            <Input className="mt-1" value={form.notes} onChange={e => set("notes")(e.target.value)} />
          </div>
          <div className="flex gap-2 items-end">
            <Button className="flex-1" onClick={() => void save()} disabled={busy === "add" || busy === "edit" || !form.name.trim()}>
              {busy === "add" || busy === "edit" ? <Spinner size={14} /> : editingId ? "Save" : "Add"}
            </Button>
            {editingId && <Button variant="ghost" onClick={() => { setForm(EMPTY); setEditingId(null); }}>Cancel</Button>}
          </div>
        </Card>
      )}

      {/* Progress bar */}
      {rows.length > 0 && (
        <div className="h-2 rounded-full bg-elevated overflow-hidden">
          <div className="h-full bg-success transition-all" style={{ width: `${progress.pct}%` }} />
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-fg-secondary">
          <span className="text-4xl mb-3">🏗️</span>
          <p>No rooms yet.</p>
          <p className="text-[12px] text-fg-tertiary">Add the first one using the form above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-fg-primary truncate">{r.name}</span>
                    <Badge tone="neutral">{r.area ? `${r.area} sq ft` : "—"}</Badge>
                  </div>
                  {r.notes && <div className="text-[11px] text-fg-tertiary">{r.notes}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canManage ? (
                    <button type="button" disabled={busy === `s-${r.id}`} onClick={() => void toggle(r)} title="Advance status">
                      <Badge tone={FINISH_TONE[r.finishStatus]}>{ROOM_FINISH_LABEL[r.finishStatus]}</Badge>
                    </button>
                  ) : (
                    <Badge tone={FINISH_TONE[r.finishStatus]}>{ROOM_FINISH_LABEL[r.finishStatus]}</Badge>
                  )}
                  {canManage && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => {
                        setEditingId(r.id);
                        setForm({ name: r.name, area: r.area == null ? "" : String(r.area), notes: r.notes ?? "" });
                      }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(r)}>✕</Button>
                    </>
                  )}
                </div>
              </div>
              <Installations roomId={r.id} canManage={canManage} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}