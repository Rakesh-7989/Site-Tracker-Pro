// SiteTrack Pro — v5 Phase B1: Client Approval & Revision System queries.
// Drawing revision chain + client approval state, Figma-style x/y comment
// pins + threads, guarded project share links (created via the DB-side
// create_share_link RPC so passwords/OTPs never touch the client), the
// previously-broken handover_signatures CRUD, and the anon share surface
// (validate_share_link / share_project_payload RPC wrappers). Mirrors the
// Result<T> client-injected pattern of researchQueries / designQueries.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

// ── Drawing approval state (migration 185) ──────────────────────────────────
export type ApprovalStatus = "not_requested" | "pending" | "approved" | "rejected" | "locked";
export const APPROVAL_STATUSES = ["not_requested", "pending", "approved", "rejected", "locked"] as const;
const asApproval = oneOf<ApprovalStatus>(["not_requested", "pending", "approved", "rejected", "locked"], "not_requested");

/** Semantic tone per approval status (badges / chips). */
export const APPROVAL_TONE: Record<ApprovalStatus, "neutral" | "warning" | "success" | "danger" | "neutral"> = {
  not_requested: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  locked: "neutral",
};

export interface ApprovalDrawing {
  id: string;
  projectId: string;
  title: string;
  type: string;
  revision: string;
  status: "current" | "superseded";
  releaseDate: string | null;
  storagePath: string | null;
  previewUrl: string | null;
  designStage: string;
  parentId: string | null;
  changeNote: string | null;
  approvalStatus: ApprovalStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  hasSignature: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listApprovalDrawings(client: any, projectId: string): Promise<Result<ApprovalDrawing[]>> {
  try {
    const { data, error } = await client
      .from("drawings")
      .select("id, project_id, title, type, revision, status, release_date, storage_path, preview_url, design_stage, parent_id, change_note, approval_status, approved_by, approved_at, signature, approver:approved_by(name)")
      .eq("project_id", projectId)
      .order("release_date", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      title: String(r.title ?? ""),
      type: String(r.type ?? ""),
      revision: String(r.revision ?? "Rev A"),
      status: r.status === "superseded" ? ("superseded" as const) : ("current" as const),
      releaseDate: r.release_date == null ? null : String(r.release_date),
      storagePath: r.storage_path == null ? null : String(r.storage_path),
      previewUrl: r.preview_url == null ? null : String(r.preview_url),
      designStage: String(r.design_stage ?? "concept"),
      parentId: r.parent_id == null ? null : String(r.parent_id),
      changeNote: r.change_note == null ? null : String(r.change_note),
      approvalStatus: asApproval(r.approval_status),
      approvedByName: (r.approver as { name?: unknown } | null)?.name == null ? null : String((r.approver as { name?: unknown }).name),
      approvedAt: r.approved_at == null ? null : String(r.approved_at),
      hasSignature: r.signature != null && String(r.signature).length > 0,
    })));
  } catch (e) { return er(e); }
}

/** Request client review on a revision (draft → pending). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestApproval(client: any, drawingId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("drawings").update({ approval_status: "pending" }).eq("id", drawingId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Approve a revision, capturing the signer's name + signature data URL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function approveDrawing(client: any, input: { drawingId: string; approvedBy: string; signature: string | null }): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("drawings").update({
      approval_status: "approved",
      approved_by: input.approvedBy,
      approved_at: new Date().toISOString(),
      signature: input.signature,
    }).eq("id", input.drawingId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Reject a revision → back to the drawing team (pending → rejected). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rejectDrawing(client: any, drawingId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("drawings").update({ approval_status: "rejected" }).eq("id", drawingId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Lock a revision — final gate; no further approve/reject (approved → locked). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lockDrawing(client: any, drawingId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("drawings").update({ approval_status: "locked" }).eq("id", drawingId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Spawn a new revision chained to a parent drawing (the revision register). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createRevision(client: any, input: {
  projectId: string;
  parentId: string;
  title: string;
  type: string;
  revision: string;
  releasedBy: string;
  changeNote: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("drawings").insert({
      project_id: input.projectId,
      parent_id: input.parentId,
      title: input.title,
      type: input.type,
      revision: input.revision,
      released_by: input.releasedBy,
      change_note: input.changeNote || null,
      status: "current",
      approval_status: "not_requested",
    }).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

/** Pure revision-sequence helpers — the register sorts "Rev A" < "Rev B" … < "Rev Z" < "Rev AA". */
const REV_RE = /^(?:rev\s*)?([a-z]+|\d+)$/i;
export function revisionRank(revision: string): number {
  const m = String(revision ?? "").trim().match(REV_RE);
  if (!m) return -1;
  const tok = m[1];
  if (/^\d+$/.test(tok)) return 1000 + Number(tok);
  // Excel-style column rank (A=1, Z=26, AA=27 …) so multi-letter revisions order correctly.
  let n = 0;
  for (const ch of tok.toLowerCase()) n = n * 26 + (ch.charCodeAt(0) - 96);
  return n;
}
/** Next revision label: Rev A → Rev B, Rev Z → Rev AA, Rev 3 → Rev 4. */
export function nextRevision(revision: string): string {
  const m = String(revision ?? "").trim().match(/^(rev\s*)?([a-z]+|\d+)$/i);
  if (!m) return "Rev A";
  const prefix = m[1] ? "Rev " : "";
  const tok = m[2];
  if (/^\d+$/.test(tok)) return `${prefix}${Number(tok) + 1}`;
  // Excel-style increment: z → aa, az → ba. Preserve the source casing
  // ("Rev A" → "Rev B", "rev a" → "rev b").
  const upper = tok === tok.toUpperCase();
  const chars = tok.toLowerCase().split("");
  let i = chars.length - 1;
  for (; i >= 0; i--) {
    if (chars[i] !== "z") { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); break; }
    chars[i] = "a";
  }
  if (i < 0) chars.unshift("a");
  let label = chars.join("");
  if (upper) label = label.toUpperCase();
  return prefix ? `Rev ${label}` : label;
}
/** Sort the register oldest → newest and expose chain depth per drawing. */
export function revisionChain(drawings: Array<{ id: string; parentId: string | null }>): Array<{ id: string; depth: number }> {
  const byId = new Map(drawings.map(d => [d.id, d]));
  return drawings.map(d => {
    let depth = 0;
    let cur: { id: string; parentId: string | null } | undefined = d;
    const seen = new Set<string>();
    while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId) && depth < 100) {
      seen.add(cur.parentId);
      depth += 1;
      cur = byId.get(cur.parentId);
    }
    return { id: d.id, depth };
  });
}
export function sortRevisions<T extends { revision: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => revisionRank(a.revision) - revisionRank(b.revision));
}

// ── Drawing comment pins + threads (migration 185) ──────────────────────────
export type CommentStatus = "open" | "in_progress" | "resolved" | "closed";
export const COMMENT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const asComment = oneOf<CommentStatus>(["open", "in_progress", "resolved", "closed"], "open");

export const COMMENT_TONE: Record<CommentStatus, "neutral" | "warning" | "info" | "success" | "neutral"> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
};

export interface DrawingComment {
  id: string;
  drawingId: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string | null;
  /** Fractional position 0–1 (null for thread replies). */
  x: number | null;
  y: number | null;
  body: string;
  status: CommentStatus;
  resolvedAt: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listDrawingComments(client: any, drawingId: string): Promise<Result<DrawingComment[]>> {
  try {
    const { data, error } = await client
      .from("drawing_comments")
      .select("id, drawing_id, parent_id, author_id, x, y, body, status, resolved_at, created_at, author:author_id(name)")
      .eq("drawing_id", drawingId)
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      drawingId: String(r.drawing_id ?? ""),
      parentId: r.parent_id == null ? null : String(r.parent_id),
      authorId: r.author_id == null ? null : String(r.author_id),
      authorName: (r.author as { name?: unknown } | null)?.name == null ? null : String((r.author as { name?: unknown }).name),
      x: r.x == null ? null : Number(r.x),
      y: r.y == null ? null : Number(r.y),
      body: String(r.body ?? ""),
      status: asComment(r.status),
      resolvedAt: r.resolved_at == null ? null : String(r.resolved_at),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Place a pin (x/y) or reply to a thread (parentId, no x/y). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addDrawingComment(client: any, input: {
  drawingId: string;
  authorId: string;
  body: string;
  x?: number | null;
  y?: number | null;
  parentId?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("drawing_comments").insert({
      drawing_id: input.drawingId,
      author_id: input.authorId,
      body: input.body,
      x: input.x ?? null,
      y: input.y ?? null,
      parent_id: input.parentId ?? null,
    }).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

/** Advance a thread's status (open → in_progress → resolved; managers may close). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setCommentStatus(client: any, commentId: string, status: CommentStatus): Promise<Result<{ ok: true }>> {
  try {
    const patch: Record<string, unknown> = { status };
    if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();
    if (status === "open") patch.resolved_at = null;
    const { error } = await client.from("drawing_comments").update(patch).eq("id", commentId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteDrawingComment(client: any, commentId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("drawing_comments").delete().eq("id", commentId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Group a flat comment list into threads: top-level pins with their replies. */
export function commentThreads(comments: DrawingComment[]): DrawingComment[] {
  const ids = new Set(comments.map(c => c.id));
  return comments.filter(c => c.parentId == null || !ids.has(c.parentId));
}
export function commentReplies(comments: DrawingComment[], parentId: string): DrawingComment[] {
  return comments.filter(c => c.parentId === parentId);
}
export function openCommentCount(comments: DrawingComment[]): number {
  return comments.filter(c => c.parentId == null && (c.status === "open" || c.status === "in_progress")).length;
}

// ── Share links (migration 185) ─────────────────────────────────────────────
export interface ShareLink {
  id: string;
  projectId: string;
  token: string;
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  allowDownload: boolean;
  maxViews: number | null;
  views: number;
  createdAt: string;
}

export function shareUrl(token: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/share-link/${token}`;
}
/** Cryptographically-random 18-char hex token for the path segment. */
export function newShareToken(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** Read share links WITHOUT the password hash / otp (those are RPC-only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listShareLinks(client: any, projectId: string): Promise<Result<ShareLink[]>> {
  try {
    const { data, error } = await client
      .from("share_links")
      .select("id, project_id, token, label, expires_at, revoked_at, allow_download, max_views, views, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      token: String(r.token ?? ""),
      label: r.label == null ? null : String(r.label),
      expiresAt: r.expires_at == null ? null : String(r.expires_at),
      revokedAt: r.revoked_at == null ? null : String(r.revoked_at),
      allowDownload: r.allow_download !== false,
      maxViews: r.max_views == null ? null : Number(r.max_views),
      views: Number(r.views ?? 0),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Create a share link via the DB RPC so passwords/OTPs never reach the client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createShareLink(client: any, input: {
  projectId: string;
  label?: string | null;
  allowDownload?: boolean;
  expiresAt?: string | null;
  maxViews?: number | null;
  password?: string | null;
  needOtp?: boolean;
}): Promise<Result<{ id: string; token: string; otp: string | null }>> {
  try {
    const { data, error } = await client.rpc("create_share_link", {
      p_project_id: input.projectId,
      p_label: input.label ?? null,
      p_allow_download: input.allowDownload ?? true,
      p_expires_at: input.expiresAt ?? null,
      p_max_views: input.maxViews ?? null,
      p_password: input.password ?? null,
      p_need_otp: input.needOtp ?? false,
    });
    if (error) return dbe(error);
    const row = data as { id?: string; token?: string; otp?: string | null } | null;
    if (!row?.token) return er(new Error("create_share_link returned no token"));
    return ok({ id: String(row.id ?? ""), token: String(row.token), otp: row.otp ?? null });
  } catch (e) { return er(e); }
}

/** Toggle download / label / expiry / max-views on an existing link. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateShareLink(client: any, id: string, patch: {
  label?: string | null;
  expiresAt?: string | null;
  allowDownload?: boolean;
  maxViews?: number | null;
}): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("share_links").update({
      label: patch.label ?? null,
      expires_at: patch.expiresAt ?? null,
      allow_download: patch.allowDownload ?? true,
      max_views: patch.maxViews ?? null,
    }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Revoke (or un-revoke) a share link. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setShareLinkRevoked(client: any, id: string, revoked: boolean): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("share_links").update({ revoked_at: revoked ? new Date().toISOString() : null }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Handover signatures (migration 185 — DDL previously never shipped) ──────
export interface HandoverSignature {
  id: string;
  projectId: string;
  orgId: string;
  signedByName: string | null;
  signature: string;
  signedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listHandoverSignatures(client: any, projectId: string): Promise<Result<HandoverSignature[]>> {
  try {
    const { data, error } = await client
      .from("handover_signatures")
      .select("id, project_id, org_id, signed_by, signature, signed_at, signer:signed_by(name)")
      .eq("project_id", projectId)
      .order("signed_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      orgId: String(r.org_id ?? ""),
      signedByName: (r.signer as { name?: unknown } | null)?.name == null ? null : String((r.signer as { name?: unknown }).name),
      signature: String(r.signature ?? ""),
      signedAt: String(r.signed_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addHandoverSignature(client: any, input: {
  projectId: string;
  orgId: string;
  signedBy: string;
  signature: string;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from("handover_signatures").insert({
      project_id: input.projectId,
      org_id: input.orgId,
      signed_by: input.signedBy,
      signature: input.signature,
    }).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// ── Public share surface (anon RPC wrappers — the ONLY anon path) ───────────
export interface ShareLinkGate {
  valid: boolean;
  reason: string;
  projectId: string | null;
  label: string | null;
  allowDownload: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  views: number;
  maxViews: number | null;
  requiresPassword: boolean;
  requiresOtp: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function validateShareLink(client: any, token: string): Promise<Result<ShareLinkGate>> {
  try {
    const { data, error } = await client.rpc("validate_share_link", { p_token: token });
    if (error) return dbe(error);
    const r = data as Record<string, unknown> | null;
    if (!r) return er(new Error("validate_share_link returned no row"));
    return ok({
      valid: r.valid === true,
      reason: String(r.reason ?? "unknown"),
      projectId: r.project_id == null ? null : String(r.project_id),
      label: r.label == null ? null : String(r.label),
      allowDownload: r.allow_download !== false,
      expiresAt: r.expires_at == null ? null : String(r.expires_at),
      revokedAt: r.revoked_at == null ? null : String(r.revoked_at),
      views: Number(r.views ?? 0),
      maxViews: r.max_views == null ? null : Number(r.max_views),
      requiresPassword: r.requires_password === true,
      requiresOtp: r.requires_otp === true,
    });
  } catch (e) { return er(e); }
}

/** Full project payload from a share link (views++ + otp consumption inside). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchSharePayload(client: any, input: { token: string; password?: string | null; otp?: string | null }): Promise<Result<unknown>> {
  try {
    const { data, error } = await client.rpc("share_project_payload", {
      p_token: input.token,
      p_password: input.password ?? null,
      p_otp: input.otp ?? null,
    });
    if (error) return dbe(error);
    if (data == null) return er(new Error("Invalid or expired share link"));
    return ok(data as unknown);
  } catch (e) { return er(e); }
}

// ── Org-wide approval rollup (v5 B1) ────────────────────────────────────────
export interface OrgApprovalProject {
  id: string;
  name: string;
  type: string;
  drawings: ApprovalDrawing[];
  analytics: ApprovalAnalytics;
}
export interface OrgApprovalRollup {
  projects: OrgApprovalProject[];
  totalRevisions: number;
  pending: number;
  approved: number;
  rejected: number;
  locked: number;
  approvalRate: number;
}

/** Fold per-project analytics into one org rollup (pure; testable). */
export function approvalOrgRollup(rows: ApprovalDrawing[], projectName: (id: string) => string | null, projectType: (id: string) => string | null): OrgApprovalRollup {
  const byProject = new Map<string, ApprovalDrawing[]>();
  for (const d of rows) {
    const list = byProject.get(d.projectId) ?? [];
    list.push(d);
    byProject.set(d.projectId, list);
  }
  const projects = Array.from(byProject.entries())
    .map(([id, drawings]) => ({
      id,
      name: projectName(id) ?? "—",
      type: projectType(id) ?? "—",
      drawings,
      analytics: approvalAnalytics(drawings),
    }))
    .sort((a, b) => b.analytics.totalRevisions - a.analytics.totalRevisions);
  const sum = (f: (a: ApprovalAnalytics) => number) => projects.reduce((s, p) => s + f(p.analytics), 0);
  const reviewed = sum(a => a.approved + a.locked + a.rejected);
  const green = sum(a => a.approved + a.locked);
  return {
    projects,
    totalRevisions: sum(a => a.totalRevisions),
    pending: sum(a => a.pending),
    approved: sum(a => a.approved),
    rejected: sum(a => a.rejected),
    locked: sum(a => a.locked),
    approvalRate: reviewed === 0 ? 0 : green / reviewed,
  };
}

/** All approval-relevant drawings across an org's member projects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgApprovalDrawings(client: any, orgId: string, projectIds: string[] | null = null): Promise<Result<{ drawings: ApprovalDrawing[]; projectName: (id: string) => string | null; projectType: (id: string) => string | null }>> {
  try {
    if (projectIds && projectIds.length === 0) return ok({ drawings: [], projectName: () => null, projectType: () => null });
    let q = client.from("projects").select("id, name, type").eq("org_id", orgId);
    if (projectIds && projectIds.length > 0) q = q.in("id", projectIds);
    const { data: projects, error: pErr } = await q;
    if (pErr) return dbe(pErr);
    const projs = (projects ?? []) as Array<Record<string, unknown>>;
    if (projs.length === 0) return ok({ drawings: [], projectName: () => null, projectType: () => null });
    const ids = projs.map(p => String(p.id));
    const { data, error } = await client
      .from("drawings")
      .select("id, project_id, title, type, revision, status, release_date, storage_path, preview_url, design_stage, parent_id, change_note, approval_status, approved_by, approved_at, signature, approver:approved_by(name)")
      .in("project_id", ids)
      .order("release_date", { ascending: false });
    if (error) return dbe(error);
    const nameOf = new Map(projs.map(p => [String(p.id), String(p.name ?? "")]));
    const typeOf = new Map(projs.map(p => [String(p.id), String(p.type ?? "")]));
    return ok({
      drawings: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
        id: String(r.id),
        projectId: String(r.project_id ?? ""),
        title: String(r.title ?? ""),
        type: String(r.type ?? ""),
        revision: String(r.revision ?? "Rev A"),
        status: r.status === "superseded" ? ("superseded" as const) : ("current" as const),
        releaseDate: r.release_date == null ? null : String(r.release_date),
        storagePath: r.storage_path == null ? null : String(r.storage_path),
        previewUrl: r.preview_url == null ? null : String(r.preview_url),
        designStage: String(r.design_stage ?? "concept"),
        parentId: r.parent_id == null ? null : String(r.parent_id),
        changeNote: r.change_note == null ? null : String(r.change_note),
        approvalStatus: asApproval(r.approval_status),
        approvedByName: (r.approver as { name?: unknown } | null)?.name == null ? null : String((r.approver as { name?: unknown }).name),
        approvedAt: r.approved_at == null ? null : String(r.approved_at),
        hasSignature: r.signature != null && String(r.signature).length > 0,
      })),
      projectName: id => nameOf.get(id) ?? null,
      projectType: id => typeOf.get(id) ?? null,
    });
  } catch (e) { return er(e); }
}

// ── Approval analytics (pure) ───────────────────────────────────────────────
export interface ApprovalAnalytics {
  totalRevisions: number;
  pending: number;
  approved: number;
  rejected: number;
  locked: number;
  approvalRate: number;        // 0–1 approved / reviewed (approved+locked+rejected)
  avgApprovalDays: number;     // release → approved, over approved+locked drawings
  maxRevisionDepth: number;    // longest revision chain
}

const MS_DAY = 86_400_000;
function daysBetween(a: string | null, b: string | null): number | null {
  if (a == null || b == null) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.max(0, (db - da) / MS_DAY);
}

export function approvalAnalytics(drawings: ApprovalDrawing[]): ApprovalAnalytics {
  const reviewed = drawings.filter(d => d.approvalStatus === "approved" || d.approvalStatus === "locked" || d.approvalStatus === "rejected");
  const days: number[] = [];
  for (const d of drawings) {
    if (d.approvalStatus === "approved" || d.approvalStatus === "locked") {
      const dd = daysBetween(d.releaseDate, d.approvedAt);
      if (dd != null) days.push(dd);
    }
  }
  const depth = revisionChain(drawings);
  const maxDepth = depth.reduce((m, d) => Math.max(m, d.depth), 0);
  return {
    totalRevisions: drawings.length,
    pending: drawings.filter(d => d.approvalStatus === "pending").length,
    approved: drawings.filter(d => d.approvalStatus === "approved").length,
    rejected: drawings.filter(d => d.approvalStatus === "rejected").length,
    locked: drawings.filter(d => d.approvalStatus === "locked").length,
    approvalRate: reviewed.length === 0 ? 0 : (drawings.filter(d => d.approvalStatus === "approved" || d.approvalStatus === "locked").length) / reviewed.length,
    avgApprovalDays: days.length === 0 ? 0 : days.reduce((s, d) => s + d, 0) / days.length,
    maxRevisionDepth: maxDepth,
  };
}
