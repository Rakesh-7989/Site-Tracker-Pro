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
import { useT } from "@/i18n/I18nProvider";
import { CONSENT_VERSION } from "@/features/marketing/legalContent";
import { type BillingPeriod } from "@/features/marketing/plans";
import { registerOrg, resendConfirmation, type RegisterPlan } from "@/app/queries/orgRegisterQueries";

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
  const t = useT();

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
    if (!validEmail(email)) return setError(t("auth.errValidWorkEmail"));
    if (password.length < 8) return setError(t("auth.errPasswordMin"));
    if (password !== confirmPassword) return setError(t("auth.errPasswordMismatch"));
    if (!consent) return setError(t("auth.errConsentRequired"));
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
          <h1 className="font-display text-xl font-bold">{t("auth.verifyTitle")}</h1>
          <p className="text-sm text-fg-secondary mt-2">
            {t("auth.verifySub", { email, days: TRIAL_DAYS })}
          </p>
          <p className="text-sm text-fg-secondary mt-1">{t("auth.verifySpam")}</p>
          <ResendButton email={email} />
          <div className="mt-4">
            <Link to="/register" className="text-sm text-accent font-semibold hover:underline">{t("auth.verifyDifferentEmail")}</Link>
          </div>
          <Link to="/login" className="inline-block mt-5 px-6 py-2.5 bg-accent text-white font-bold rounded-xl text-sm hover:bg-accent-2">
            {t("auth.verifyBackToSignIn")}
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
          <h1 className="font-display text-3xl font-bold">{t("auth.registerTitle")}</h1>
          <p className="text-sm text-fg-secondary mt-1">{t("auth.registerSub", { days: TRIAL_DAYS })}</p>
        </div>

        <Card className="p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          {/* Honeypot — invisible to humans, autofilled by bots (migration 201 / register_org EF). */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="reg-website">Website</label>
            <input id="reg-website" type="text" name="website" autoComplete="off" tabIndex={-1} value={website} onChange={e => setWebsite(e.target.value)} />
          </div>
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t("auth.workEmail")}</span>
            <Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@firm.com" autoComplete="email" />
          </label>
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t("auth.passwordLabel")}</span>
            <Input className="mt-1" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t("auth.passwordPlaceholder")} autoComplete="new-password" />
          </label>
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t("auth.confirmPasswordLabel")}</span>
            <Input className="mt-1" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t("auth.passwordPlaceholder")} autoComplete="new-password" />
          </label>

          <label className="flex items-start gap-2 text-[12px] text-fg-secondary cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-[var(--st-accent)]" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>{renderConsent(t)}</span>
          </label>

          <Button className="w-full" onClick={() => void submit()} disabled={busy || !consent}>
            {busy ? <Spinner size={16} /> : <>{t("auth.registerCta")}</>}
          </Button>
          <p className="text-[11px] text-fg-tertiary text-center">{t("auth.alreadyAccount")} <Link to="/login" className="text-accent font-semibold">{t("auth.signIn")}</Link></p>
        </Card>
      </div>
    </div>
  );
}

function renderConsent(t: (key: string, vars?: Record<string, string | number>) => string): JSX.Element {
  const parts = t("auth.consentRegister").split(/\{(terms|privacy)\}/);
  return (
    <>
      {parts.map((part, i) => {
        if (part === "terms") {
          return <Link key={i} to="/terms" target="_blank" className="text-accent font-semibold hover:underline">{t("auth.termsLabel")}</Link>;
        }
        if (part === "privacy") {
          return <Link key={i} to="/privacy" target="_blank" className="text-accent font-semibold hover:underline">{t("auth.privacyLabel")}</Link>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ResendButton({ email }: { email: string }): JSX.Element {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

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
        {t("auth.verifySent")}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={() => void resend()} disabled={sending}
        className="w-full px-6 py-2.5 rounded-xl border border-border bg-bg-secondary text-sm font-semibold text-fg-primary hover:bg-bg-secondary/70 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        {sending ? <Spinner size={16} /> : <Icon name="mail" size={16} />}
        {sending ? t("auth.verifySending") : t("auth.verifyResend")}
      </button>
      {error && <p className="text-[12px] text-error mt-2 text-center">{error}</p>}
    </div>
  );
}
