// SiteTrack Pro — self-service org registration (/register).
// Firm owner creates org directly with no superadmin approval.

import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Button, Icon, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import { CONSENT_VERSION } from "@/features/marketing/legalContent";
import { PLAN_TIERS, priceFor, gstInclusive, formatINR, type BillingPeriod } from "@/features/marketing/plans";
import { registerOrg, type RegisterPlan } from "@/app/orgRegisterQueries";

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function Logo(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-accent text-white grid place-items-center font-display font-bold">S</div>
      <span className="font-display text-lg font-bold text-fg-primary">SiteTrack Pro</span>
    </Link>
  );
}

export function OrgRegisterView(): JSX.Element {
  const t = useT();
  const { session, status } = useAuth();
  const [params] = useSearchParams();
  const initialPlan = (PLAN_TIERS.find(p => p.id === params.get("plan"))?.id ?? "basic");
  const initialBilling: BillingPeriod = params.get("billing") === "annual" ? "annual" : "monthly";

  const [plan, setPlan] = useState<RegisterPlan>(initialPlan as RegisterPlan);
  const billing = initialBilling;
  const [firmName, setFirmName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (status === "ready" && session) return <Navigate to="/dashboard" replace />;

  const submit = async () => {
    setError(null);
    if (!firmName.trim()) return setError("Firm name is required");
    if (!contactName.trim()) return setError("Your name is required");
    if (!validEmail(email)) return setError("Valid work email required");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");
    if (!consent) return setError("Please agree to the Terms & Privacy Policy");
    setBusy(true);
    const res = await registerOrg({
      email: email.trim().toLowerCase(),
      password,
      firmName: firmName.trim(),
      contactName: contactName.trim(),
      phone: phone.trim() || undefined,
      plan,
      consentVersion: CONSENT_VERSION,
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  };

  if (done) {
    const planTier = PLAN_TIERS.find(p => p.id === plan);
    return (
      <div className="min-h-screen bg-panel grid place-items-center px-5">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-success-tint text-success grid place-items-center mx-auto mb-3"><Icon name="check" size={28} /></div>
          <h1 className="font-display text-xl font-bold">Your workspace is ready</h1>
          <p className="text-sm text-fg-secondary mt-2">
            <b>{firmName}</b> has been created on the <b>{planTier?.name ?? plan}</b> plan.
            You are registered as <b>Firm Owner</b>.
          </p>
          <p className="text-sm text-fg-secondary mt-1">
            Sign in with your email <b>{email}</b> and the password you chose.
          </p>
          <Link to="/login" className="inline-block mt-5 px-6 py-2.5 bg-accent text-white font-bold rounded-xl text-sm hover:bg-accent-2">
            Sign in to SiteTrack Pro
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-panel text-fg-primary">
      <header className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="text-sm font-semibold text-fg-secondary hover:text-fg-primary">Sign in</Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 pb-16">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold">Create your workspace</h1>
          <p className="text-sm text-fg-secondary mt-1">No approval needed — start using SiteTrack Pro right away</p>
        </div>

        {/* Plan selector */}
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          {PLAN_TIERS.map(p => {
            const active = plan === p.id;
            const pr = priceFor(p, billing);
            return (
              <button key={p.id} type="button" onClick={() => setPlan(p.id as RegisterPlan)}
                className={`text-left p-4 rounded-xl border-2 transition relative ${active ? "border-accent bg-panel shadow-sm" : "border-default bg-panel hover:border-default"}`}>
                {p.popular && <div className="absolute -top-2 right-3"><Badge tone="warning">Popular</Badge></div>}
                <div className="flex items-center justify-between">
                  <div className="font-display font-bold">{p.name}</div>
                  {active && <Icon name="check" size={16} className="text-accent" />}
                </div>
                <div className="text-xl font-bold mt-1">{pr.amount}<span className="text-xs font-normal text-fg-tertiary">{pr.cadence}</span></div>
                {billing === "annual" && <div className="text-[10px] text-success font-semibold mt-0.5">{pr.effectiveMonthly} &middot; Save {pr.savingsAmount}</div>}
                <div className="text-[10px] text-fg-tertiary mt-0.5">{t("signup.gstLine", { amount: formatINR(gstInclusive(billing === "annual" ? p.annual : p.monthly)) })}</div>
                <div className="text-[11px] text-fg-secondary mt-0.5">{p.tagline}</div>
              </button>
            );
          })}
        </div>

        {/* Form */}
        <Card className="max-w-xl mx-auto p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Firm name</span>
              <Input className="mt-1" value={firmName} onChange={e => setFirmName(e.target.value)} placeholder="e.g. ABC Constructions" /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Your name</span>
              <Input className="mt-1" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="e.g. Rakesh" /></label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Work email</span>
              <Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@firm.com" /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Phone <span className="text-fg-tertiary normal-case">(optional)</span></span>
              <Input className="mt-1" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" /></label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Password</span>
              <Input className="mt-1" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Confirm password</span>
              <Input className="mt-1" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" /></label>
          </div>

          <label className="flex items-start gap-2 text-[12px] text-fg-secondary cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-[var(--st-accent)]" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>I agree to the <Link to="/terms" target="_blank" className="text-accent font-semibold hover:underline">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="text-accent font-semibold hover:underline">Privacy Policy</Link>.</span>
          </label>

          <Button className="w-full" onClick={() => void submit()} disabled={busy || !consent}>
            {busy ? <Spinner size={16} /> : <>Create workspace</>}
          </Button>
          <p className="text-[11px] text-fg-tertiary text-center">Already have an account? <Link to="/login" className="text-accent font-semibold">Sign in</Link></p>
        </Card>
      </div>
    </div>
  );
}
