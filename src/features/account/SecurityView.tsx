// SiteTrack Pro â€” Account â†’ Security (/settings/security).
import { getClient } from "@/lib/supabase";
//
// Self-service two-factor auth (TOTP). Any signed-in user can enable 2FA with
// an authenticator app; admins are nudged to. Uses the free Supabase MFA API
// via the testable @/auth/mfa helpers.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth";
import { Card, Icon, Badge, Spinner, Alert, Button } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { listMfaFactors, enrollMfa, verifyMfa, unenrollMfa, type MfaFactor } from "@/auth/mfa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

const ADMIN_ROLES = new Set(["superadmin", "orgadmin", "promoter", "project_admin"]);

type Enroll = { factorId: string; qrCode: string; secret: string } | null;

export function SecurityView(): JSX.Element {
  const { session } = useAuth();
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState<Enroll>(null);
  const [code, setCode] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listMfaFactors(client);
    if (res.ok) setFactors(res.factors); else setError(res.error);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  if (!session) return <></>;
  const verified = factors.filter(f => f.status === "verified");
  const isOn = verified.length > 0;
  const isAdmin = ADMIN_ROLES.has(session.user.identityRole) || session.user.isStaff;

  const startEnroll = async () => {
    setBusy(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const res = await enrollMfa(client, "Authenticator");
    setBusy(false);
    if (res.ok) setEnroll({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret });
    else setError(res.error);
  };

  const confirmEnroll = async () => {
    if (!enroll) return;
    setBusy(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const res = await verifyMfa(client, enroll.factorId, code);
    setBusy(false);
    if (res.ok) { setEnroll(null); setCode(""); await reload(); }
    else setError(res.error);
  };

  const removeFactor = async (factorId: string) => {
    if (!window.confirm("Turn off two-factor authentication for this account?")) return;
    setBusy(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const res = await unenrollMfa(client, factorId);
    setBusy(false);
    if (res.ok) await reload(); else setError(res.error);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Security</h1>
        <div className="text-sm text-ink-500">{session.user.email}</div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {isAdmin && !isOn && (
        <Alert variant="warning">You have an admin role â€” turning on two-factor authentication is strongly recommended.</Alert>
      )}

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-safety-50 text-safety-600 grid place-items-center"><Icon name="lock" size={18} /></div>
              <div>
                <div className="font-semibold text-ink-900">Two-factor authentication</div>
                <div className="text-xs text-ink-500">An extra 6-digit code from your phone at sign-in.</div>
              </div>
            </div>
          </div>
          {isOn ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
        </div>

        {loading ? (
          <div className="grid place-items-center py-8"><Spinner size={22} /></div>
        ) : isOn ? (
          <div className="mt-4 space-y-2">
            {verified.map(f => (
              <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-cream-200">
                <div className="text-sm text-ink-700 flex items-center gap-2"><Icon name="check" size={15} className="text-emerald-500" /> {f.friendlyName || "Authenticator app"}</div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeFactor(f.id)} className="!text-rose-600 hover:!bg-rose-50">Remove</Button>
              </div>
            ))}
          </div>
        ) : enroll ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-ink-700">1. Scan this QR code in Google Authenticator / Authy / 1Password:</div>
            {enroll.qrCode
              ? <img src={enroll.qrCode} alt="2FA QR code" className="w-44 h-44 border border-cream-200 rounded-lg bg-white p-2" />
              : <div className="text-xs text-ink-400">QR unavailable â€” use the key below.</div>}
            <div className="text-xs text-ink-500">Or enter this key manually: <code className="font-mono bg-cream-100 px-1.5 py-0.5 rounded text-ink-800 break-all">{enroll.secret}</code></div>
            <div className="text-sm text-ink-700">2. Enter the 6-digit code it shows:</div>
            <Input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" maxLength={7} placeholder="123456" autoComplete="one-time-code" className="max-w-[180px] tracking-[0.3em] text-center font-mono" />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void confirmEnroll()}>{busy ? <Spinner size={14} /> : "Verify & enable"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEnroll(null); setCode(""); setError(null); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button size="sm" disabled={busy} onClick={() => void startEnroll()}>{busy ? <Spinner size={14} /> : "Enable 2FA"}</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
