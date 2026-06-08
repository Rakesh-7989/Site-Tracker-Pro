// SiteTrack Pro — my profile (route "/settings/profile"). View + edit your own
// details. Email is the primary identity and is NOT editable. Mobile shows a
// verification status (SMS OTP verification is gated behind an SMS provider —
// see the note; until then it stays "unverified").

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/auth";
import { Card, Button, Icon, Spinner, Badge } from "@/components/ui/atoms";
import { getMyProfile, completeMyProfile } from "@/app/profileQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any> {
  const mod = await import("../../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

const LANGS: Record<string, string> = { en: "English", te: "తెలుగు (Telugu)", hi: "हिंदी (Hindi)" };

export function ProfileView(): JSX.Element {
  const { session, status, refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status !== "ready" || !session) return;
    void (async () => {
      const client = await getClient();
      if (client) {
        const res = await getMyProfile(client, session.user.id);
        if (res.ok) {
          setName(res.data.name); setPhone(res.data.phone); setCompany(res.data.company);
          setJobTitle(res.data.jobTitle); setCity(res.data.city); setLanguage(res.data.language || "en");
        }
      }
      setLoading(false);
    })();
  }, [status, session]);

  if (status === "loading" || status === "idle") return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (status === "signed-out" || !session) return <Navigate to="/login" replace />;

  const inputCls = "w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white";
  const lockedCls = "w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm bg-cream-50 text-ink-500 cursor-not-allowed";

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) return setError("Enter a valid 10-digit mobile number.");
    if (!company.trim()) return setError("Company / firm is required.");
    setBusy(true);
    const client = await getClient();
    const res = await completeMyProfile(client, { name, phone, company, jobTitle, city, language });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
    setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2500);
  };

  const Row = ({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) => (
    <div className="py-2.5 border-b border-cream-100 last:border-0">
      <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-400">{label}</div>
      {children ?? <div className="text-sm text-ink-800 mt-0.5">{value || <span className="text-ink-300">—</span>}</div>}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-bold">My profile</h1>
        {!editing && <Button variant="secondary" leftIcon={<Icon name="sliders" size={15} />} onClick={() => setEditing(true)}>Edit</Button>}
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[13px] text-red-700 flex items-start gap-2"><Icon name="alert" size={15} className="text-red-600 mt-0.5" /> {error}</div>}
      {saved && <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-700">✅ Profile updated.</div>}

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-ink-900 text-white grid place-items-center font-bold">{(name || session.user.name || "U").slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="font-semibold text-ink-900">{name || session.user.name}</div>
            <div className="text-[12px] text-ink-500">{session.user.email}</div>
          </div>
        </div>

        {loading ? <div className="grid place-items-center py-8"><Spinner size={20} /></div> : !editing ? (
          <div>
            <Row label="Email (primary — not editable)" value={session.user.email} />
            <Row label="Full name" value={name} />
            <Row label="Mobile / WhatsApp">
              <div className="text-sm text-ink-800 mt-0.5 flex items-center gap-2">
                {phone || <span className="text-ink-300">—</span>}
                {phone && <Badge tone="warning">Unverified</Badge>}
              </div>
            </Row>
            <Row label="Company / Firm" value={company} />
            <Row label="Designation" value={jobTitle} />
            <Row label="City" value={city} />
            <Row label="Preferred language" value={LANGS[language] ?? language} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-400">Email (primary — not editable)</div>
              <input value={session.user.email} readOnly className={`mt-1 ${lockedCls}`} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Full name *</span><input value={name} onChange={e => setName(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Mobile / WhatsApp *</span><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" className={`mt-1 ${inputCls}`} /></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Company / Firm *</span><input value={company} onChange={e => setCompany(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Designation</span><input value={jobTitle} onChange={e => setJobTitle(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">City</span><input value={city} onChange={e => setCity(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Preferred language</span>
                <select value={language} onChange={e => setLanguage(e.target.value)} className={`mt-1 ${inputCls}`}>{Object.entries(LANGS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={save} disabled={busy} leftIcon={busy ? <Spinner size={15} /> : null}>{busy ? "Saving…" : "Save changes"}</Button>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
