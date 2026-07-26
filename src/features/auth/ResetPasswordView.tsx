// SiteTrack Pro — password reset landing (route "/auth/reset").
//
// The "Forgot password?" link on the login screen sends a recovery email whose
// link points here. Supabase's client auto-detects the recovery token in the URL
// (detectSessionInUrl) and establishes a short-lived session; we then let the
// user choose a new password via auth.updateUser(). Works for a normal logged-in
// user too (changing their password while signed in).

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authLib(): Promise<any> {
  return await import("../../lib/supabase");
}

type Phase = "checking" | "form" | "done" | "invalid";

export function ResetPasswordView(): JSX.Element {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const lib = await authLib();
      const sb = await lib.getSupabaseClient();
      if (!sb) { if (!cancelled) setPhase("invalid"); return; }
      // getSession() awaits the client's URL-token processing; a valid recovery
      // link (or an existing login) yields a session → show the form.
      const { data } = await sb.auth.getSession().catch(() => ({ data: null }));
      if (cancelled) return;
      setPhase(data?.session?.user ? "form" : "invalid");
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const lib = await authLib();
    const res = await lib.updatePassword(password);
    setBusy(false);
    if (res.ok) setPhase("done");
    else setError(res.error ?? "Could not update your password.");
  };

  return (
    <div className="min-h-screen bg-cream-50 grid place-items-center px-5">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-lg bg-safety-500 text-white grid place-items-center font-bold">S</div>
          <div>
            <div className="font-display font-bold text-ink-900">SiteTrack Pro</div>
            <div className="text-[11px] text-ink-500">Set a new password</div>
          </div>
        </div>

        {phase === "checking" && (
          <div className="py-8 grid place-items-center gap-3 text-ink-500">
            <Spinner size={24} /><span className="text-sm">Verifying your reset link…</span>
          </div>
        )}

        {phase === "invalid" && (
          <div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-[13px] text-red-700 flex items-start gap-2">
              <Icon name="alert" size={16} className="text-red-600 mt-0.5" />
              <span>This reset link is invalid or has expired. Request a fresh one from the sign-in page.</span>
            </div>
            <Link to="/login" className="mt-4 block text-center text-sm font-semibold text-safety-600 hover:text-safety-700">← Back to sign in</Link>
          </div>
        )}

        {phase === "form" && (
          <div>
            <p className="text-[13px] text-ink-500 mb-4">Choose a new password for your account. Use at least 8 characters.</p>
            {error && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-700 flex items-start gap-2">
                <Icon name="alert" size={15} className="text-red-600 mt-0.5" /> {error}
              </div>
            )}
            <label htmlFor="np" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">New password</label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="lock" size={16} /></span>
              <input
                id="np" type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                className="w-full pl-10 pr-10 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white"
              />
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                <Icon name={show ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
            <label htmlFor="cp" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">Confirm new password</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="lock" size={16} /></span>
              <input
                id="cp" type={show ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                className="w-full pl-10 pr-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white"
              />
            </div>
            <Button fullWidth size="lg" disabled={busy} onClick={submit} leftIcon={busy ? <Spinner size={16} /> : null}>
              {busy ? "Saving…" : "Set new password"}
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-3"><Icon name="check" size={28} /></div>
            <h1 className="font-display text-lg font-bold text-center">Password updated 🎉</h1>
            <p className="text-sm text-ink-600 mt-2 text-center">Your new password is set. You're signed in.</p>
            <Button fullWidth size="lg" className="mt-4" onClick={() => navigate("/dashboard")}>Continue to your workspace</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
