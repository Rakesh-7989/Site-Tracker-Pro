// SiteTrack Pro — Approval delegation.
//
// Real story:
//   Architect Ramesh is on a site visit in Vizag. RA bills + change orders +
//   drawing releases need approval today. PM Suresh in the office has standing
//   delegation for 3 days. The system auto-routes approvals to Suresh during
//   that window and keeps an audit trail showing original-approver vs
//   actual-approver.
//
// Delegation row shape:
//   { id, from_user_id, from_user_name, to_user_id, to_user_name,
//     scope, start, end, reason, active, created_at }
//
// scope:
//   "all"           — every approval the source role would normally handle
//   "ra_bills"      — RA bills only
//   "drawings"      — drawing releases only
//   "change_orders" — change orders only
//   "expenses"      — expense approvals only

/** Return active delegations for a user at a given moment (default: now). */
export function activeDelegationsFor(delegations, userId, now = new Date()) {
  if (!Array.isArray(delegations)) return [];
  const iso = now.toISOString();
  return delegations.filter(
    d =>
      d.active !== false &&
      d.from_user_id === userId &&
      d.start <= iso &&
      d.end >= iso,
  );
}

/**
 * Given an approval target (the user whose role normally approves), find the
 * effective approver — if they've delegated to someone for this scope, return
 * the delegate. Otherwise return the original target.
 */
export function resolveApprover(delegations, targetUser, scope, now = new Date()) {
  if (!targetUser) return null;
  const active = activeDelegationsFor(delegations, targetUser.id, now);
  const match = active.find(d => d.scope === "all" || d.scope === scope);
  if (!match) return { ...targetUser, delegated: false };
  return {
    id: match.to_user_id,
    name: match.to_user_name,
    delegated: true,
    delegation_id: match.id,
    original_user_id: targetUser.id,
    original_user_name: targetUser.name,
  };
}

/** Append a new delegation row. */
export function addDelegation(delegations, entry) {
  if (!Array.isArray(delegations)) delegations = [];
  const row = {
    id: "d_" + Date.now(),
    active: true,
    created_at: new Date().toISOString(),
    scope: entry.scope || "all",
    ...entry,
  };
  return [...delegations, row];
}

/** Revoke (soft-deactivate, don't delete — audit trail). */
export function revokeDelegation(delegations, id) {
  return delegations.map(d => (d.id === id ? { ...d, active: false, revoked_at: new Date().toISOString() } : d));
}

/** Human-friendly status for the delegation list view. */
export function delegationStatus(d, now = new Date()) {
  if (!d) return "unknown";
  if (d.active === false) return "revoked";
  const iso = now.toISOString();
  if (iso < d.start) return "scheduled";
  if (iso > d.end) return "expired";
  return "active";
}
