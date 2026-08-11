// SiteTrack Pro — platform Staff admin (/admin/staff). Owner + Head only.
import { getClient } from "@/lib/supabase";
//
// Generate single-use staff invite links, see the staff hierarchy (Owner → Head
// → Members), and revoke pending invites. The "block-by-default" signup control:
// a member can only join through a fresh single-use invite minted here.

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/auth";
import { Card, Button, Icon, Badge, Spinner } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import {
  createStaffInvite, sendStaffInvite, listStaff, listStaffInvites, revokeStaffInvite,
  staffJoinUrl, inviteStatus, listAllStaffAreas, setStaffAreas, STAFF_AREAS, STAFF_AREA_LABEL,
  type StaffMember, type StaffInvite,
} from "@/app/staffQueries";
import { getPaymentSettings, setPlatformSetting } from "@/app/paymentQueries";
import { isValidVpa } from "@/lib/upi";

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// `initial` = the member's currently-granted areas (batch-loaded once by the
// parent via list_all_staff_areas — no per-row query). Empty = full access.
function MemberAreas({ staffId, initial }: { staffId: string; initial: string[] }): JSX.Element {
  const full = [...STAFF_AREAS] as string[];
  const [committed, setCommitted] = useState<string[]>(initial.length ? initial : full);
  const [draft, setDraft] = useState<string[]>(committed);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const openEditor = () => { setDraft(committed); setOpen(true); };
  const toggle = (a: string) => setDraft(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  const save = async () => {
    setBusy(true);
    const c = await getClient();
    if (c) { const r = await setStaffAreas(c, staffId, draft); if (r.ok) setCommitted(draft.length ? draft : full); }
    setBusy(false); setOpen(false);
  };
  const isAll = committed.length >= STAFF_AREAS.length;
  if (!open) {
    return (
      <button type="button" onClick={openEditor} className="mt-1 text-[11px] font-semibold text-accent hover:text-accent-2">
        Access: {isAll ? "all areas" : committed.map(a => STAFF_AREA_LABEL[a]).join(", ")} â–¾
      </button>
    );
  }
  return (
    <div className="mt-2 p-2.5 rounded-lg bg-bg-secondary border border-default w-full">
      <div className="text-[11px] text-fg-secondary mb-1.5">Admin areas this member can access (none ticked = full access):</div>
      <div className="flex flex-wrap gap-2">
        {STAFF_AREAS.map(a => (
          <label key={a} className="inline-flex items-center gap-1 text-[12px] text-fg-primary cursor-pointer">
            <input type="checkbox" className="accent-[var(--st-accent)]" checked={draft.includes(a)} onChange={() => toggle(a)} /> {STAFF_AREA_LABEL[a]}
          </label>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <Button size="sm" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save access"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function UpiSettingsCard(): JSX.Element {
  const [upi, setUpi] = useState("");
  const [payee, setPayee] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void (async () => { const c = await getClient(); if (!c) return; const r = await getPaymentSettings(c); if (r.ok) { setUpi(r.data.upiId ?? ""); setPayee(r.data.payeeName ?? ""); } })(); }, []);
  const save = async () => {
    setErr(null);
    if (upi && !isValidVpa(upi)) return setErr("Enter a valid UPI ID, e.g. name@okhdfcbank.");
    setBusy(true);
    const c = await getClient();
    const a = await setPlatformSetting(c, "upi_id", upi);
    const b = await setPlatformSetting(c, "payee_name", payee);
    setBusy(false);
    if (a.ok && b.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); } else setErr((a.ok ? b : a).ok ? "" : "Save failed.");
  };
  return (
    <Card className="p-5">
      <div className="font-semibold text-fg-primary">Payment UPI</div>
      <div className="text-[13px] text-fg-secondary mt-0.5 mb-3">The UPI ID customers pay to (used for the QR on payment pages). Zero gateway fees.</div>
      {err && <div className="mb-2 text-[12px] text-error">{err}</div>}
      {saved && <div className="mb-2 text-[12px] text-success">✅ Saved.</div>}
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={upi} onChange={e => setUpi(e.target.value)} placeholder="yourname@okhdfcbank" className="px-3 py-2.5 border border-default rounded-lg text-sm bg-bg-primary" />
        <input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Payee name (e.g. Rakesh Boyapati)" className="px-3 py-2.5 border border-default rounded-lg text-sm bg-bg-primary" />
      </div>
      <Button className="mt-3" loading={busy} onClick={save}>{busy ? "Saving..." : "Save UPI"}</Button>
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const TIER_BADGE: Record<string, { label: string; tone: "warning" | "info" | "neutral" }> = {
  owner: { label: "🔑 Owner", tone: "warning" },
  head: { label: "🎖ï¸ Head", tone: "info" },
  member: { label: "Member", tone: "neutral" },
};

export function StaffAdminView(): JSX.Element {
  const { session } = useAuth();
  const tier = session?.user.staffTier ?? null;
  const canManage = session?.user.identityRole === "superadmin" || tier === "owner" || tier === "head";

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [areaMap, setAreaMap] = useState<Map<string, string[]>>(new Map());
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
    const [s, i, a] = await Promise.all([listStaff(client), listStaffInvites(client), listAllStaffAreas(client)]);
    if (s.ok) setStaff(s.data); else setError(s.error);
    if (i.ok) setInvites(i.data);
    if (a.ok) setAreaMap(a.data);
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
          <div className="w-12 h-12 rounded-2xl bg-bg-secondary text-fg-tertiary grid place-items-center mx-auto mb-3"><Icon name="shield" size={24} /></div>
          <h1 className="font-display text-lg font-bold">Staff management</h1>
          <p className="text-sm text-fg-secondary mt-2">Only the platform Owner or Staff Head can manage staff and invites.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Staff</h1>
        <p className="text-sm text-fg-secondary mt-1">Invite and manage platform staff. New staff can join <b>only</b> through a single-use invite link.</p>
      </div>

      {error && (
        <div className="rounded-lg bg-error-tint border border-error p-3 text-[13px] text-error flex items-start gap-2">
          <Icon name="alert" size={15} className="text-error mt-0.5" /> {error}
        </div>
      )}

      <UpiSettingsCard />

      {/* Generate invite */}
      <Card className="p-5">
        <div className="font-semibold text-fg-primary">Invite a staff member</div>
        <div className="text-[13px] text-fg-secondary mt-0.5 mb-3">One-time link. After someone joins with it, it's spent automatically.</div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex-1 min-w-[200px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">Invitee email (optional)</span>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="person@email.com"
              className="w-full mt-1 px-3 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-bg-primary" />
          </label>
          {tier === "owner" && (
            <Select fit className="w-40" value={inviteTier} onChange={e => setInviteTier(e.target.value as "member" | "head")}
              options={[{ value: "member", label: "As Member" }, { value: "head", label: "As Head" }]} />
          )}
          <Button onClick={onEmailInvite} loading={busy} disabled={!inviteEmail} leftIcon={<Icon name="mail" size={15} />}>
            Email invite
          </Button>
          <Button variant="secondary" onClick={onGenerate} disabled={busy}>Just get a link</Button>
        </div>
        {emailNote && <div className="mt-3 text-[12px] text-success">{emailNote}</div>}

        {justCreated && (
          <div className="mt-4 rounded-lg bg-success-tint border border-success p-3">
            <div className="text-[12px] font-semibold text-success mb-1.5">✅ Invite link ready — share it with the new staff member (expires in 7 days):</div>
            <div className="flex items-center gap-2">
              <input readOnly value={staffJoinUrl(justCreated.token)}
                className="flex-1 text-[12px] font-mono px-3 py-2 border border-success rounded-lg bg-bg-primary text-fg-primary truncate" />
              <Button variant="secondary" size="md" onClick={() => copyLink(justCreated.token)}>{copied ? "Copied!" : "Copy"}</Button>
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="grid place-items-center py-12 text-accent"><Spinner size={24} /></div>
      ) : (
        <>
          {/* Staff hierarchy */}
          <Card className="p-5">
            <div className="font-semibold text-fg-primary mb-3">Staff team ({staff.length})</div>
            <div className="space-y-2">
              {staff.map(m => (
                <div key={m.id} className="py-2 border-b border-default last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-fg-primary truncate">{m.name || m.email}</div>
                      <div className="text-[12px] text-fg-secondary truncate">{m.email}{m.managerEmail ? ` · reports to ${m.managerEmail}` : ""} · {m.managedOrgs} org{m.managedOrgs === 1 ? "" : "s"}</div>
                    </div>
                    <Badge tone={TIER_BADGE[m.tier]?.tone ?? "neutral"}>{TIER_BADGE[m.tier]?.label ?? m.tier}</Badge>
                  </div>
                  {m.tier === "member" && <MemberAreas staffId={m.id} initial={areaMap.get(m.id) ?? []} />}
                </div>
              ))}
              {staff.length === 0 && <div className="text-sm text-fg-tertiary py-2">No staff yet.</div>}
            </div>
          </Card>

          {/* Invites */}
          <Card className="p-5">
            <div className="font-semibold text-fg-primary mb-3">Invites</div>
            <div className="space-y-2">
              {invites.map(inv => {
                const st = inviteStatus(inv);
                const tone = st === "active" ? "info" : st === "used" ? "success" : "neutral";
                return (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-default last:border-0 gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] text-fg-primary truncate">{inv.email || "(open link)"} · <span className="uppercase text-[11px] text-fg-tertiary">{inv.tier}</span></div>
                      <div className="text-[11px] text-fg-tertiary">created {inv.createdAt.slice(0, 10)} · expires {inv.expiresAt.slice(0, 10)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={tone as "info" | "success" | "neutral"}>{st}</Badge>
                      {st === "active" && <Button variant="secondary" size="sm" onClick={() => copyLink(inv.token)}>Copy</Button>}
                      {st === "active" && <Button variant="ghost" size="sm" onClick={() => onRevoke(inv.id)}>Revoke</Button>}
                    </div>
                  </div>
                );
              })}
              {invites.length === 0 && <div className="text-sm text-fg-tertiary py-2">No invites yet.</div>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
