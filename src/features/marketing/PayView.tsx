// SiteTrack Pro — public UPI payment page (route "/pay/:requestId"). Shows a
// UPI QR for the plan amount; the payer scans + pays to the platform UPI id, then
// submits their transaction ref. A staff verifies + marks it received (Phase C).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";
import { UpiQr } from "@/components/UpiQr";
import { buildUpiUri } from "@/lib/integrations/upi";
import { getPaymentSettings, getSignupForPay, submitPaymentClaim, resolveSignupAmount } from "@/app/queries/paymentQueries";
import { PLAN_TIERS, formatINR } from "./plans";

 

import { getClient } from "@/lib/supabase/supabase";
export function PayView(): JSX.Element {
  const { requestId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [firm, setFirm] = useState("");
  const [plan, setPlan] = useState("");
  const [paid, setPaid] = useState(false);
  const [upiId, setUpiId] = useState<string | null>(null);
  const [payee, setPayee] = useState<string | null>(null);
  const [amountInr, setAmountInr] = useState<number | null>(null);
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const client = await getClient();
      if (!client || !requestId) { setError("This payment link is invalid."); setLoading(false); return; }
      const [reqRes, setRes] = await Promise.all([getSignupForPay(client, requestId), getPaymentSettings(client)]);
      if (reqRes.ok) {
        setFirm(reqRes.data.firmName); setPlan(reqRes.data.plan); setPaid(reqRes.data.paymentStatus === "paid");
        setAmountInr(resolveSignupAmount(reqRes.data, PLAN_TIERS));
      } else setError(reqRes.error);
      if (setRes.ok) { setUpiId(setRes.data.upiId); setPayee(setRes.data.payeeName); }
      setLoading(false);
    })();
  }, [requestId]);

  const submit = async () => {
    if (!utr.trim()) return setError("Enter your UPI transaction / reference number.");
    setBusy(true); setError(null);
    const client = await getClient();
    const res = await submitPaymentClaim(client, requestId, utr.trim());
    setBusy(false);
    if (res.ok) setDone(true); else setError(res.error);
  };

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-panel grid place-items-center px-5 py-10">
      <Card className="w-full max-w-md p-6">
        <Link to="/" className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-lg bg-accent text-white grid place-items-center font-bold">S</div>
          <span className="font-display font-bold text-fg-primary">SiteTrack Pro</span>
        </Link>
        {children}
      </Card>
    </div>
  );

  if (loading) return <Frame><div className="py-10 grid place-items-center"><Spinner size={24} /></div></Frame>;
  if (paid) return <Frame><div className="text-center py-6"><div className="w-14 h-14 rounded-2xl bg-success-tint text-success grid place-items-center mx-auto mb-3"><Icon name="check" size={28} /></div><h1 className="font-display text-lg font-bold">Already paid 🎉</h1><p className="text-sm text-fg-secondary mt-2">This plan is paid. Your workspace is being set up — check your email.</p></div></Frame>;
  if (!upiId) return <Frame><div className="rounded-lg bg-warning-tint border border-warning p-3 text-[13px] text-warning">UPI payment isn't set up yet. Please contact us to complete your payment.</div></Frame>;
  if (amountInr == null) return <Frame><div className="rounded-lg bg-warning-tint border border-warning p-3 text-[13px] text-warning">We couldn't find a price for this plan. Please contact us to arrange payment for your workspace.</div></Frame>;
  if (done) return <Frame><div className="text-center py-6"><div className="w-14 h-14 rounded-2xl bg-success-tint text-success grid place-items-center mx-auto mb-3"><Icon name="check" size={28} /></div><h1 className="font-display text-lg font-bold">Thank you! 🙏</h1><p className="text-sm text-fg-secondary mt-2">We've recorded your payment reference. Our team will verify it and activate your workspace within 24 hours.</p></div></Frame>;

  const uri = buildUpiUri({ vpa: upiId, name: payee || "SiteTrack Pro", amount: amountInr, note: `SiteTrack ${plan} — ${firm}`.slice(0, 60) });

  return (
    <Frame>
      <h1 className="font-display text-xl font-bold">Pay for your plan</h1>
      <p className="text-[13px] text-fg-secondary mt-1">{firm} · <span className="capitalize">{plan}</span> plan (annual)</p>
      {error && <div className="mt-3 rounded-lg bg-error-tint border border-error p-3 text-[12px] text-error">{error}</div>}

      <div className="mt-4 grid place-items-center">
        <UpiQr uri={uri} size={220} />
        <div className="text-2xl font-bold mt-3">{formatINR(amountInr)}</div>
        <div className="text-[12px] text-fg-secondary">to {upiId}{payee ? ` (${payee})` : ""} · incl. 18% GST</div>
        <a href={uri} className="mt-3 text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-5 py-2.5 rounded-lg">Open UPI app to pay</a>
        <div className="text-[11px] text-fg-tertiary mt-1">Scan with any UPI app (GPay, PhonePe, Paytm...) or tap above on mobile.</div>
      </div>

      <div className="mt-5 border-t border-default pt-4">
        <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">After paying, enter your UPI transaction ID (UTR)</span>
          <input value={utr} onChange={e => setUtr(e.target.value)} placeholder="12-digit UTR / reference no." className="w-full mt-1 px-3 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel" />
        </label>
        <Button fullWidth className="mt-3" loading={busy} onClick={submit}>{busy ? "Submitting..." : "I've paid — submit reference"}</Button>
        <p className="text-[11px] text-fg-tertiary text-center mt-2">We verify every payment manually before activating your workspace.</p>
      </div>
    </Frame>
  );
}
