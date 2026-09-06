// SiteTrack Pro — verify email screen.
//
// After registration, the user must confirm their email before signing in.
// The pending address arrives via ?email= (register redirects here with it;
// window.location loses router state, so the query param is the carrier).
// "Resend" calls the real `resend_confirmation` edge function (rate-limited
// server-side at 3/min) with a 60s client cooldown.

import { useState, useEffect } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { Card, Alert, Button, Spinner } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { resendConfirmation } from "@/app/queries/orgRegisterQueries";

const RESEND_COOLDOWN_SEC = 60;
const TRIAL_DAYS = 14;

export function VerifyEmailView(): JSX.Element {
  const { session, status } = useAuth();
  const t = useT();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session email wins when it exists (user re-opened the link while signed in).
  useEffect(() => {
    if (session?.user?.email) {
      setEmail(session.user.email);
    }
  }, [session]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Confirmed session → onboarding (declarative; never navigate during render).
  if (status === "ready" && session) return <Navigate to="/onboarding" replace />;

  const resendConfirm = async () => {
    setError(null);
    setSent(false);
    const addr = email.trim().toLowerCase();
    if (!addr || !addr.includes("@")) {
      setError(t("auth.errValidWorkEmail"));
      return;
    }
    setSending(true);
    const res = await resendConfirmation(addr);
    setSending(false);
    if (res.ok) {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SEC);
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-panel text-fg-primary">
      <header className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t("auth.verifyTitle")}</h1>
        <Link to="/login" className="text-sm font-semibold text-fg-secondary hover:text-fg-primary">{t("auth.verifyBackToSignIn")}</Link>
      </header>

      <div className="max-w-md mx-auto px-5 py-8">
        <Card className="p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          {sent && <Alert variant="success">{t("auth.verifySent")}</Alert>}

          <p className="text-sm text-fg-secondary mb-4">
            {t("auth.verifySub", { email: email || "—", days: TRIAL_DAYS })}
          </p>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">{t("auth.workEmail")}</span>
            <Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@firm.com" autoComplete="email" />
          </label>

          <div>
            <Button className="w-full" onClick={() => void resendConfirm()} disabled={sending || cooldown > 0}>
              {sending ? <Spinner size={16} /> : <>{t(cooldown > 0 ? "auth.verifySending" : "auth.verifyResend")}{cooldown > 0 ? ` (${cooldown}s)` : ""}</>}
            </Button>
          </div>

          <p className="text-sm text-fg-secondary">
            {t("auth.verifySpam")}
          </p>

          <div className="mt-6 text-sm text-fg-tertiary">
            <p>{t("auth.alreadyAccount")} <Link to="/login" className="font-semibold text-accent">{t("auth.signIn")}</Link></p>
          </div>
        </Card>
      </div>
    </div>
  );
}
