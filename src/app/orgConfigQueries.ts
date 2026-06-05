// SiteTrack Pro — org-admin config queries (Batch 6): templates, approval
// chains, notification rules. DB-wired via the migration 78 bridge (GRANT +
// v3 read/write policies). Writes are direct table ops gated by RLS.

export type CResult<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): CResult<T> => ({ ok: true, data: d });
const er = (e: unknown): CResult<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): CResult<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

// ── Templates ───────────────────────────────────────────────────────────────
export type TemplateKind = "project" | "boq" | "checklist";
export const TEMPLATE_KINDS: TemplateKind[] = ["project", "boq", "checklist"];
export interface Template { id: string; kind: TemplateKind; name: string; description: string | null; }
const asKind = oneOf<TemplateKind>(TEMPLATE_KINDS, "project");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listTemplates(client: any, orgId: string): Promise<CResult<Template[]>> {
  try {
    const { data, error } = await client.from("templates").select("id, kind, name, description").eq("org_id", orgId).order("kind", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), kind: asKind(r.kind), name: String(r.name ?? ""), description: r.description == null ? null : String(r.description) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createTemplate(client: any, input: { orgId: string; kind: TemplateKind; name: string; description?: string; createdBy: string }): Promise<CResult<{ id: string }>> {
  try {
    const { data, error } = await client.from("templates").insert({ org_id: input.orgId, kind: input.kind, name: input.name, description: input.description || null, payload: {}, created_by: input.createdBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteTemplate(client: any, id: string): Promise<CResult<{ ok: true }>> {
  try { const { error } = await client.from("templates").delete().eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}

// ── Approval chains (one per org+resource) ──────────────────────────────────
export type ApprovalResource = "expense" | "po" | "ra_bill" | "change_order" | "invoice" | "drawing_release";
export const APPROVAL_RESOURCES: ApprovalResource[] = ["expense", "po", "ra_bill", "change_order", "invoice", "drawing_release"];
export const APPROVAL_RUNG_ROLES = ["pm", "admin", "architect", "contractor"] as const;
export interface ApprovalRung { threshold: number; role: string; }
export interface ApprovalChain { resource: ApprovalResource; name: string; rungs: ApprovalRung[]; }
const asResource = oneOf<ApprovalResource>(APPROVAL_RESOURCES, "expense");
function parseRungs(v: unknown): ApprovalRung[] {
  if (!Array.isArray(v)) return [];
  return v.map(r => { const o = (r ?? {}) as Record<string, unknown>; return { threshold: Number.isFinite(Number(o.threshold)) ? Number(o.threshold) : 0, role: String(o.role ?? "pm") }; });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listChains(client: any, orgId: string): Promise<CResult<ApprovalChain[]>> {
  try {
    const { data, error } = await client.from("approval_chains").select("resource, name, rungs").eq("org_id", orgId).order("resource", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ resource: asResource(r.resource), name: String(r.name ?? ""), rungs: parseRungs(r.rungs) })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertChain(client: any, input: { orgId: string; resource: ApprovalResource; name: string; rungs: ApprovalRung[]; updatedBy: string }): Promise<CResult<{ ok: true }>> {
  try {
    const { error } = await client.from("approval_chains").upsert({ org_id: input.orgId, resource: input.resource, name: input.name, rungs: input.rungs, updated_by: input.updatedBy }, { onConflict: "org_id,resource" });
    if (error) return dbe(error); return ok({ ok: true });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteChain(client: any, orgId: string, resource: ApprovalResource): Promise<CResult<{ ok: true }>> {
  try { const { error } = await client.from("approval_chains").delete().eq("org_id", orgId).eq("resource", resource); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}

// ── Notification rules ──────────────────────────────────────────────────────
export type NotifChannel = "in_app" | "email" | "whatsapp";
export const NOTIF_CHANNELS: NotifChannel[] = ["in_app", "email", "whatsapp"];
export const NOTIF_TRIGGERS = [
  { id: "high_issue", label: "HIGH severity issue opens" },
  { id: "ra_bill_submitted", label: "RA bill submitted" },
  { id: "change_order_pending", label: "Change order awaiting approval" },
  { id: "milestone_overdue", label: "Milestone overdue" },
  { id: "drawing_release", label: "Drawing released" },
  { id: "rfi_overdue", label: "RFI unanswered > 3 days" },
  { id: "invoice_overdue", label: "Invoice payment overdue" },
] as const;
export interface NotifRule { id: string; trigger: string; channel: NotifChannel; enabled: boolean; }
const asChannel = oneOf<NotifChannel>(NOTIF_CHANNELS, "in_app");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listRules(client: any, orgId: string): Promise<CResult<NotifRule[]>> {
  try {
    const { data, error } = await client.from("notification_rules").select("id, trigger, channel, enabled").eq("org_id", orgId).order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), trigger: String(r.trigger ?? ""), channel: asChannel(r.channel), enabled: r.enabled !== false })));
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createRule(client: any, input: { orgId: string; trigger: string; channel: NotifChannel; createdBy: string }): Promise<CResult<{ id: string }>> {
  try {
    const { data, error } = await client.from("notification_rules").insert({ org_id: input.orgId, trigger: input.trigger, channel: input.channel, recipients: [], enabled: true, created_by: input.createdBy }).select("id").single();
    if (error) return dbe(error); return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setRuleEnabled(client: any, id: string, enabled: boolean): Promise<CResult<{ ok: true }>> {
  try { const { error } = await client.from("notification_rules").update({ enabled }).eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteRule(client: any, id: string): Promise<CResult<{ ok: true }>> {
  try { const { error } = await client.from("notification_rules").delete().eq("id", id); if (error) return dbe(error); return ok({ ok: true }); } catch (e) { return er(e); }
}

export const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(NOTIF_TRIGGERS.map(t => [t.id, t.label]));
export const CHANNEL_LABEL: Record<NotifChannel, string> = { in_app: "In-app", email: "Email", whatsapp: "WhatsApp" };
