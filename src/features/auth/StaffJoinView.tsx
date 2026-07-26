// SiteTrack Pro — staff invite redemption (route "/staff/join?token=…").
//
// A staff Head/Owner generates a single-use invite link; the invitee lands here,
// sets their name + email + password, and we redeem the token via the
// redeem-staff-invite Edge Function (which creates the account + promotes it to
// the platform staff tier). On success we sign them in and enter the workspace.

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authLib(): Promise<any> {
  return await import("../../lib/supabase");
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function StaffJoinView(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No token → not a valid invite landing.
  if (!token) {
    return (
      <div className="min-h-screen bg-cream-50 grid place-items-center px-5">
        <Card className="max-w-md w-full p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 grid place-items-center mx-auto mb-3"><Icon name="alert" size={24} /></div>
          <h1 className="font-display text-lg font-bold">Invalid invite link</h1>
          <p className="text-sm text-ink-600 mt-2">This page needs a valid staff-invite link. Ask the person who invited you to resend it.</p>
          <Link to="/staff/login" className="inline-block mt-4 text-sm font-semibold text-safety-600 hover:text-safety-700">Back to staff sign in</Link>
        </Card>
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Please enter your name.");
    if (!validEmail(email)) return setError("Please enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const lib = await authLib();
    const res = await lib.redeemStaffInvite({ token, name: name.trim(), email: email.trim().toLowerCase(), password });
    if (!res.ok) { setBusy(false); return setError(res.error ?? "Could not redeem this invite."); }
    // Account created + promoted → sign in and enter.
    const signin = await lib.signInWithPassword(res.email ?? email.trim().toLowerCase(), password);
    setBusy(false);
    if (signin.ok) { navigate("/admin"); return; }
    // Created but auto sign-in hiccup → send them to login with their new password.
    navigate("/staff/login");
  };

  return (
    <div className="min-h-screen bg-cream-50 grid place-items-center px-5 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-lg bg-safety-500 text-white grid place-items-center font-bold">S</div>
          <div className="font-display font-bold text-ink-900">SiteTrack Pro</div>
        </div>
        <h1 className="font-display text-xl font-bold mt-3">Join the staff team</h1>
        <p className="text-[13px] text-ink-500 mt-1 mb-4">You've been invited as a SiteTrack Pro platform staff member. Set up your account to continue.</p>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-700 flex items-start gap-2">
            <Icon name="alert" size={15} className="text-red-600 mt-0.5" /> {error}
          </div>
        )}

        <label htmlFor="nm" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">Your name</label>
        <input id="nm" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rakesh B."
          className="w-full mb-3 px-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white" />

        <label htmlFor="em" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">Work email</label>
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="mail" size={16} /></span>
          <input id="em" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.in" autoComplete="email"
            className="w-full pl-10 pr-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white" />
        </div>

        <label htmlFor="pw" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">Create a password</label>
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="lock" size={16} /></span>
          <input id="pw" type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters" autoComplete="new-password"
            className="w-full pl-10 pr-10 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white" />
          <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1} aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
            <Icon name={show ? "eyeOff" : "eye"} size={16} />
          </button>
        </div>

        <label htmlFor="cf" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">Confirm password</label>
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="lock" size={16} /></span>
          <input id="cf" type={show ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter password" autoComplete="new-password" onKeyDown={e => { if (e.key === "Enter") submit(); }}
            className="w-full pl-10 pr-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white" />
        </div>

        <Button fullWidth size="lg" disabled={busy} onClick={submit} leftIcon={busy ? <Spinner size={16} /> : null}>
          {busy ? "Creating your account…" : "Join & continue"}
        </Button>
        <p className="text-[11px] text-ink-400 text-center mt-3">Already have an account? <Link to="/staff/login" className="text-safety-600 font-semibold">Staff sign in</Link></p>
      </Card>
    </div>
  );
}
