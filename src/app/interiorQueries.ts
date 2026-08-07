// SiteTrack Pro — Interior module surface (v4 Phase B).
// DB: mood_boards / interior_rooms / room_installations (migration 162).
// RLS: read = project member; insert/update = members minus external; delete =
// managers + org admin (mirrors 151_ffe_schedules). UI gating reuses the
// ffe:manage capability + PlanFeature "ffe" at the tab level.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

// ── Mood boards ──────────────────────────────────────────────────────────────
export interface MoodBoard {
  id: string;
  projectId: string;
  title: string;
  theme: string | null;
  mediaUrl: string | null;
  notes: string | null;
  createdAt: string;
}

const MOOD_BOARD_SELECT = "id, project_id, title, theme, media_url, notes, created_at";

function mapMoodBoard(r: Record<string, unknown>): MoodBoard {
  return {
    id: String(r.id),
    projectId: String(r.project_id ?? ""),
    title: String(r.title ?? ""),
    theme: r.theme == null ? null : String(r.theme),
    mediaUrl: r.media_url == null ? null : String(r.media_url),
    notes: r.notes == null ? null : String(r.notes),
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMoodBoards(client: any, projectId: string): Promise<Result<MoodBoard[]>> {
  try {
    const { data, error } = await client
      .from("mood_boards")
      .select(MOOD_BOARD_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapMoodBoard));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertMoodBoard(client: any, input: {
  id?: string | null;
  projectId: string;
  title: string;
  theme?: string | null;
  mediaUrl?: string | null;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      project_id: input.projectId,
      title: input.title,
      theme: input.theme ?? null,
      media_url: input.mediaUrl ?? null,
      notes: input.notes ?? null,
    };
    if (input.id) {
      const { error } = await client.from("mood_boards").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("mood_boards").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteMoodBoard(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("mood_boards").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Rooms ────────────────────────────────────────────────────────────────────
export type RoomFinishStatus = "planned" | "in_progress" | "installed" | "cancelled";
export const ROOM_FINISH_STATUSES: readonly RoomFinishStatus[] = ["planned", "in_progress", "installed", "cancelled"];
const asFinish = oneOf<RoomFinishStatus>(ROOM_FINISH_STATUSES, "planned");

export interface InteriorRoom {
  id: string;
  projectId: string;
  name: string;
  area: number | null;
  finishStatus: RoomFinishStatus;
  notes: string | null;
  createdAt: string;
}

const ROOM_SELECT = "id, project_id, name, area, finish_status, notes, created_at";

function mapRoom(r: Record<string, unknown>): InteriorRoom {
  return {
    id: String(r.id),
    projectId: String(r.project_id ?? ""),
    name: String(r.name ?? ""),
    area: r.area == null ? null : Number(r.area),
    finishStatus: asFinish(r.finish_status),
    notes: r.notes == null ? null : String(r.notes),
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listInteriorRooms(client: any, projectId: string): Promise<Result<InteriorRoom[]>> {
  try {
    const { data, error } = await client
      .from("interior_rooms")
      .select(ROOM_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapRoom));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertRoom(client: any, input: {
  id?: string | null;
  projectId: string;
  name: string;
  area?: number | null;
  finishStatus?: RoomFinishStatus;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      project_id: input.projectId,
      name: input.name,
      area: input.area ?? null,
      finish_status: input.finishStatus ?? "planned",
      notes: input.notes ?? null,
    };
    if (input.id) {
      const { error } = await client.from("interior_rooms").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("interior_rooms").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setRoomFinishStatus(client: any, id: string, status: RoomFinishStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("interior_rooms").update({ finish_status: status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteRoom(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("interior_rooms").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Installations ────────────────────────────────────────────────────────────
export type InstallStatus = "planned" | "ordered" | "installed" | "cancelled";
export const INSTALL_STATUSES: readonly InstallStatus[] = ["planned", "ordered", "installed", "cancelled"];
const asInstall = oneOf<InstallStatus>(INSTALL_STATUSES, "planned");

export interface RoomInstallation {
  id: string;
  roomId: string;
  item: string;
  status: InstallStatus;
  plannedDate: string | null;
  doneDate: string | null;
  notes: string | null;
  createdAt: string;
}

const INSTALL_SELECT = "id, room_id, item, status, planned_date, done_date, notes, created_at";

function mapInstallation(r: Record<string, unknown>): RoomInstallation {
  return {
    id: String(r.id),
    roomId: String(r.room_id ?? ""),
    item: String(r.item ?? ""),
    status: asInstall(r.status),
    plannedDate: r.planned_date == null ? null : String(r.planned_date),
    doneDate: r.done_date == null ? null : String(r.done_date),
    notes: r.notes == null ? null : String(r.notes),
    createdAt: String(r.created_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listInstallations(client: any, roomId: string): Promise<Result<RoomInstallation[]>> {
  try {
    const { data, error } = await client
      .from("room_installations")
      .select(INSTALL_SELECT)
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapInstallation));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addInstallation(client: any, input: {
  roomId: string;
  item: string;
  status?: InstallStatus;
  plannedDate?: string | null;
  doneDate?: string | null;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("room_installations")
      .insert({
        room_id: input.roomId,
        item: input.item,
        status: input.status ?? "planned",
        planned_date: input.plannedDate ?? null,
        done_date: input.doneDate ?? null,
        notes: input.notes ?? null,
      })
      .select("id")
      .single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setInstallStatus(client: any, id: string, status: InstallStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("room_installations").update({ status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteInstallation(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("room_installations").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export interface RoomProgress {
  total: number;
  installed: number;
  inProgress: number;
  cancelled: number;
  pct: number;
}

/** Room-level completion rollup (pct clamps 0–100; cancelled excluded from the denominator). */
export function roomProgress(rooms: Pick<InteriorRoom, "finishStatus">[]): RoomProgress {
  let installed = 0;
  let inProgress = 0;
  let cancelled = 0;
  for (const r of rooms) {
    if (r.finishStatus === "installed") installed += 1;
    else if (r.finishStatus === "in_progress") inProgress += 1;
    else if (r.finishStatus === "cancelled") cancelled += 1;
  }
  const active = rooms.length - cancelled;
  const pct = active === 0 ? 0 : Math.round((installed / active) * 100);
  return { total: rooms.length, installed, inProgress, cancelled, pct };
}

/** Natural next status for an installation (terminal states stay put). */
export const INSTALL_NEXT: Record<InstallStatus, InstallStatus> = {
  planned: "ordered", ordered: "installed", installed: "installed", cancelled: "planned",
};

/** Natural next status for a room's finish (terminal states stay put). */
export const ROOM_FINISH_NEXT: Record<RoomFinishStatus, RoomFinishStatus> = {
  planned: "in_progress", in_progress: "installed", installed: "installed", cancelled: "planned",
};

export const ROOM_FINISH_LABEL: Record<RoomFinishStatus, string> = {
  planned: "Planned", in_progress: "In progress", installed: "Installed", cancelled: "Cancelled",
};
export const INSTALL_LABEL: Record<InstallStatus, string> = {
  planned: "Planned", ordered: "Ordered", installed: "Installed", cancelled: "Cancelled",
};
