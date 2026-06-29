// SiteTrack Pro — Tenant context middleware for defense-in-depth.
//
// Sets the active org_id and role in the PostgreSQL session so RLS
// policies can additionally check `current_setting('app.org_id')`
// for cross-tenant defense.
//
// Usage:
//   import { setTenantContext } from "../lib/tenantContext";
//   await setTenantContext(sb, activeOrgId);
//
// The context is transaction-scoped (is_local = true), so for Edge
// Functions that run inside a single PG transaction this takes effect
// for the entire invocation. For browser REST queries (each a separate
// HTTP request), the context is set per-call; the RPC is lightweight
// (< 1 ms) so it can be called before every query.

export async function setTenantContext(
  sb: any,
  orgId: string | null,
): Promise<void> {
  if (!orgId) return;
  try {
    await sb.rpc("set_tenant_context", { p_org_id: orgId });
  } catch {
    // Non-critical — RLS still works via auth.uid(). Session variable
    // provides defense-in-depth; a failure here never blocks the user.
  }
}
