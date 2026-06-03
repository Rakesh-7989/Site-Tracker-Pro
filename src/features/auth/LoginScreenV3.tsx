// SiteTrack Pro — v3 login screen.
//
// Reuses the EXISTING auth helpers in src/lib/supabase.js (signInWithPassword,
// signInWithMagicLink, verifyEmailOtp) so the auth backend is untouched.
// On success it triggers the AuthProvider to re-hydrate + navigates to the
// dashboard. Password + magic-link tabs; OTP fallback for the magic link.

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth";
import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";

type Method = "password" | "magic";
type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "sent"; msg: string }
  | { kind: "error"; msg: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authLib(): Promise<any> {
  return await import("../../lib/supabase.js");
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function LoginScreenV3(): JSX.Element {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [method, setMethod] = useState<Method>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const afterAuth = async () => {
    await refresh();
    navigate("/dashboard");
  };

  const onPasswordLogin = async () => {
    if (!validEmail(email)) return setStatus({ kind: "error", msg: "Enter a valid email." });
    if (!password) return setStatus({ kind: "error", msg: "Password is required." });
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const res = await lib.signInWithPassword(email.trim().toLowerCase(), password);
    if (res.ok) await afterAuth();
    else setStatus({ kind: "error", msg: res.error ?? "Sign-in failed." });
  };

  const onMagicLink = async () => {
    if (!validEmail(email)) return setStatus({ kind: "error", msg: "Enter a valid email." });
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const res = await lib.signInWithMagicLink(email.trim().toLowerCase());
    if (res.ok) setStatus({ kind: "sent", msg: `Sign-in link sent to ${email}. Click it or enter the 6-digit code below.` });
    else setStatus({ kind: "error", msg: res.error ?? "Could not send link." });
  };

  const onVerifyOtp = async () => {
    const code = otp.replace(/\s/g, "").trim();
    if (!/^\d{6}$/.test(code)) return setStatus({ kind: "error", msg: "Enter the 6-digit code." });
    setStatus({ kind: "busy" });
    const lib = await authLib();
    const res = await lib.verifyEmailOtp(email.trim().toLowerCase(), code);
    if (res.ok) await afterAuth();
    else setStatus({ kind: "error", msg: res.error ?? "Invalid code." });
  };

  const busy = status.kind === "busy";

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-ink-900">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-center px-12 text-white">
        <h1 className="font-display text-5xl font-bold leading-tight">
          Every site, every drawing,
          <br />
          <span className="text-safety-500">one quiet record.</span>
        </h1>
        <p className="mt-5 text-ink-300 text-base max-w-md leading-relaxed">
          A construction-native record-keeper for architects, project managers,
          contractors and their clients. Built for the field, trusted in the office.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-safety-500">
          <span className="w-2 h-2 rounded-full bg-safety-500" /> v3 TypeScript shell
        </div>
      </div>

      {/* Right auth panel */}
      <div className="flex items-center justify-center p-6 bg-cream-50">
        <Card className="w-full max-w-md p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-lg bg-safety-500 text-white grid place-items-center font-bold">S</div>
            <div>
              <div className="font-display font-bold text-ink-900">SiteTrack Pro</div>
              <div className="text-[11px] text-ink-500">Sign in to your workspace</div>
            </div>
          </div>

          {/* Method tabs */}
          <div className="flex items-center gap-4 mb-4 border-b border-cream-200">
            {(["password", "magic"] as Method[]).map(m => (
              <button
                key={m}
                onClick={() => { setMethod(m); setStatus({ kind: "idle" }); }}
                className={`text-[11px] font-semibold tracking-[0.14em] uppercase pb-2 -mb-px transition ${
                  method === m ? "text-safety-600 border-b-2 border-safety-500" : "text-ink-500 hover:text-ink-700 border-b-2 border-transparent"
                }`}
              >
                {m === "password" ? "Password" : "Magic link"}
              </button>
            ))}
          </div>

          {/* Email */}
          <div className="mb-3">
            <label htmlFor="email" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">Work email</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="mail" size={16} /></span>
              <input
                id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@yourcompany.in" autoComplete="email"
                onKeyDown={e => { if (e.key === "Enter") method === "password" ? onPasswordLogin() : onMagicLink(); }}
                className="w-full pl-10 pr-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white"
              />
            </div>
          </div>

          {/* Password */}
          {method === "password" && (
            <div className="mb-3">
              <label htmlFor="pw" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="lock" size={16} /></span>
                <input
                  id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  onKeyDown={e => { if (e.key === "Enter") onPasswordLogin(); }}
                  className="w-full pl-10 pr-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white"
                />
              </div>
            </div>
          )}

          <Button
            fullWidth size="lg" disabled={busy}
            onClick={method === "password" ? onPasswordLogin : onMagicLink}
            leftIcon={busy ? <Spinner size={16} /> : null}
          >
            {busy ? "Please wait…" : method === "password" ? "Sign in" : "Send magic link"}
          </Button>

          {/* Status */}
          {status.kind === "sent" && (
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[12px] text-emerald-700 flex items-start gap-2">
              <Icon name="check" size={15} className="text-emerald-600 mt-0.5" /> {status.msg}
            </div>
          )}
          {status.kind === "error" && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-700 flex items-start gap-2">
              <Icon name="alert" size={15} className="text-red-600 mt-0.5" /> {status.msg}
            </div>
          )}

          {/* OTP fallback after magic link */}
          {status.kind === "sent" && (
            <div className="mt-4 pt-4 border-t border-cream-200">
              <label htmlFor="otp" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-2">Or enter 6-digit code</label>
              <div className="flex gap-2">
                <input
                  id="otp" value={otp} inputMode="numeric" maxLength={6}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter") onVerifyOtp(); }}
                  placeholder="123456"
                  className="flex-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm font-mono tracking-[0.3em] text-center outline-none focus:border-safety-500 bg-white"
                />
                <Button variant="secondary" size="md" onClick={onVerifyOtp} disabled={busy}>Verify</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
