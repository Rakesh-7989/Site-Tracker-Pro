// SiteTrack Pro — platform staff hierarchy queries (migration 99/100).
// Owner+Head only (enforced server-side by the RPCs + staff_invites RLS).

export type SResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type StaffTier = "owner" | "head" | "member";

export interface StaffMember {
  id: string;
  email: string | null;
  name: string;
  tier: StaffTier;
  managerEmail: string | null;
  createdAt: string;
}

export interface StaffInvite {
  id: string;
  token: string;
  email: string | null;
  tier: StaffTier;
  usedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Build the shareable join link for an invite token. */
export function staffJoinUrl(token: string): string {
  const origin = typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "https://sitetrack-rakesh.vercel.app";
  return `${origin}/staff/join?token=${encodeURIComponent(token)}`;
}

/** Owner+Head: mint a single-use staff invite. RPC create_staff_invite (mig 99). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createStaffInvite(client: any, opts: { email?: string; tier?: StaffTier } = {}): Promise<SResult<StaffInvite>> {
  try {
    const { data, error } = await client.rpc("create_staff_invite", {
      p_email: opts.email?.trim() || null,
      p_tier: opts.tier ?? "member",
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!r) return { ok: false, error: "No invite returned." };
    return { ok: true, data: rowToInvite(r) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Owner+Head: the staff roster with emails. RPC list_platform_staff (mig 100). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listStaff(client: any): Promise<SResult<StaffMember[]>> {
  try {
    const { data, error } = await client.rpc("list_platform_staff");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      email: r.email ? String(r.email) : null,
      name: String(r.name ?? ""),
      tier: (r.staff_tier as StaffTier) ?? "member",
      managerEmail: r.manager_email ? String(r.manager_email) : null,
      createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Owner+Head: list invites (RLS-gated). Newest first. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listStaffInvites(client: any): Promise<SResult<StaffInvite[]>> {
  try {
    const { data, error } = await client
      .from("staff_invites")
      .select("id, token, email, tier, used_at, revoked_at, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(rowToInvite) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Owner+Head: revoke a pending invite (RLS-gated write). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function revokeStaffInvite(client: any, id: string): Promise<SResult<true>> {
  try {
    const { error } = await client.from("staff_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Live status of an invite for display. */
export function inviteStatus(inv: StaffInvite): "used" | "revoked" | "expired" | "active" {
  if (inv.usedAt) return "used";
  if (inv.revokedAt) return "revoked";
  if (new Date(inv.expiresAt).getTime() < Date.now()) return "expired";
  return "active";
}

function rowToInvite(r: Record<string, unknown>): StaffInvite {
  return {
    id: String(r.id),
    token: String(r.token ?? ""),
    email: r.email ? String(r.email) : null,
    tier: (r.tier as StaffTier) ?? "member",
    usedAt: r.used_at ? String(r.used_at) : null,
    revokedAt: r.revoked_at ? String(r.revoked_at) : null,
    expiresAt: String(r.expires_at ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}
