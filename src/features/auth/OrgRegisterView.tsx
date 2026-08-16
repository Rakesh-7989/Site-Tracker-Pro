// SiteTrack Pro — self-service org registration (/register).
// Zoho-style minimal identity screen: email + password only. The owner
// confirms their email (Supabase sends the link; this app shows a "check your
// inbox" verify step with resend), then onboarding collects firm/segment/plan.
// No superadmin approval needed. New orgs start on a 14-day Pro free trial.

import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Button, Icon, Spinner, Alert } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { CONSENT_VERSION } from "@/features/marketing/legalContent";
import { type BillingPeriod } from "@/features/marketing/plans";
import { registerOrg, resendConfirmation, type RegisterPlan } from "@/app/orgRegisterQueries";

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function Logo(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-accent text-white grid place-items-center font-display font-bold">S</div>
      <span className="font-display text-lg font-bold text-fg-primary">SiteTrack Pro</span>
    </Link>
  );
}

const TRIAL_DAYS = 14;

export function OrgRegisterView(): JSX.Element {
  const { session, status } = useAuth();
  const [params] = useSearchParams();

  // Optional deep-link defaults (e.g. ?plan=business&billing=annual from a
  // marketing page). When absent, the EF provisions the Pro trial. Not shown
  // as UI on the minimal identity screen.
  const deepPlan = params.get("plan");
  const deepPlanValid: RegisterPlan | undefined = deepPlan === "pro" || deepPlan === "business" || deepPlan === "basic"
    ? deepPlan
    : undefined;
  const deepBilling: BillingPeriod | undefined = params.get("billing") === "annual" ? "annual" : undefined;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (status === "ready" && session) return <Navigate to="/dashboard" replace />;

  const submit = async () => {
    setError(null);
    if (!validEmail(email)) return setError("Please enter a valid work email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    if (!consent) return setError("Please agree to the Terms & Privacy Policy.");
    setBusy(true);
    const res = await registerOrg({
      email: email.trim().toLowerCase(),
      password,
      firmName: email.split("@")[0], // provisional — finalized in onboarding
      contactName: email.split("@")[0],
      consentVersion: CONSENT_VERSION,
      website,
      ...(deepPlanValid ? { plan: deepPlanValid } : {}),
      ...(deepBilling ? { billing: deepBilling } : {}),
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  };

  // ── Step 2: "Check your inbox" verify screen ──
  if (done) {
    return (
      <div className="min-h-screen bg-panel grid place-items-center px-5">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent grid place-items-center mx-auto mb-3"><Icon name="mail" size={28} /></div>
          <h1 className="font-display text-xl font-bold">Check your inbox</h1>
          <p className="text-sm text-fg-secondary mt-2">
            We sent a confirmation link to <b>{email}</b>. Click it to activate your workspace
            and start your <b>{TRIAL_DAYS}-day Pro free trial</b>.
          </p>
          <p className="text-sm text-fg-secondary mt-1">Didn't get the email? Check spam, or resend it.</p>
          <ResendButton email={email} />
          <div className="mt-4">
            <Link to="/register" className="text-sm text-accent font-semibold hover:underline">Use a different email</Link>
          </div>
          <Link to="/login" className="inline-block mt-5 px-6 py-2.5 bg-accent text-white font-bold rounded-xl text-sm hover:bg-accent-2">
            Back to sign in
          </Link>
        </Card>
      </div>
    );
  }

  // ── Step 1: identity (email + password) ──
  return (
    <div className="min-h-screen bg-panel text-fg-primary">
      <header className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="text-sm font-semibold text-fg-secondary hover:text-fg-primary">Sign in</Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-5 pb-16">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold">Create your workspace</h1>
          <p className="text-sm text-fg-secondary mt-1">Start your <b>{TRIAL_DAYS}-day Pro free trial</b> — no credit card required</p>
        </div>

        <Card className="p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          {/* Honeypot — invisible to humans, autofilled by bots (migration 201 / register_org EF). */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="reg-website">Website</label>
            <input id="reg-website" type="text" name="website" autoComplete="off" tabIndex={-1} value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Work email</span>
            <Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@firm.com" autoComplete="email" />
          </label>
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Password</span>
            <Input className="mt-1" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
          </label>
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Confirm password</span>
            <Input className="mt-1" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
          </label>

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

function ResendButton({ email }: { email: string }): JSX.Element {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setError(null);
    setSending(true);
    const res = await resendConfirmation(email);
    setSending(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  };

  if (sent) {
    return (
      <div className="mt-4 text-sm text-success bg-success-tint rounded-xl px-4 py-2.5">
        Confirmation email sent. Please check your inbox.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={() => void resend()} disabled={sending}
        className="w-full px-6 py-2.5 rounded-xl border border-border bg-bg-secondary text-sm font-semibold text-fg-primary hover:bg-bg-secondary/70 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        {sending ? <Spinner size={16} /> : <Icon name="mail" size={16} />}
        {sending ? "Sending..." : "Resend confirmation email"}
      </button>
      {error && <p className="text-[12px] text-error mt-2 text-center">{error}</p>}
    </div>
  );
}
