// SiteTrack Pro — public signup (route "/signup"). Pick a plan + submit firm /
// contact / email. Creates a PENDING signup request (no account yet); the
// superadmin approves → an invite email lands. Logged-in users go to dashboard.

import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Button, Icon, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import { PLAN_TIERS, priceFor, gstInclusive, formatINR, type BillingPeriod } from "./plans";
import { CONSENT_VERSION } from "./legalContent";
import { submitSignupRequest, type SignupPlan } from "@/app/signupQueries";

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function BillingToggle({ value, onChange }: { value: BillingPeriod; onChange: (p: BillingPeriod) => void }): JSX.Element {
  const t = useT();
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-cream-100 border border-cream-200">
      <button type="button" onClick={() => onChange("monthly")}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${value === "monthly" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}>
        {t("signup.monthly")}
      </button>
      <button type="button" onClick={() => onChange("annual")}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition inline-flex items-center gap-1.5 ${value === "annual" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}>
        {t("signup.annual")} <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{t("signup.monthsFree")}</span>
      </button>
    </div>
  );
}
function Logo(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-safety-500 text-white grid place-items-center font-display font-bold">S</div>
      <span className="font-display text-lg font-bold text-ink-900">SiteTrack Pro</span>
    </Link>
  );
}

export function SignupView(): JSX.Element {
  const t = useT();
  const { session, status } = useAuth();
  const [params] = useSearchParams();
  const initialPlan = (PLAN_TIERS.find(p => p.id === params.get("plan"))?.id ?? "pro") as SignupPlan;
  const initialBilling: BillingPeriod = params.get("billing") === "monthly" ? "monthly" : "annual";

  const [plan, setPlan] = useState<SignupPlan>(initialPlan);
  const [billing, setBilling] = useState<BillingPeriod>(initialBilling);
  const [firmName, setFirmName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — hidden from real users
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Public signup renders instantly — no auth-loading spinner gate. Redirect
  // only once a logged-in session is confirmed.
  if (status === "ready" && session) return <Navigate to="/dashboard" replace />;

  const submit = async () => {
    setError(null);
    if (!firmName.trim() || !contactName.trim()) return setError(t("signup.errFirmName"));
    if (!validEmail(email)) return setError(t("signup.errEmail"));
    if (!consent) return setError(t("signup.errConsent"));
    setBusy(true);
    // Capture the chosen billing cycle for the reviewer (no dedicated column yet).
    const billingNote = `Billing: ${billing}`;
    const fullMessage = [message.trim(), billingNote].filter(Boolean).join(" — ");
    const res = await submitSignupRequest({
      firmName: firmName.trim(), contactName: contactName.trim(), email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined, plan, message: fullMessage,
      website: website.trim() || undefined, consentVersion: CONSENT_VERSION,
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-cream-50 grid place-items-center px-5">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-3"><Icon name="check" size={28} /></div>
          <h1 className="font-display text-xl font-bold">{t("signup.doneTitle")}</h1>
          <p className="text-sm text-ink-600 mt-2">
            {t("signup.doneBody", {
              name: contactName.split(" ")[0],
              firm: firmName,
              plan: PLAN_TIERS.find(p => p.id === plan)?.name ?? plan,
              email,
            })}
          </p>
          <Link to="/" className="inline-block mt-5 text-sm font-semibold text-safety-600 hover:text-safety-700">{t("signup.backHome")}</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 text-ink-900">
      <header className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="text-sm font-semibold text-ink-600 hover:text-ink-900">{t("signup.headerSignIn")}</Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 pb-16">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-bold">{t("signup.title")}</h1>
          <p className="text-sm text-ink-500 mt-1">{t("signup.sub")}</p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-4"><BillingToggle value={billing} onChange={setBilling} /></div>

        {/* Plan selector */}
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          {PLAN_TIERS.map(p => {
            const active = plan === p.id;
            const pr = priceFor(p, billing);
            return (
              <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                className={`text-left p-4 rounded-xl border-2 transition relative ${active ? "border-safety-500 bg-white shadow-sm" : "border-cream-200 bg-white hover:border-cream-300"}`}>
                {p.popular && <div className="absolute -top-2 right-3"><Badge tone="warning">{t("signup.popular")}</Badge></div>}
                <div className="flex items-center justify-between">
                  <div className="font-display font-bold">{p.name}</div>
                  {active && <Icon name="check" size={16} className="text-safety-600" />}
                </div>
                <div className="text-xl font-bold mt-1">{pr.amount}<span className="text-xs font-normal text-ink-400">{pr.cadence}</span></div>
                {billing === "annual" && <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">{pr.effectiveMonthly} · {t("signup.saveLabel")} {pr.savingsAmount}</div>}
                <div className="text-[10px] text-ink-400 mt-0.5">{t("signup.gstLine", { amount: formatINR(gstInclusive(billing === "annual" ? p.annual : p.monthly)) })}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">{p.tagline}</div>
              </button>
            );
          })}
        </div>

        {/* Form */}
        <Card className="max-w-xl mx-auto p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("signup.firmName")}</span>
              <Input className="mt-1" value={firmName} onChange={e => setFirmName(e.target.value)} placeholder={t("signup.firmPlaceholder")} /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("signup.yourName")}</span>
              <Input className="mt-1" value={contactName} onChange={e => setContactName(e.target.value)} placeholder={t("signup.yourNamePlaceholder")} /></label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("signup.workEmail")}</span>
              <Input className="mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t("signup.emailPlaceholder")} /></label>
            <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("signup.phone")} <span className="text-ink-300 normal-case">{t("signup.optional")}</span></span>
              <Input className="mt-1" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t("signup.phonePlaceholder")} /></label>
          </div>
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("signup.anything")} <span className="text-ink-300 normal-case">{t("signup.optional")}</span></span>
            <Input className="mt-1" value={message} onChange={e => setMessage(e.target.value)} placeholder={t("signup.anythingPlaceholder")} /></label>

          {/* Honeypot: hidden from humans (off-screen + not focusable). Bots fill it → request is dropped server-side. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={website} onChange={e => setWebsite(e.target.value)}
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

          <label className="flex items-start gap-2 text-[12px] text-ink-600 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-safety-500" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>{t("signup.agreePre")} <Link to="/terms" target="_blank" className="text-safety-600 font-semibold hover:underline">{t("signup.terms")}</Link> {t("signup.and")} <Link to="/privacy" target="_blank" className="text-safety-600 font-semibold hover:underline">{t("signup.privacy")}</Link>.</span>
          </label>

          <Button className="w-full" onClick={() => void submit()} disabled={busy || !consent}>
            {busy ? <Spinner size={16} /> : <>{t("signup.requestAccess", { plan: PLAN_TIERS.find(p => p.id === plan)?.name ?? plan })}</>}
          </Button>
          <p className="text-[11px] text-ink-400 text-center">{t("signup.alreadyAccount")} <Link to="/login" className="text-safety-600 font-semibold">{t("signup.headerSignIn")}</Link></p>
        </Card>
      </div>
    </div>
  );
}
