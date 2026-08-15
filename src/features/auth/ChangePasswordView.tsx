// SiteTrack Pro — forced password change (route "/auth/change-password").
//
// P-E temp-password flow: approved signup applicants sign in with a generated
// temp password and profiles.must_change_password = true. postLoginPathForSession
// redirects them here; they pick their own password (auth.updateUser), then the
// clear_my_must_change_password RPC lifts the gate and we continue to the
// normal post-login landing. Also works as a general "change password" page for
// any signed-in user.

import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";
import { useAuth } from "@/auth";
import { postLoginPathForSession, readStoredLoginLane } from "@/auth/loginRouting";
import { updatePassword, getSupabaseClient } from "@/lib/supabase";

export function ChangePasswordView(): JSX.Element {
  const navigate = useNavigate();
  const { session, status: authStatus } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // If the session load finished and there's no session, bail to login.
    if (authStatus === "ready" && !session) {
      navigate("/login", { replace: true });
    }
  }, [authStatus, session, navigate]);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const res = await updatePassword(password);
      if (!res.ok) {
        setBusy(false);
        return setError(res.error ?? "Could not update your password.");
      }
      // Lift the forced-change gate (self-only RPC from migration 195).
      const sb = await getSupabaseClient();
      try { await sb?.rpc("clear_my_must_change_password"); } catch { /* best-effort */ }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // No session → bounce to login (guarded above, but cover the render path too).
  if (authStatus === "ready" && !session) return <Navigate to="/login" replace />;

  if (done) {
    return (
      <div className="min-h-screen bg-panel grid place-items-center px-5">
        <Card className="w-full max-w-md p-6">
          <div className="w-14 h-14 rounded-2xl bg-success-tint text-success grid place-items-center mx-auto mb-3"><Icon name="check" size={28} /></div>
          <h1 className="font-display text-lg font-bold text-center">Password updated</h1>
          <p className="text-sm text-fg-secondary mt-2 text-center">Your new password is set.</p>
          <Button
            fullWidth size="lg" className="mt-4"
            onClick={() => navigate(postLoginPathForSession(session!, readStoredLoginLane()))}
          >
            Continue to your workspace
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-panel grid place-items-center px-5">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-lg bg-accent text-white grid place-items-center font-bold">S</div>
          <div>
            <div className="font-display font-bold text-fg-primary">SiteTrack Pro</div>
            <div className="text-[11px] text-fg-secondary">Set a new password</div>
          </div>
        </div>

        {authStatus !== "ready" && (
          <div className="py-8 grid place-items-center gap-3 text-fg-secondary">
            <Spinner size={24} /><span className="text-sm">Loading…</span>
          </div>
        )}

        {authStatus === "ready" && (
          <div>
            <p className="text-[13px] text-fg-secondary mb-4">Your account was set up with a temporary password. Choose a new one to continue — use at least 8 characters.</p>
            {error && (
              <div className="mb-3 rounded-lg bg-error-tint border border-error p-3 text-[12px] text-error flex items-start gap-2">
                <Icon name="alert" size={15} className="text-error mt-0.5" /> {error}
              </div>
            )}
            <label htmlFor="np" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-fg-secondary block mb-1.5">New password</label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"><Icon name="lock" size={16} /></span>
              <input
                id="np" type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                className="w-full pl-10 pr-10 py-3 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
              />
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-tertiary hover:text-fg-secondary">
                <Icon name={show ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
            <label htmlFor="cp" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-fg-secondary block mb-1.5">Confirm new password</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"><Icon name="lock" size={16} /></span>
              <input
                id="cp" type={show ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                className="w-full pl-10 pr-3.5 py-3 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
              />
            </div>
            <Button fullWidth size="lg" loading={busy} onClick={submit}>
              {busy ? "Saving…" : "Set new password"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
