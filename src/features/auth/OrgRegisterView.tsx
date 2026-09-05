// SiteTrack Pro — self-service org registration (/register).
// Zoho-style minimal identity screen: work email + password only.
// No industry, plan, billing, modules, or project info on first screen.
// Owner confirms email, then onboarding collects firm/segment/plan.
//
// Primary CTA: Create your workspace
// Secondary: Already have an account? Sign in
// Supporting copy: Start your 14-day Pro trial. No credit card required.

import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Button, Alert, Spinner } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import { registerOrg, type RegisterResult } from "@/app/queries/orgRegisterQueries";

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function Logo(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src="/logo-horizontal.png" alt="SiteTrack Pro" className="h-8 w-auto" />
    </Link>
  );
}

const TRIAL_DAYS = 14;

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

export function OrgRegisterView(): JSX.Element {
  const { session, status } = useAuth();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!validEmail(email)) return setError(t("auth.errValidWorkEmail"));
    if (password.length < 8) return setError(t("auth.errPasswordMin"));
    if (password !== confirmPassword) return setError(t("auth.errPasswordMismatch"));
    setBusy(true);
    const res: RegisterResult = await registerOrg({
      email: email.trim().toLowerCase(),
      password,
      firmName: email.split("@")[0],
      contactName: email.split("@")[0],
    });
    setBusy(false);
    if (res.ok) {
      setRedirect("/verify-email");
    } else {
      setError(res.error || "Registration failed");
    }
  };

  useEffect(() => {
    if (redirect) {
      const timeout = setTimeout(() => {
        window.location.href = redirect;
      }, 500);
      return () => clearTimeout(timeout);
    }
    return;
  }, [redirect]);

  if (status === "ready" && session) return <Navigate to="/dashboard" replace />;

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
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold">{t("auth.registerTitle")}</h1>
          <p className="text-sm text-fg-secondary mb-4">{t("auth.registerSub", { days: TRIAL_DAYS })}</p>
          <p className="text-sm text-fg-tertiary">Start your 14-day Pro trial. No credit card required.</p>
        </div>

        <Card className="p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <form className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t("auth.workEmail")}</span>
              <Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@firm.com" autoComplete="email" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t("auth.passwordLabel")}</span>
              <Input className="mt-1" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t("auth.passwordPlaceholder")} autoComplete="new-password" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t("auth.confirmPasswordLabel")}</span>
              <Input className="mt-1" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t("auth.passwordPlaceholder")} autoComplete="new-password" />
            </label>

            <label className="flex items-start gap-2 text-[12px] text-fg-secondary cursor-pointer">
              <input type="checkbox" required />
              <span>{renderConsent(t)}</span>
            </label>

            <Button className="w-full" onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner size={16} /> : <>{t("auth.registerCta")}</>}
            </Button>
            <p className="text-[11px] text-fg-tertiary text-center">{t("auth.alreadyAccount")} <Link to="/login" className="text-accent font-semibold">{t("auth.signIn")}</Link></p>
          </form>
        </Card>
      </div>
    </div>
  );
}