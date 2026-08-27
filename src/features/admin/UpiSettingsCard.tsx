// SiteTrack Pro — Platform payment UPI settings card (used in Platform
// Settings + Staff admin). Configures the platform-level UPI ID + payee name
// that customers pay to (QR on payment pages). RPC set_platform_setting.

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { getPaymentSettings, setPlatformSetting } from "@/app/queries/paymentQueries";
import { isValidVpa } from "@/lib/integrations/upi";

import { getClient } from "@/lib/supabase/supabase";

// ── Pure helper (exported for the phase unit tests) ──────────────────────────

/** Validate a UPI ID: empty is allowed (clears the setting), otherwise must be a valid VPA. */
export function paymentSettingsValid(upi: string): string | null {
  if (upi.trim() && !isValidVpa(upi)) return "Enter a valid UPI ID, e.g. name@okhdfcbank.";
  return null;
}

export function UpiSettingsCard(): JSX.Element {
  const [upi, setUpi] = useState("");
  const [payee, setPayee] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void (async () => { const c = await getClient(); if (!c) return; const r = await getPaymentSettings(c); if (r.ok) { setUpi(r.data.upiId ?? ""); setPayee(r.data.payeeName ?? ""); } })(); }, []);
  const save = async () => {
    setErr(null);
    const vpaErr = paymentSettingsValid(upi);
    if (vpaErr) return setErr(vpaErr);
    setBusy(true);
    const c = await getClient();
    const a = await setPlatformSetting(c, "upi_id", upi);
    const b = await setPlatformSetting(c, "payee_name", payee);
    setBusy(false);
    if (a.ok && b.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); } else setErr((a.ok ? b : a).ok ? "" : "Save failed.");
  };
  return (
    <Card padding="lg" title={<div>
      <div className="font-semibold text-fg-primary">Payment UPI</div>
      <div className="text-[13px] text-fg-secondary mt-0.5">The UPI ID customers pay to (used for the QR on payment pages). Zero gateway fees.</div>
    </div>}>
      {err && <div className="mb-2 text-[12px] text-error">{err}</div>}
      {saved && <div className="mb-2 text-[12px] text-success">Saved.</div>}
      <div className="grid sm:grid-cols-2 gap-2">
        <Input value={upi} onChange={e => setUpi(e.target.value)} placeholder="yourname@okhdfcbank" />
        <Input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Payee name (e.g. Rakesh Boyapati)" />
      </div>
      <Button className="mt-3" loading={busy} onClick={save}>{busy ? "Saving..." : "Save UPI"}</Button>
    </Card>
  );
}