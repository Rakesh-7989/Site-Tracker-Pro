// SiteTrack Pro — Client Portal queries.
//
// v5 Phase B2 — Client Portal depth: payments, upcoming milestones, approved
// drawings + comment surface, and an activity feed, all scoped to the logged-in
// client's projects. RLS (02_rls.sql user_project_ids) already admits a client
// whose email matches projects.client_email, so these are plain member reads;
// the drawing/comment surface rides the B1 released-current rule.

import { netReceivable, outstanding, paymentStatusFrom } from "./crossInvoiceQueries";
import type { ApprovalStatus } from "./approvalQueries";

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ProjectBrief { id: string; name: string; location: string | null; status: string; progress: number; client_email: string | null; type: string; }
export interface NotificationBrief { id: string; title: string; body: string; read: boolean; }

export async function listClientProjects(client: any, email: string): Promise<PResult<ProjectBrief[]>> {
  try {
    const { data, error } = await client.from("projects")
      .select("id, name, location, status, progress, client_email, type")
      .eq("client_email", email)
      .order("name");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, name: r.name, location: r.location, status: r.status, progress: r.progress ?? 0, client_email: r.client_email, type: r.type ?? "construction" })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listClientNotifications(client: any): Promise<PResult<NotificationBrief[]>> {
  try {
    const { data, error } = await client.from("notifications")
      .select("id, title, body, read_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", body: r.body ?? "", read: r.read_at != null })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ── B2 types ─────────────────────────────────────────────────────────────────

export interface ClientProjectHeader {
  id: string;
  name: string;
  type: string;
  status: string;
  location: string | null;
  progress: number;
  clientName: string | null;
  description: string | null;
  expectedEndDate: string | null;
}

export interface ClientPayment {
  id: string;
  amount: number;
  method: string;
  receivedOn: string | null;
  reference: string | null;
}

export interface ClientInvoice {
  id: string;
  no: string;
  amount: number;
  gst: number;
  tds: number;
  status: "sent" | "paid" | "overdue" | "cancelled";
  issuedDate: string | null;
  netReceivable: number;
  received: number;
  outstanding: number;
  paymentStatus: "paid" | "partial" | "pending" | "overdue";
  payments: ClientPayment[];
}

export interface ClientMilestone {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  dueDate: string | null;
  completedDate: string | null;
}

export interface ClientDrawing {
  id: string;
  title: string;
  type: string;
  revision: string;
  notes: string | null;
  releaseDate: string | null;
  approvalStatus: ApprovalStatus;
  previewUrl: string | null;
}

export interface ClientUpdate {
  id: string;
  updateDate: string | null;
  notes: string;
  weather: string | null;
  workersCount: number | null;
  authorName: string | null;
  createdAt: string;
}

export interface ClientActivityRow {
  id: string;
  kind: "update" | "log";
  date: string;
  title: string;
  body: string;
  byName: string | null;
}

// ── B2 pure helpers ──────────────────────────────────────────────────────────

export interface ClientPaymentRollup {
  count: number;
  net: number;
  received: number;
  outstanding: number;
  byPaymentStatus: Record<"paid" | "partial" | "pending" | "overdue", number>;
}

export function clientPaymentRollup(invoices: ClientInvoice[]): ClientPaymentRollup {
  const rollup: ClientPaymentRollup = {
    count: invoices.length,
    net: 0,
    received: 0,
    outstanding: 0,
    byPaymentStatus: { paid: 0, partial: 0, pending: 0, overdue: 0 },
  };
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    rollup.net += inv.netReceivable;
    rollup.received += inv.received;
    rollup.outstanding += inv.outstanding;
    rollup.byPaymentStatus[inv.paymentStatus] += 1;
  }
  return rollup;
}

export function upcomingMilestones(milestones: ClientMilestone[]): ClientMilestone[] {
  return milestones
    .filter(m => m.status === "pending" || m.status === "in_progress")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });
}

export function approvedDrawings(drawings: ClientDrawing[]): ClientDrawing[] {
  return drawings.filter(d => d.approvalStatus === "approved" || d.approvalStatus === "locked");
}

export function buildActivityFeed(updates: ClientUpdate[], activity: Array<{ id: string; action: string; detail: string | null; byName: string | null; createdAt: string }>): ClientActivityRow[] {
  const rows: ClientActivityRow[] = [];
  for (const u of updates) {
    rows.push({
      id: `u-${u.id}`,
      kind: "update",
      date: u.createdAt,
      title: u.updateDate ? `Site update · ${u.updateDate}` : "Site update",
      body: u.notes,
      byName: u.authorName,
    });
  }
  for (const a of activity) {
    rows.push({
      id: `a-${a.id}`,
      kind: "log",
      date: a.createdAt,
      title: a.action,
      body: a.detail ?? "",
      byName: a.byName,
    });
  }
  return rows.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)).slice(0, 30);
}

// ── B2 query mappers ─────────────────────────────────────────────────────────

export async function getClientProject(client: any, projectId: string, email: string): Promise<PResult<ClientProjectHeader>> {
  try {
    const { data, error } = await client.from("projects")
      .select("id, name, type, status, location, progress, client_name, description, expected_end_date")
      .eq("id", projectId)
      .eq("client_email", email)
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: false, error: "Project not found or not assigned to your account." };
    const r = data as Record<string, unknown>;
    return { ok: true, data: {
      id: String(r.id),
      name: String(r.name ?? "Untitled"),
      type: String(r.type ?? "construction"),
      status: String(r.status ?? "active"),
      location: r.location == null ? null : String(r.location),
      progress: Number(r.progress ?? 0),
      clientName: r.client_name == null ? null : String(r.client_name),
      description: r.description == null ? null : String(r.description),
      expectedEndDate: r.expected_end_date == null ? null : String(r.expected_end_date),
    } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listClientInvoices(client: any, projectId: string): Promise<PResult<ClientInvoice[]>> {
  try {
    // `invoices` has no `created_at` — order by `issued_date`. `payments` is
    // polymorphic (target_type/target_id, no invoice_id FK) so payments are
    // fetched separately by target and grouped back onto invoices.
    const { data, error } = await client
      .from("invoices")
      .select("id, no, amount, gst, tds, status, issued_date")
      .eq("project_id", projectId)
      .order("issued_date", { ascending: false, nullsFirst: false });
    if (error) return { ok: false, error: String(error.message ?? error) };

    const invoices = ((data ?? []) as any[]);
    const invoiceIds = invoices.map(r => String(r.id));
    let paymentsByInvoice: Record<string, any[]> = {};
    if (invoiceIds.length > 0) {
      const { data: pData, error: pErr } = await client
        .from("payments")
        .select("target_id, amount, method, received_on, reference")
        .eq("target_type", "invoice")
        .in("target_id", invoiceIds);
      if (pErr) return { ok: false, error: String(pErr.message ?? pErr) };
      paymentsByInvoice = ((pData ?? []) as any[]).reduce<Record<string, any[]>>((acc, p) => {
        const tid = String(p.target_id ?? "");
        (acc[tid] ||= []).push(p);
        return acc;
      }, {});
    }

    return { ok: true, data: invoices.map(r => {
      const amount = Number(r.amount ?? 0);
      const gst = Number(r.gst ?? 0);
      const tds = Number(r.tds ?? 0);
      const net = netReceivable(amount, gst, tds);
      const payments = (paymentsByInvoice[String(r.id)] ?? []).map((p: any) => ({
        id: String(p.id),
        amount: Number(p.amount ?? 0),
        method: String(p.method ?? "bank"),
        receivedOn: p.received_on == null ? null : String(p.received_on),
        reference: p.reference == null ? null : String(p.reference),
      }));
      const received = payments.reduce((sum, p) => sum + p.amount, 0);
      return {
        id: String(r.id),
        no: String(r.no ?? ""),
        amount,
        gst,
        tds,
        status: r.status as "sent" | "paid" | "overdue" | "cancelled",
        issuedDate: r.issued_date == null ? null : String(r.issued_date),
        netReceivable: net,
        received,
        outstanding: outstanding(net, received),
        paymentStatus: paymentStatusFrom(received, net, r.issued_date ?? null),
        payments,
      };
    }) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listClientMilestones(client: any, projectId: string): Promise<PResult<ClientMilestone[]>> {
  try {
    const { data, error } = await client.from("milestones")
      .select("id, title, status, due_date, completed_date")
      .eq("project_id", projectId)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as any[]).map(r => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      status: r.status as "pending" | "in_progress" | "completed",
      dueDate: r.due_date == null ? null : String(r.due_date),
      completedDate: r.completed_date == null ? null : String(r.completed_date),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listClientDrawings(client: any, projectId: string): Promise<PResult<ClientDrawing[]>> {
  try {
    const { data, error } = await client.from("drawings")
      .select("id, title, type, revision, notes, release_date, approval_status, preview_url")
      .eq("project_id", projectId)
      .eq("status", "current")
      .contains("released_to", ["client"])
      .order("release_date", { ascending: false, nullsFirst: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as any[]).map(r => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      type: String(r.type ?? "drawing"),
      revision: String(r.revision ?? "Rev A"),
      notes: r.notes == null ? null : String(r.notes),
      releaseDate: r.release_date == null ? null : String(r.release_date),
      approvalStatus: (r.approval_status ?? "not_requested") as ApprovalStatus,
      previewUrl: r.preview_url == null ? null : String(r.preview_url),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listClientUpdates(client: any, projectId: string): Promise<PResult<ClientUpdate[]>> {
  try {
    const { data, error } = await client.from("site_updates")
      .select("id, notes, weather, workers_count, update_date, created_at, author:author_id(name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as any[]).map(r => ({
      id: String(r.id),
      updateDate: r.update_date == null ? null : String(r.update_date),
      notes: String(r.notes ?? ""),
      weather: r.weather == null ? null : String(r.weather),
      workersCount: r.workers_count == null ? null : Number(r.workers_count),
      authorName: (r.author as { name?: unknown } | null)?.name == null ? null : String((r.author as { name?: unknown }).name),
      createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listClientActivity(client: any, projectId: string): Promise<PResult<Array<{ id: string; action: string; detail: string | null; byName: string | null; createdAt: string }>>> {
  try {
    const { data, error } = await client.from("activity_log")
      .select("id, action, detail, by_name, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as any[]).map(r => ({
      id: String(r.id),
      action: String(r.action ?? ""),
      detail: r.detail == null ? null : String(r.detail),
      byName: r.by_name == null ? null : String(r.by_name),
      createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
