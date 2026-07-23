export interface DelegationRow {
  id: string;
  from_user_id: string;
  from_user_name: string;
  to_user_id: string;
  to_user_name: string;
  scope: string;
  start: string;
  end: string;
  reason?: string;
  active?: boolean;
  created_at: string;
  revoked_at?: string;
  [key: string]: unknown;
}

export interface UserRef {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ResolvedApprover {
  id: string;
  name: string;
  delegated: boolean;
  delegation_id?: string;
  original_user_id?: string;
  original_user_name?: string;
}

export function activeDelegationsFor(
  delegations: DelegationRow[],
  userId: string,
  now: Date = new Date(),
): DelegationRow[] {
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

export function resolveApprover(
  delegations: DelegationRow[],
  targetUser: UserRef | null,
  scope: string,
  now: Date = new Date(),
): ResolvedApprover | null {
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

export function addDelegation(
  delegations: DelegationRow[],
  entry: Partial<DelegationRow>,
): DelegationRow[] {
  if (!Array.isArray(delegations)) delegations = [];
  const row: DelegationRow = {
    id: "d_" + Date.now(),
    active: true,
    created_at: new Date().toISOString(),
    scope: entry.scope || "all",
    ...entry,
    from_user_id: entry.from_user_id!,
    from_user_name: entry.from_user_name!,
    to_user_id: entry.to_user_id!,
    to_user_name: entry.to_user_name!,
    start: entry.start!,
    end: entry.end!,
  };
  return [...delegations, row];
}

export function revokeDelegation(delegations: DelegationRow[], id: string): DelegationRow[] {
  return delegations.map(d => (d.id === id ? { ...d, active: false, revoked_at: new Date().toISOString() } : d));
}

export function delegationStatus(d: { active?: boolean; start?: string; end?: string } | null | undefined, now: Date = new Date()): string {
  if (!d) return "unknown";
  if (d.active === false) return "revoked";
  const iso = now.toISOString();
  if (d.start && iso < d.start) return "scheduled";
  if (d.end && iso > d.end) return "expired";
  return "active";
}
