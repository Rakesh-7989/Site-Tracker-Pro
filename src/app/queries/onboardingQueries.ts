// SiteTrack Pro — org onboarding queries.

import type { CompanySegment, ProjectType } from "@/auth";
import { type OrgType } from "@/auth/orgType";
import type { EnabledModules } from "@/modules";
import type { SignupPlan } from "./signupQueries";
import type { BillingPeriod } from "@/features/marketing/plans";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgDetails {
  id: string;
  name: string;
  contact_email: string;
  /** Company segment (migration 134); null until the owner picks one. */
  segment: CompanySegment | null;
  /** Multi-segment picks (migration 228); null = not configured. */
  segments?: CompanySegment[] | null;
  /** Firm type (migration 240); null = legacy/unclassified. */
  org_type?: OrgType | null;
  /** Enabled product modules (migration 155); null = not configured yet. */
  enabled_modules: EnabledModules;
  /** Plan id. Self-service orgs start on "pro" (14-day trial); null = legacy. */
  plan: SignupPlan | null;
  /** Billing cycle (migration 194); null until chosen. */
  billing_period: BillingPeriod | null;
}

/** Gets the current user's org id and details. */
export async function getMyOrg(client: TypedSupabaseClient): Promise<PResult<{ orgId: string; org: OrgDetails | null }>> {
  try {
    const uid = (await client.auth.getUser())?.data?.user?.id;
    if (!uid) return { ok: false, error: "Not authenticated." };
    const { data: om, error: omErr } = await client.from("org_members")
      .select("org_id").eq("profile_id", uid).limit(1).maybeSingle();
    if (omErr) return { ok: false, error: String(omErr.message ?? omErr) };
    if (!om?.org_id) return { ok: false, error: "No org membership." };
    const { data: org } = await client.from("organizations")
      .select("id, name, contact_email, segment, segments, org_type, enabled_modules, plan, billing_period").eq("id", om.org_id).maybeSingle();
    return { ok: true, data: { orgId: om.org_id, org: (org as unknown as OrgDetails) ?? null } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function updateOrg(
  client: TypedSupabaseClient, orgId: string, name: string, contactEmail: string, segment?: CompanySegment | null,
  enabledModules?: EnabledModules,
  plan?: SignupPlan | null,
  billingPeriod?: BillingPeriod | null,
  segments?: CompanySegment[] | null,
  orgType?: OrgType | null,
): Promise<PResult<void>> {
  try {
    const patch: Record<string, unknown> = { name: name.trim(), contact_email: contactEmail.trim() };
    if (segment) patch.segment = segment;
    if (segments !== undefined) patch.segments = segments;
    if (enabledModules !== undefined) patch.enabled_modules = enabledModules;
    // NOTE (SEC-P0-2, migration 254): plan/billing_period changes are
    // superadmin-gated server-side. Echoing the CURRENT values is a no-op
    // the trigger allows; a real change from a non-superadmin fails here
    // with 'organization_plan: ... require superadmin'. Plan upgrades must
    // flow through the subscription lifecycle (Cashfree / superadmin).
    if (plan) patch.plan = plan;
    if (billingPeriod !== undefined && billingPeriod !== null) patch.billing_period = billingPeriod;
    if (orgType !== undefined) patch.org_type = orgType; // null clears back to segment-derived
    const { error } = await client.from("organizations")
      .update(patch as never).eq("id", orgId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function insertOrgMembers(
  client: TypedSupabaseClient, orgId: string, members: Array<{ name: string; email: string }>,
): Promise<PResult<void>> {
  try {
    const rows = members.map(m => ({ org_id: orgId, name: m.name, email: m.email })) as never[];
    const { error } = await client.from("org_members").insert(rows);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function createProject(
  client: TypedSupabaseClient, orgId: string, name: string, clientName: string, startDate: string, type: ProjectType = "construction",
): Promise<PResult<void>> {
  try {
    const { error } = await client.from("projects").insert({
      org_id: orgId, name: name.trim(), client_name: clientName.trim(),
      start_date: startDate, status: "active", progress: 0, type,
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function disableFeatureFlags(
  client: TypedSupabaseClient, orgId: string, keys: string[],
): Promise<PResult<void>> {
  try {
    for (const key of keys) {
      const { error } = await client.from("org_feature_flags")
        .upsert({ org_id: orgId, key, enabled: false }, { onConflict: "org_id, key" });
      if (error) return { ok: false, error: String(error.message ?? error) };
    }
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function completeOnboarding(client: TypedSupabaseClient, orgId: string): Promise<PResult<void>> {
  try {
    const { error } = await client.from("ops_toggles")
      .upsert({ org_id: orgId, key: "onboarding_done", value: "true" }, { onConflict: "org_id, key" });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/**
 * Has the org completed the onboarding wizard? (ops_toggles key/value —
 * readable by that org's admin via ops_write FOR ALL.)
 * Fail-open: any read error or missing access returns TRUE so a user is never
 * trapped in a redirect loop; only a fresh org's absent row returns FALSE.
 */
export async function isOnboardingDone(client: TypedSupabaseClient, orgId: string): Promise<boolean> {
  try {
    const { data } = await client.from("ops_toggles")
      .select("value")
      .eq("org_id", orgId)
      .eq("key", "onboarding_done")
      .maybeSingle();
    return data?.value !== "true" ? false : true;
  } catch {
    return true;
  }
}

/**
 * Does the org have at least one project? Used together with isOnboardingDone
 * so pre-existing orgs (created before the wizard shipped, no flag recorded)
 * are never force-routed into onboarding.
 */
export async function orgHasProjects(client: TypedSupabaseClient, orgId: string): Promise<boolean> {
  try {
    const { data } = await client.from("projects")
      .select("id")
      .eq("org_id", orgId)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return true;
  }
}
