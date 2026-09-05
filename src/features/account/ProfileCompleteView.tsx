// SiteTrack Pro — mandatory profile completion (route "/profile/complete").
import { getClient } from "@/lib/supabase/supabase";
//
// Every user must finish their profile once after sign-in before they can use
// the app (ShellLayout redirects here while profile_completed is false). Email
// is locked (primary identity); name/mobile/company are required.

import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth";
import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { completeMyProfile } from "@/app/queries/profileQueries";

 

const LANGS = [{ value: "en", label: "English" }, { value: "te", label: "à°¤à±†à°²à±à°—à± (Telugu)" }, { value: "hi", label: "à¤¹à¤¿à¤‚à¤¦à¥€ (Hindi)" }];

function Field({ label, children, required }: { label: string; required?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary">{label}{required && <span className="text-accent"> *</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function ProfileCompleteView(): JSX.Element {
  const navigate = useNavigate();
  const { session, status, refresh } = useAuth();

  const [name, setName] = useState(session?.user.name ?? "");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading" || status === "idle") {
    return <div className="min-h-screen grid place-items-center bg-bg-secondary"><Spinner size={26} /></div>;
  }
  if (status === "signed-out" || !session) return <Navigate to="/login" replace />;
  // Already done → no reason to be here.
  if (session.user.profileCompleted === true) return <Navigate to="/dashboard" replace />;

  const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-accent bg-white";

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Please enter your full name.");
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) return setError("Please enter a valid 10-digit mobile number.");
    if (!company.trim()) return setError("Please enter your company / firm name.");
    setBusy(true);
    const client = await getClient();
    const res = await completeMyProfile(client, { name, phone, company, jobTitle, city, language });
    if (!res.ok) { setBusy(false); return setError(res.error); }
    await refresh();               // re-hydrate → profileCompleted now true
    setBusy(false);
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg-secondary grid place-items-center px-5 py-10">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-1">
          <img src="/logo-horizontal.png" alt="SiteTrack Pro" className="h-7 w-auto" />
        </div>
        <h1 className="font-display text-xl font-bold mt-3">Complete your profile</h1>
        <p className="text-[13px] text-fg-secondary mt-1 mb-4">A few details so your team and clients know who you are. You only do this once.</p>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-700 flex items-start gap-2">
            <Icon name="alert" size={15} className="text-red-600 mt-0.5" /> {error}
          </div>
        )}

        <div className="space-y-3">
          <Field label="Email">
            <input value={session.user.email} readOnly className={`${inputCls} bg-bg-secondary text-fg-secondary cursor-not-allowed`} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full name" required>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rakesh Boyapati" className={inputCls} />
            </Field>
            <Field label="Mobile / WhatsApp" required>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="10-digit mobile" inputMode="tel" className={inputCls} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Company / Firm" required>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Sri Sai Constructions" className={inputCls} />
            </Field>
            <Field label="Designation">
              <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Project Manager" className={inputCls} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="City">
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Hyderabad" className={inputCls} />
            </Field>
            <Field label="Preferred language">
              <Select value={language} onChange={e => setLanguage(e.target.value)} options={LANGS.map(l => ({ value: l.value, label: l.label }))} />
            </Field>
          </div>
        </div>

        <Button fullWidth size="lg" className="mt-5" loading={busy} onClick={submit}>
          {busy ? "Saving..." : "Save & enter workspace"}
        </Button>
      </Card>
    </div>
  );
}
