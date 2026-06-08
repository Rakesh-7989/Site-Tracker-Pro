// SiteTrack Pro — platform Staff admin (/admin/staff). Owner + Head only.
//
// Generate single-use staff invite links, see the staff hierarchy (Owner → Head
// → Members), and revoke pending invites. The "block-by-default" signup control:
// a member can only join through a fresh single-use invite minted here.

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/auth";
import { Card, Button, Icon, Badge, Spinner } from "@/components/ui/atoms";
import {
  createStaffInvite, sendStaffInvite, listStaff, listStaffInvites, revokeStaffInvite,
  staffJoinUrl, inviteStatus, type StaffMember, type StaffInvite,
} from "@/app/staffQueries";

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any> {
  const mod = await import("../../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

const TIER_BADGE: Record<string, { label: string; tone: "warning" | "info" | "neutral" }> = {
  owner: { label: "👑 Owner", tone: "warning" },
  head: { label: "🎖️ Head", tone: "info" },
  member: { label: "Member", tone: "neutral" },
};

export function StaffAdminView(): JSX.Element {
  const { session } = useAuth();
  const tier = session?.user.staffTier ?? null;
  const canManage = tier === "owner" || tier === "head";

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<StaffInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteTier, setInviteTier] = useState<"member" | "head">("member");
  const [inviteEmail, setInviteEmail] = useState("");
  const [emailNote, setEmailNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend unavailable."); setLoading(false); return; }
    const [s, i] = await Promise.all([listStaff(client), listStaffInvites(client)]);
    if (s.ok) setStaff(s.data); else setError(s.error);
    if (i.ok) setInvites(i.data);
    setLoading(false);
  }, []);

  useEffect(() => { if (canManage) void load(); else setLoading(false); }, [canManage, load]);

  const onGenerate = async () => {
    setBusy(true); setError(null); setCopied(false); setEmailNote(null);
    const client = await getClient();
    const res = await createStaffInvite(client, { tier: inviteTier });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setJustCreated(res.data);
    setInvites(prev => [res.data, ...prev]);
  };

  const onEmailInvite = async () => {
    if (!validEmail(inviteEmail)) return setError("Enter a valid email to send the invite to.");
    setBusy(true); setError(null); setEmailNote(null); setCopied(false);
    const client = await getClient();
    const res = await sendStaffInvite(client, { email: inviteEmail.trim().toLowerCase(), tier: inviteTier });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEmailNote(res.data.emailSent
      ? `✅ Invite emailed to ${inviteEmail}.`
      : `Invite created, but the email didn't send — copy the link below and share it manually.`);
    setJustCreated({ id: "", token: res.data.token, email: inviteEmail, tier: inviteTier, usedAt: null, revokedAt: null, expiresAt: "", createdAt: "" });
    setInviteEmail("");
    void load();
  };

  const onRevoke = async (id: string) => {
    const client = await getClient();
    const res = await revokeStaffInvite(client, id);
    if (res.ok) void load(); else setError(res.error);
  };

  const copyLink = async (token: string) => {
    try { await navigator.clipboard.writeText(staffJoinUrl(token)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  if (!canManage) {
    return (
      <div className="max-w-xl mx-auto mt-10">
        <Card className="p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-cream-100 text-ink-400 grid place-items-center mx-auto mb-3"><Icon name="shield" size={24} /></div>
          <h1 className="font-display text-lg font-bold">Staff management</h1>
          <p className="text-sm text-ink-500 mt-2">Only the platform Owner or Staff Head can manage staff and invites.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Staff</h1>
        <p className="text-sm text-ink-500 mt-1">Invite and manage platform staff. New staff can join <b>only</b> through a single-use invite link.</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-[13px] text-red-700 flex items-start gap-2">
          <Icon name="alert" size={15} className="text-red-600 mt-0.5" /> {error}
        </div>
      )}

      {/* Generate invite */}
      <Card className="p-5">
        <div className="font-semibold text-ink-800">Invite a staff member</div>
        <div className="text-[13px] text-ink-500 mt-0.5 mb-3">One-time link. After someone joins with it, it's spent automatically.</div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex-1 min-w-[200px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Invitee email (optional)</span>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="person@email.com"
              className="w-full mt-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white" />
          </label>
          {tier === "owner" && (
            <select value={inviteTier} onChange={e => setInviteTier(e.target.value as "member" | "head")}
              className="text-sm border border-cream-200 rounded-lg px-2.5 py-2.5 bg-white">
              <option value="member">As Member</option>
              <option value="head">As Head</option>
            </select>
          )}
          <Button onClick={onEmailInvite} disabled={busy || !inviteEmail} leftIcon={busy ? <Spinner size={15} /> : <Icon name="mail" size={15} />}>
            Email invite
          </Button>
          <Button variant="secondary" onClick={onGenerate} disabled={busy}>Just get a link</Button>
        </div>
        {emailNote && <div className="mt-3 text-[12px] text-emerald-700">{emailNote}</div>}

        {justCreated && (
          <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <div className="text-[12px] font-semibold text-emerald-700 mb-1.5">✅ Invite link ready — share it with the new staff member (expires in 7 days):</div>
            <div className="flex items-center gap-2">
              <input readOnly value={staffJoinUrl(justCreated.token)}
                className="flex-1 text-[12px] font-mono px-3 py-2 border border-emerald-200 rounded-lg bg-white text-ink-700 truncate" />
              <Button variant="secondary" size="md" onClick={() => copyLink(justCreated.token)}>{copied ? "Copied!" : "Copy"}</Button>
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="grid place-items-center py-12 text-safety-500"><Spinner size={24} /></div>
      ) : (
        <>
          {/* Staff hierarchy */}
          <Card className="p-5">
            <div className="font-semibold text-ink-800 mb-3">Staff team ({staff.length})</div>
            <div className="space-y-2">
              {staff.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-cream-100 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-800 truncate">{m.name || m.email}</div>
                    <div className="text-[12px] text-ink-500 truncate">{m.email}{m.managerEmail ? ` · reports to ${m.managerEmail}` : ""} · {m.managedOrgs} org{m.managedOrgs === 1 ? "" : "s"}</div>
                  </div>
                  <Badge tone={TIER_BADGE[m.tier]?.tone ?? "neutral"}>{TIER_BADGE[m.tier]?.label ?? m.tier}</Badge>
                </div>
              ))}
              {staff.length === 0 && <div className="text-sm text-ink-400 py-2">No staff yet.</div>}
            </div>
          </Card>

          {/* Invites */}
          <Card className="p-5">
            <div className="font-semibold text-ink-800 mb-3">Invites</div>
            <div className="space-y-2">
              {invites.map(inv => {
                const st = inviteStatus(inv);
                const tone = st === "active" ? "info" : st === "used" ? "success" : "neutral";
                return (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-cream-100 last:border-0 gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] text-ink-700 truncate">{inv.email || "(open link)"} · <span className="uppercase text-[11px] text-ink-400">{inv.tier}</span></div>
                      <div className="text-[11px] text-ink-400">created {inv.createdAt.slice(0, 10)} · expires {inv.expiresAt.slice(0, 10)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={tone as "info" | "success" | "neutral"}>{st}</Badge>
                      {st === "active" && <Button variant="secondary" size="sm" onClick={() => copyLink(inv.token)}>Copy</Button>}
                      {st === "active" && <Button variant="ghost" size="sm" onClick={() => onRevoke(inv.id)}>Revoke</Button>}
                    </div>
                  </div>
                );
              })}
              {invites.length === 0 && <div className="text-sm text-ink-400 py-2">No invites yet.</div>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
