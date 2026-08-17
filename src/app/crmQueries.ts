// SiteTrack Pro — CRM & Sales: org lead pipeline (v4 Phase A).
// DB: leads / lead_meetings / lead_quotations / lead_agreements (migration 161).
// ORG-scoped (org_id) — no project_id, since leads precede projects. RLS:
// read + insert/update = any org member; delete = managers (orgadmin, pm,
// project_admin, superadmin). UI gating via the crm:view / crm:manage
// capabilities + plan gate (PlanFeature "crm", Business+).

import { createProject } from "./queries";
import { workflowNextMap } from "./workflowEngine";
import { LEAD_WORKFLOW } from "./workflowDefinitions";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

// ── Enums ───────────────────────────────────────────────────────────────────
export type LeadSource = "referral" | "website" | "walk_in" | "call" | "whatsapp" | "event" | "other";
export const LEAD_SOURCES: readonly LeadSource[] = ["referral", "website", "walk_in", "call", "whatsapp", "event", "other"];

export type LeadStage = "new" | "contacted" | "meeting_scheduled" | "quotation_sent" | "negotiating" | "agreement_signed" | "won" | "lost";
export const LEAD_STAGES: readonly LeadStage[] = ["new", "contacted", "meeting_scheduled", "quotation_sent", "negotiating", "agreement_signed", "won", "lost"];

/** Stages whose lead is still "in play" (i.e. not closed). */
export const LEAD_OPEN_STAGES: readonly LeadStage[] = ["new", "contacted", "meeting_scheduled", "quotation_sent", "negotiating", "agreement_signed"];

export type MeetingOutcome = "pending" | "done" | "cancelled" | "no_show";
export const MEETING_OUTCOMES: readonly MeetingOutcome[] = ["pending", "done", "cancelled", "no_show"];

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "superseded";
export const QUOTE_STATUSES: readonly QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "superseded"];

export type AgreementStatus = "pending" | "signed" | "rejected" | "cancelled";
export const AGREEMENT_STATUSES: readonly AgreementStatus[] = ["pending", "signed", "rejected", "cancelled"];

const asStage = oneOf<LeadStage>(LEAD_STAGES, "new");
const asSource = oneOf<LeadSource>(LEAD_SOURCES, "other");
const asMeeting = oneOf<MeetingOutcome>(MEETING_OUTCOMES, "pending");
const asQuote = oneOf<QuoteStatus>(QUOTE_STATUSES, "draft");
const asAgreement = oneOf<AgreementStatus>(AGREEMENT_STATUSES, "pending");

// ── Types ───────────────────────────────────────────────────────────────────
export interface Lead {
  id: string;
  orgId: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource | null;
  budget: number | null;
  stage: LeadStage;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  wonAmount: number | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadMeeting {
  id: string;
  leadId: string;
  scheduledAt: string;
  agenda: string | null;
  outcome: MeetingOutcome;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface LeadQuotation {
  id: string;
  leadId: string;
  title: string | null;
  amount: number;
  status: QuoteStatus;
  validUntil: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface LeadAgreement {
  id: string;
  leadId: string;
  title: string | null;
  amount: number;
  status: AgreementStatus;
  signedAt: string | null;
  signedBy: string | null;
  notes: string | null;
  quotationId: string | null;
  createdBy: string | null;
  createdAt: string;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** A lead counts toward the "pipeline value" if it's not dead (lost). */
export function isOpenLead(stage: LeadStage): boolean {
  return LEAD_OPEN_STAGES.includes(stage);
}

/** Advanceable step for a stage in the funnel UI (undefined = no auto-next). Derived from the workflow register. */
export const LEAD_STAGE_NEXT: Partial<Record<LeadStage, LeadStage>> = (() => {
  const next = workflowNextMap(LEAD_WORKFLOW);
  const out: Partial<Record<LeadStage, LeadStage>> = {};
  for (const s of LEAD_STAGES) {
    const n = next[s];
    if (n !== null) out[s] = n;
  }
  return out;
})();

/** Reopen a closed lead back into the funnel (won → new, lost → new). */
export function reopenLead(stage: LeadStage): LeadStage {
  return stage === "won" || stage === "lost" ? "new" : stage;
}

export interface CrmRollup {
  total: number;
  open: number;
  won: number;
  lost: number;
  pipelineValue: number; // Σ budget of open leads
  wonValue: number;      // Σ won_amount of won leads
  byStage: Record<LeadStage, number>;
  conversionRate: number; // won / (won + lost), 0–100; 0 when none
  byOwner: Record<string, { count: number; open: number; pipelineValue: number; won: number; wonValue: number }>;
}

/** Org-wide pipeline rollup. */
export function crmRollup(leads: Lead[]): CrmRollup {
  const byStage: Record<LeadStage, number> = { new: 0, contacted: 0, meeting_scheduled: 0, quotation_sent: 0, negotiating: 0, agreement_signed: 0, won: 0, lost: 0 };
  const byOwner: CrmRollup["byOwner"] = {};
  let open = 0, won = 0, lost = 0, pipelineValue = 0, wonValue = 0;
  for (const l of leads) {
    byStage[l.stage] += 1;
    if (l.ownerId) {
      const o = byOwner[l.ownerId] ?? { count: 0, open: 0, pipelineValue: 0, won: 0, wonValue: 0 };
      o.count += 1;
      if (l.stage === "won") { o.won += 1; o.wonValue += Number(l.wonAmount ?? 0); }
      else if (l.stage !== "lost") { o.open += 1; o.pipelineValue += Number(l.budget ?? 0); }
      byOwner[l.ownerId] = o;
    }
    if (l.stage === "won") { won += 1; wonValue += Number(l.wonAmount ?? 0); }
    else if (l.stage === "lost") { lost += 1; }
    else { open += 1; pipelineValue += Number(l.budget ?? 0); }
  }
  const decided = won + lost;
  return {
    total: leads.length, open, won, lost,
    pipelineValue, wonValue,
    byStage,
    conversionRate: decided === 0 ? 0 : Math.round((won / decided) * 100),
    byOwner,
  };
}

// ── Queries ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgLeads(client: any, orgId: string): Promise<Result<Lead[]>> {
  try {
const { data, error } = await client
      .from("leads")
      .select("id, org_id, name, company, phone, email, source, budget, stage, notes, owner_id, owner:owner_id(name), won_amount, lost_reason, created_at, updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      orgId: String(r.org_id ?? ""),
      name: String(r.name ?? ""),
      company: r.company == null ? null : String(r.company),
      phone: r.phone == null ? null : String(r.phone),
      email: r.email == null ? null : String(r.email),
      source: r.source == null ? null : asSource(r.source),
      budget: r.budget == null ? null : Number(r.budget),
      stage: asStage(r.stage),
      notes: r.notes == null ? null : String(r.notes),
      ownerId: r.owner_id == null ? null : String(r.owner_id),
      ownerName: ownerNameOf(r.owner),
      wonAmount: r.won_amount == null ? null : Number(r.won_amount),
      lostReason: r.lost_reason == null ? null : String(r.lost_reason),
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

export interface LeadInput {
  name?: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: LeadSource | null;
  budget?: number | null;
  stage?: LeadStage;
  notes?: string | null;
  ownerId?: string | null;
  wonAmount?: number | null;
  lostReason?: string | null;
}

/** Create a lead in the given org. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createLead(client: any, orgId: string, input: LeadInput): Promise<Result<Lead>> {
  try {
    const { data, error } = await client
      .from("leads")
      .insert({ org_id: orgId, name: input.name, company: input.company ?? null, phone: input.phone ?? null, email: input.email ?? null, source: input.source ?? null, budget: input.budget ?? null, stage: input.stage ?? "new", notes: input.notes ?? null, owner_id: input.ownerId ?? null })
      .select("id, org_id, name, company, phone, email, source, budget, stage, notes, owner_id, owner:owner_id(name), won_amount, lost_reason, created_at, updated_at")
      .single();
    if (error) return dbe(error);
    return ok(mapLead(data));
  } catch (e) { return er(e); }
}

/** Patch a lead (only the provided fields). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateLead(client: any, leadId: string, patch: Partial<LeadInput>): Promise<Result<Lead>> {
  try {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.company !== undefined) body.company = patch.company;
    if (patch.phone !== undefined) body.phone = patch.phone;
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.source !== undefined) body.source = patch.source;
    if (patch.budget !== undefined) body.budget = patch.budget;
    if (patch.stage !== undefined) body.stage = patch.stage;
    if (patch.notes !== undefined) body.notes = patch.notes;
    if (patch.ownerId !== undefined) body.owner_id = patch.ownerId;
    if (patch.wonAmount !== undefined) body.won_amount = patch.wonAmount;
    if (patch.lostReason !== undefined) body.lost_reason = patch.lostReason;
    if (Object.keys(body).length === 0) return ok(null as unknown as Lead);
    const { data, error } = await client
      .from("leads")
      .update(body)
      .eq("id", leadId)
      .select("id, org_id, name, company, phone, email, source, budget, stage, notes, owner_id, owner:owner_id(name), won_amount, lost_reason, created_at, updated_at")
      .single();
    if (error) return dbe(error);
    return ok(mapLead(data));
  } catch (e) { return er(e); }
}

/** Advance / close a lead's stage (single source for transitions). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setLeadStage(client: any, leadId: string, stage: LeadStage): Promise<Result<Lead>> {
  return updateLead(client, leadId, { stage });
}

/** Reassign a lead's owner (null clears it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setLeadOwner(client: any, leadId: string, ownerId: string | null): Promise<Result<Lead>> {
  return updateLead(client, leadId, { ownerId });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteLead(client: any, leadId: string): Promise<Result<null>> {
  try {
    const { error } = await client.from("leads").delete().eq("id", leadId);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) { return er(e); }
}

/** Extract a profile name from a Supabase nested join (`owner:owner_id(name)`). */
function ownerNameOf(owner: unknown): string | null {
  const name = (owner as { name?: unknown } | null)?.name;
  return name == null ? null : String(name);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLead(r: any): Lead {
  return {
    id: String(r.id), orgId: String(r.org_id ?? ""), name: String(r.name ?? ""),
    company: r.company == null ? null : String(r.company),
    phone: r.phone == null ? null : String(r.phone),
    email: r.email == null ? null : String(r.email),
    source: r.source == null ? null : asSource(r.source),
    budget: r.budget == null ? null : Number(r.budget),
    stage: asStage(r.stage),
    notes: r.notes == null ? null : String(r.notes),
    ownerId: r.owner_id == null ? null : String(r.owner_id),
    ownerName: ownerNameOf(r.owner),
    wonAmount: r.won_amount == null ? null : Number(r.won_amount),
    lostReason: r.lost_reason == null ? null : String(r.lost_reason),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

// ── Meetings ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listLeadMeetings(client: any, leadId: string): Promise<Result<LeadMeeting[]>> {
  try {
    const { data, error } = await client
      .from("lead_meetings")
      .select("id, lead_id, scheduled_at, agenda, outcome, notes, created_by, created_at")
      .eq("lead_id", leadId)
      .order("scheduled_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), leadId: String(r.lead_id ?? ""), scheduledAt: String(r.scheduled_at ?? ""),
      agenda: r.agenda == null ? null : String(r.agenda), outcome: asMeeting(r.outcome),
      notes: r.notes == null ? null : String(r.notes), createdBy: r.created_by == null ? null : String(r.created_by),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Create a meeting for a lead. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addMeeting(client: any, leadId: string, m: { scheduledAt: string; agenda?: string | null; notes?: string | null }, outcome: MeetingOutcome = "pending"): Promise<Result<LeadMeeting>> {
  try {
    const { data, error } = await client
      .from("lead_meetings")
      .insert({ lead_id: leadId, scheduled_at: m.scheduledAt, agenda: m.agenda ?? null, notes: m.notes ?? null, outcome })
      .select("id, lead_id, scheduled_at, agenda, outcome, notes, created_by, created_at")
      .single();
    if (error) return dbe(error);
    return ok(meetingRow(data));
  } catch (e) { return er(e); }
}

/** Advance a meeting outcome. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setMeetingOutcome(client: any, meetingId: string, outcome: MeetingOutcome): Promise<Result<LeadMeeting>> {
  try {
    const { data, error } = await client
      .from("lead_meetings")
      .update({ outcome })
      .eq("id", meetingId)
      .select("id, lead_id, scheduled_at, agenda, outcome, notes, created_by, created_at")
      .single();
    if (error) return dbe(error);
    return ok(meetingRow(data));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteMeeting(client: any, meetingId: string): Promise<Result<null>> {
  try {
    const { error } = await client.from("lead_meetings").delete().eq("id", meetingId);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function meetingRow(r: any): LeadMeeting {
  return { id: String(r.id), leadId: String(r.lead_id ?? ""), scheduledAt: String(r.scheduled_at ?? ""), agenda: r.agenda == null ? null : String(r.agenda), outcome: asMeeting(r.outcome), notes: r.notes == null ? null : String(r.notes), createdBy: r.created_by == null ? null : String(r.created_by), createdAt: String(r.created_at ?? "") };
}

// ── Quotations ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listLeadQuotations(client: any, leadId: string): Promise<Result<LeadQuotation[]>> {
  try {
    const { data, error } = await client
      .from("lead_quotations")
      .select("id, lead_id, title, amount, status, valid_until, sent_at, created_by, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), leadId: String(r.lead_id ?? ""), title: r.title == null ? null : String(r.title),
      amount: Number(r.amount ?? 0), status: asQuote(r.status), validUntil: r.valid_until == null ? null : String(r.valid_until),
      sentAt: r.sent_at == null ? null : String(r.sent_at), createdBy: r.created_by == null ? null : String(r.created_by),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Add a quotation to a lead. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addQuotation(client: any, leadId: string, q: { title?: string | null; amount: number; validUntil?: string | null }): Promise<Result<LeadQuotation>> {
  try {
    const { data, error } = await client
      .from("lead_quotations")
      .insert({ lead_id: leadId, title: q.title ?? null, amount: q.amount, valid_until: q.validUntil ?? null, status: "draft" })
      .select("id, lead_id, title, amount, status, valid_until, sent_at, created_by, created_at")
      .single();
    if (error) return dbe(error);
    return ok(quotationRow(data));
  } catch (e) { return er(e); }
}

/** Move a quotation draft → sent → accepted / rejected. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setQuoteStatus(client: any, quotId: string, status: QuoteStatus): Promise<Result<LeadQuotation>> {
  try {
    const body: Record<string, unknown> = { status };
    if (status === "sent") body.sent_at = new Date().toISOString();
    const { data, error } = await client
      .from("lead_quotations")
      .update(body)
      .eq("id", quotId)
      .select("id, lead_id, title, amount, status, valid_until, sent_at, created_by, created_at")
      .single();
    if (error) return dbe(error);
    return ok(quotationRow(data));
  } catch (e) { return er(e); }
}

/** Fetch a single quotation by id (for conversion/move flows). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getQuotation(client: any, quotId: string): Promise<Result<LeadQuotation | null>> {
  try {
    const { data, error } = await client
      .from("lead_quotations")
      .select("id, lead_id, title, amount, status, valid_until, sent_at, created_by, created_at")
      .eq("id", quotId)
      .maybeSingle();
    if (error) return dbe(error);
    if (!data) return ok(null);
    return ok(quotationRow(data));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteQuotation(client: any, quotId: string): Promise<Result<null>> {
  try {
    const { error } = await client.from("lead_quotations").delete().eq("id", quotId);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function quotationRow(r: any): LeadQuotation {
  return { id: String(r.id), leadId: String(r.lead_id ?? ""), title: r.title == null ? null : String(r.title), amount: Number(r.amount ?? 0), status: asQuote(r.status), validUntil: r.valid_until == null ? null : String(r.valid_until), sentAt: r.sent_at == null ? null : String(r.sent_at), createdBy: r.created_by == null ? null : String(r.created_by), createdAt: String(r.created_at ?? "") };
}

// ── Agreements ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listLeadAgreements(client: any, leadId: string): Promise<Result<LeadAgreement[]>> {
  try {
    const { data, error } = await client
      .from("lead_agreements")
      .select("id, lead_id, title, amount, status, signed_at, signed_by, notes, quotation_id, created_by, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), leadId: String(r.lead_id ?? ""), title: r.title == null ? null : String(r.title),
      amount: Number(r.amount ?? 0), status: asAgreement(r.status), signedAt: r.signed_at == null ? null : String(r.signed_at),
      signedBy: r.signed_by == null ? null : String(r.signed_by), notes: r.notes == null ? null : String(r.notes),
      quotationId: r.quotation_id == null ? null : String(r.quotation_id),
      createdBy: r.created_by == null ? null : String(r.created_by), createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

/** Create an agreement record (typically after a quotation is accepted). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addAgreement(client: any, leadId: string, a: { title?: string | null; amount: number; notes?: string | null; quotationId?: string | null }): Promise<Result<LeadAgreement>> {
  try {
    const { data, error } = await client
      .from("lead_agreements")
      .insert({ lead_id: leadId, title: a.title ?? null, amount: a.amount, notes: a.notes ?? null, status: "pending", quotation_id: a.quotationId ?? null })
      .select("id, lead_id, title, amount, status, signed_at, signed_by, notes, quotation_id, created_by, created_at")
      .single();
    if (error) return dbe(error);
    return ok(agreementRow(data));
  } catch (e) { return er(e); }
}

/** Mark an agreement signed (records signer + timestamp) / rejected / cancelled. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setAgreementStatus(client: any, agrId: string, status: AgreementStatus, signedBy?: string): Promise<Result<LeadAgreement>> {
  try {
    const body: Record<string, unknown> = { status };
    if (status === "signed") { body.signed_at = new Date().toISOString(); if (signedBy) body.signed_by = signedBy; }
    else { body.signed_at = null; body.signed_by = null; }
    const { data, error } = await client
      .from("lead_agreements")
      .update(body)
      .eq("id", agrId)
      .select("id, lead_id, title, amount, status, signed_at, signed_by, notes, quotation_id, created_by, created_at")
      .single();
    if (error) return dbe(error);
    return ok(agreementRow(data));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteAgreement(client: any, agrId: string): Promise<Result<null>> {
  try {
    const { error } = await client.from("lead_agreements").delete().eq("id", agrId);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function agreementRow(data: any): LeadAgreement {
  return { id: String(data.id), leadId: String(data.lead_id ?? ""), title: data.title == null ? null : String(data.title), amount: Number(data.amount ?? 0), status: asAgreement(data.status), signedAt: data.signed_at == null ? null : String(data.signed_at), signedBy: data.signed_by == null ? null : String(data.signed_by), notes: data.notes == null ? null : String(data.notes), quotationId: data.quotation_id == null ? null : String(data.quotation_id), createdBy: data.created_by == null ? null : String(data.created_by), createdAt: String(data.created_at ?? "") };
}

// ── Sales → project handoff (v4 A2) ─────────────────────────────────────────
// When a lead is won and signed, the firm can open a real project seeded from
// the lead's name/company + the accepted amount. This does the project insert
// (reusing createProject from queries.ts) and, on success, advances the lead
// to `won` with won_amount set. Gated by crm:manage + project:create.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createProjectFromLead(client: any, input: {
  orgId: string;
  leadId: string;
  name: string;
  type: string;
  budget: number;
}): Promise<Result<{ projectId: string }>> {
  try {
    const r = await createProject(client, { orgId: input.orgId, name: input.name, type: input.type as never });
    if (!r.ok) return { ok: false, error: r.error };
    const projectId = r.data.id;
    // Record the win + amount on the lead (RLS: org member update).
    await updateLead(client, input.leadId, { stage: "won", wonAmount: input.budget });
    return ok({ projectId });
  } catch (e) { return er(e); }
}

/** The accepted quotation for a lead (highest amount, status accepted). */
export function acceptedQuote(quotes: LeadQuotation[]): LeadQuotation | null {
  let best: LeadQuotation | null = null;
  for (const q of quotes) {
    if (q.status !== "accepted") continue;
    if (best === null || q.amount > best.amount) best = q;
  }
  return best;
}

/**
 * Convert an accepted quotation into an agreement with one tap. Returns the
 * existing agreement when this quotation was already converted (idempotent via
 * the partial-unique `uq_lead_agreements_quotation` index). Rejects quotations
 * that are not `accepted`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function acceptQuotationAsAgreement(client: any, quotationId: string): Promise<Result<LeadAgreement>> {
  try {
    const q = await getQuotation(client, quotationId);
    if (!q.ok) return { ok: false, error: q.error };
    const quote = q.data;
    if (!quote) return { ok: false, error: "Quotation not found." };
    if (quote.status !== "accepted") {
      return { ok: false, error: "Only an accepted quotation can be converted into an agreement." };
    }
    const existing = await client
      .from("lead_agreements")
      .select("id, lead_id, title, amount, status, signed_at, signed_by, notes, quotation_id, created_by, created_at")
      .eq("quotation_id", quotationId)
      .maybeSingle();
    if (existing.error) return dbe(existing.error);
    if (existing.data) return ok(agreementRow(existing.data));
    const ins = await client
      .from("lead_agreements")
      .insert({ lead_id: quote.leadId, title: quote.title ?? null, amount: quote.amount, notes: null, status: "pending", quotation_id: quotationId })
      .select("id, lead_id, title, amount, status, signed_at, signed_by, notes, quotation_id, created_by, created_at")
      .single();
    if (ins.error) return dbe(ins.error);
    return ok(agreementRow(ins.data));
  } catch (e) { return er(e); }
}