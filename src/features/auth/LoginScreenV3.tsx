// SiteTrack Pro — v3 login screen.
//
// Reuses the EXISTING auth helpers in src/lib/supabase.js (signInWithPassword,
// signInWithMagicLink, verifyEmailOtp) so the auth backend is untouched.
// On success it triggers the AuthProvider to re-hydrate + navigates to the
// dashboard/admin console. Password + magic-link tabs; OTP fallback for the
// magic link. /login is org-only; /staff/login is platform-staff-only.

import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom";

import {
  isStaffSession,
  postLoginFallbackPath,
  postLoginPathForSession,
  useAuth,
  writeStoredLoginLane,
  type LoginLane,
} from "@/auth";
import { Card, Button, Icon } from "@/components/ui/atoms";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import { getMfaChallenge, verifyMfa } from "@/auth/mfa";
import { isOnboardingDone, orgHasProjects } from "@/app/onboardingQueries";

type Method = "password" | "magic";
type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "sent"; msg: string }
  | { kind: "error"; msg: string };

const LOGIN_META = {
  org: {
    icon: "building",
    subKey: "auth.orgSignInSub",
    eyebrowKey: "auth.orgLoginEyebrow",
    noticeKey: "auth.orgLoginNotice",
    wrongLaneKey: "auth.errStaffUseStaffLogin",
  },
  staff: {
    icon: "shield",
    subKey: "auth.staffSignInSub",
    eyebrowKey: "auth.staffLoginEyebrow",
    noticeKey: "auth.staffLoginNotice",
    wrongLaneKey: "auth.errOrgUseOrgLogin",
  },
} as const;

interface LoginScreenV3Props {
  lane?: LoginLane;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authLib(): Promise<any> {
  return await import("../../lib/supabase");
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function LoginScreenV3({ lane = "org" }: LoginScreenV3Props = {}): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const { refresh, session, status: authStatus } = useAuth();
  const [method, setMethod] = useState<Method>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // MFA challenge (only shown when the just-signed-in user has a verified factor).
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    writeStoredLoginLane(lane);
  }, [lane]);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("error") === "session" && status.kind === "idle") {
      const detail = p.get("detail");
      setStatus({ kind: "error", msg: detail ? `${t("auth.errSessionLoad")} (${detail})` : t("auth.errSessionLoad") });
    }
  }, [location.search]);

  const afterAuth = async () => {
    const refreshed = await refresh();
    if (!refreshed) {
      navigate(postLoginFallbackPath(lane));
      return;
    }
    const staff = isStaffSession(refreshed);
    if ((lane === "org" && staff) || (lane === "staff" && !staff)) {
      navigate(staff ? "/staff/login" : "/login", { replace: true });
      return;
    }
    // Growth: a brand-new org admin lands in the onboarding wizard, not an
    // empty dashboard. Only when the org has NO onboarding flag AND no
    // projects (pre-existing orgs are never force-routed). Fail-open both
    // checks; members join already-set-up orgs and skip this entirely.
    if (!staff && refreshed.activeOrgId && refreshed.user.identityRole === "orgadmin") {
      try {
        const lib = await authLib();
        const sb = await lib.getSupabaseClient();
        if (sb) {
          const [done, hasProjects] = await Promise.all([
            isOnboardingDone(sb, refreshed.activeOrgId),
            orgHasProjects(sb, refreshed.activeOrgId),
          ]);
          if (!done && !hasProjects) {
            navigate("/org/onboarding", { replace: true });
            return;
          }
        }
      } catch { /* fall through to the normal landing path */ }
    }
    navigate(postLoginPathForSession(refreshed, lane));
  };

  // After a successful sign-in, gate on MFA: if the user has a verified factor
  // the session is at aal1 and we must collect a 6-digit code (→ aal2) before
  // entering. Users without 2FA proceed straight through (no behaviour change).
  const proceedOrChallenge = async () => {
    const lib = await authLib();
    const sb = await lib.getSupabaseClient();
    if (sb) {
      const ch = await getMfaChallenge(sb);
      if (ch.ok && ch.required && ch.factorId) {
        setMfaFactorId(ch.factorId);
        setStatus({ kind: "idle" });
        return;
      }
    }
    await afterAuth();
  };

  const onSubmitMfa = async () => {
    if (!mfaFactorId) return;
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const sb = await lib.getSupabaseClient();
    const res = await verifyMfa(sb, mfaFactorId, mfaCode);
    if (res.ok) await afterAuth();
    else setStatus({ kind: "error", msg: res.error ?? t("auth.errInvalidCode") });
  };

  const onPasswordLogin = async () => {
    if (!validEmail(email)) return setStatus({ kind: "error", msg: t("auth.errInvalidEmail") });
    if (!password) return setStatus({ kind: "error", msg: t("auth.errPasswordRequired") });
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const res = await lib.signInWithPassword(email.trim().toLowerCase(), password);
    if (res.ok) await proceedOrChallenge();
    else setStatus({ kind: "error", msg: res.error ?? t("auth.errSignInFailed") });
  };

  const onMagicLink = async () => {
    if (!validEmail(email)) return setStatus({ kind: "error", msg: t("auth.errInvalidEmail") });
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const res = await lib.signInWithMagicLink(email.trim().toLowerCase());
    if (res.ok) setStatus({ kind: "sent", msg: t("auth.magicSent", { email }) });
    else setStatus({ kind: "error", msg: res.error ?? t("auth.errCouldNotSendLink") });
  };

  const onForgotPassword = async () => {
    if (!validEmail(email)) return setStatus({ kind: "error", msg: t("auth.errEnterEmailFirst") });
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const res = await lib.resetPassword(email.trim().toLowerCase());
    if (res.ok) setStatus({ kind: "sent", msg: t("auth.resetSent", { email }) });
    else setStatus({ kind: "error", msg: res.error ?? t("auth.errCouldNotSendReset") });
  };

  const onVerifyOtp = async () => {
    const code = otp.replace(/\s/g, "").trim();
    if (!/^\d{6}$/.test(code)) return setStatus({ kind: "error", msg: t("auth.errEnter6") });
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const res = await lib.verifyEmailOtp(email.trim().toLowerCase(), code);
    if (res.ok) await proceedOrChallenge();
    else setStatus({ kind: "error", msg: res.error ?? t("auth.errInvalidCode") });
  };

  // Already signed in (e.g. arriving via an invite / magic-link redirect) →
  // go straight to the app instead of showing the form.
  if (authStatus !== "loading" && authStatus !== "idle" && session) {
    const staff = isStaffSession(session);
    if (lane === "org" && staff) return <Navigate to="/staff/login" replace />;
    if (lane === "staff" && !staff) return <Navigate to="/login" replace />;
    return <Navigate to={postLoginPathForSession(session, lane)} replace />;
  }

  const busy = status.kind === "busy";
  const meta = LOGIN_META[lane];

  return (
    <main className="relative min-h-screen grid lg:grid-cols-2 bg-ink">
      {/* Pre-login language picker (top-right) */}
      <div className="absolute top-4 right-4 z-10"><LanguageSwitcher /></div>

      {/* Left brand panel — hardcoded dark surface, so scope dark-theme accent
          tokens locally (`.on-ink`) or the light tokens fail contrast here. */}
      <div className="on-ink hidden lg:flex flex-col justify-center px-12 text-white">
        <h1 className="font-display text-5xl font-bold leading-tight">
          {t("auth.heroTitle1")}
          <br />
          <span className="text-accent">{t("auth.heroTitle2")}</span>
        </h1>
        <p className="mt-5 text-fg-tertiary text-base max-w-md leading-relaxed">
          {t("auth.heroSub")}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-accent">
          <span className="w-2 h-2 rounded-full bg-accent" /> {t("auth.shellTag")}
        </div>
      </div>

      {/* Right auth panel */}
      <div className="flex items-center justify-center p-6 bg-panel">
        <Card className="w-full max-w-md p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-lg bg-accent text-white grid place-items-center font-bold">S</div>
            <div>
              <div className="font-display font-bold text-fg-primary">SiteTrack Pro</div>
              <div className="text-[11px] text-fg-secondary">{t(meta.subKey)}</div>
            </div>
          </div>

          {mfaFactorId ? (
            /* MFA challenge — only when the signed-in user has 2FA enabled */
            <div>
              <div className="text-sm font-semibold text-fg-primary mb-1">{t("auth.mfaTitle")}</div>
              <p className="text-[12px] text-fg-secondary mb-3">{t("auth.mfaSub")}</p>
              <input
                id="mfa" value={mfaCode} inputMode="numeric" maxLength={6} autoFocus
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={e => { if (e.key === "Enter") onSubmitMfa(); }}
                placeholder="123456"
                className="w-full px-3 py-3 border border-default rounded-lg text-base font-mono tracking-[0.4em] text-center outline-none focus:border-accent bg-panel"
              />
              {status.kind === "error" && (
                <div className="mt-3 rounded-lg bg-error-tint border border-error p-3 text-[12px] text-error flex items-start gap-2">
                  <Icon name="alert" size={15} className="text-error mt-0.5" /> {status.msg}
                </div>
              )}
              <Button fullWidth size="lg" className="mt-3" loading={busy} onClick={onSubmitMfa}>
                {busy ? t("auth.verifying") : t("auth.verifyContinue")}
              </Button>
            </div>
          ) : (<>
          <div className="mb-4 rounded-lg border border-default bg-panel px-3 py-2 text-[12px] text-fg-secondary flex items-start gap-2">
            <Icon name={meta.icon} size={15} className="text-accent mt-0.5 flex-shrink-0" />
            <span>
              <span className="block text-[10px] font-semibold tracking-[0.18em] uppercase text-fg-tertiary mb-0.5">{t(meta.eyebrowKey)}</span>
              {t(meta.noticeKey)}
            </span>
          </div>

          {/* Method tabs */}
          <div className="flex items-center gap-4 mb-4 border-b border-default">
            {(["password", "magic"] as Method[]).map(m => (
              <button
                key={m}
                onClick={() => { setMethod(m); setStatus({ kind: "idle" }); }}
                className={`text-[11px] font-semibold tracking-[0.14em] uppercase pb-2 -mb-px transition ${
                  method === m ? "text-accent border-b-2 border-accent" : "text-fg-secondary hover:text-fg-primary border-b-2 border-transparent"
                }`}
              >
                {m === "password" ? t("auth.tabPassword") : t("auth.tabMagic")}
              </button>
            ))}
          </div>

          {/* Email */}
          <div className="mb-3">
            <label htmlFor="email" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-fg-secondary block mb-1.5">{t("auth.workEmail")}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"><Icon name="mail" size={16} /></span>
              <input
                id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")} autoComplete="email"
                onKeyDown={e => { if (e.key === "Enter") { if (method === "password") onPasswordLogin(); else onMagicLink(); } }}
                className="w-full pl-10 pr-3.5 py-3 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
              />
            </div>
          </div>

          {/* Password */}
          {method === "password" && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="pw" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-fg-secondary">{t("auth.passwordLabel")}</label>
                <button type="button" onClick={onForgotPassword} disabled={busy}
                  className="text-[11px] font-semibold text-accent hover:text-accent-2 disabled:opacity-50">
                  {t("auth.forgot")}
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"><Icon name="lock" size={16} /></span>
                <input
                  id="pw" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  onKeyDown={e => { if (e.key === "Enter") onPasswordLogin(); }}
                  className="w-full pl-10 pr-10 py-3 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
                />
                <button type="button" onClick={() => setShowPassword(s => !s)} tabIndex={-1}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-tertiary hover:text-fg-secondary">
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </button>
              </div>
            </div>
          )}

          <Button
            fullWidth size="lg" loading={busy}
            onClick={method === "password" ? onPasswordLogin : onMagicLink}
          >
            {busy ? t("auth.pleaseWait") : method === "password" ? t("auth.signIn") : t("auth.sendMagic")}
          </Button>

          {/* Status */}
          {status.kind === "sent" && (
            <div className="mt-3 rounded-lg bg-success-tint border border-success p-3 text-[12px] text-success flex items-start gap-2">
              <Icon name="check" size={15} className="text-success mt-0.5" /> {status.msg}
            </div>
          )}
          {status.kind === "error" && (
            <div className="mt-3 rounded-lg bg-error-tint border border-error p-3 text-[12px] text-error flex items-start gap-2">
              <Icon name="alert" size={15} className="text-error mt-0.5" /> {status.msg}
            </div>
          )}

          {/* OTP fallback after magic link */}
          {status.kind === "sent" && (
            <div className="mt-4 pt-4 border-t border-default">
              <label htmlFor="otp" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-fg-secondary block mb-2">{t("auth.orEnterCode")}</label>
              <div className="flex gap-2">
                <input
                  id="otp" value={otp} inputMode="numeric" maxLength={6}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter") onVerifyOtp(); }}
                  placeholder="123456"
                  className="flex-1 px-3 py-2.5 border border-default rounded-lg text-sm font-mono tracking-[0.3em] text-center outline-none focus:border-accent bg-panel"
                />
                <Button variant="secondary" size="md" onClick={onVerifyOtp} disabled={busy}>{t("auth.verify")}</Button>
              </div>
            </div>
          )}
          {lane === "staff" ? (
            <p className="mt-4 text-center text-[11px] text-fg-tertiary">
              {t("auth.customerLoginPrompt")} <Link to="/login" className="font-semibold text-accent hover:text-accent-2">{t("auth.customerLoginLink")}</Link>
            </p>
          ) : (
            <p className="mt-4 text-center text-[11px] text-fg-tertiary">
              {t("auth.orgCreatePrompt")} <Link to="/register" className="font-semibold text-accent hover:text-accent-2">{t("auth.orgCreateLink")}</Link>
            </p>
          )}
          </>)}
        </Card>
      </div>
    </main>
  );
}

export function StaffLoginScreen(): JSX.Element {
  return <LoginScreenV3 lane="staff" />;
}
