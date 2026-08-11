// SiteTrack Pro — my profile (route "/settings/profile"). View + edit your own
// details. Email is the primary identity and is NOT editable. Mobile shows a
// verification status (SMS OTP verification is gated behind an SMS provider —
// see the note; until then it stays "unverified").

import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth";
import { Card, Button, Icon, Spinner, Badge } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { getMyProfile, completeMyProfile } from "@/app/profileQueries";
import { useT } from "@/i18n/I18nProvider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { getClient } from "@/lib/supabase";
const LANGS: Record<string, string> = { en: "English", te: "à°¤à±†à°²à±à°—à± (Telugu)", hi: "à¤¹à¤¿à¤‚à¤¦à¥€ (Hindi)" };

export function ProfileView(): JSX.Element {
  const navigate = useNavigate();
  const t = useT();
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

  const inputCls = "w-full px-3.5 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-accent bg-white";
  const lockedCls = "w-full px-3.5 py-2.5 border border-border rounded-lg text-sm bg-bg-secondary text-fg-secondary cursor-not-allowed";

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError(t("profile.errName"));
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) return setError(t("profile.errPhone"));
    if (!company.trim()) return setError(t("profile.errCompany"));
    setBusy(true);
    const client = await getClient();
    const res = await completeMyProfile(client, { name, phone, company, jobTitle, city, language });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
    setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2500);
  };

  const Row = ({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) => (
    <div className="py-2.5 border-b border-border last:border-0">
      <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{label}</div>
      {children ?? <div className="text-sm text-fg-primary mt-0.5">{value || <span className="text-fg-tertiary">—</span>}</div>}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Link to="/dashboard" title={t("profile.back")} className="w-8 h-8 rounded-lg grid place-items-center text-fg-secondary hover:bg-bg-secondary transition">
            <Icon name="arrow" size={18} />
          </Link>
          <h1 className="font-display text-2xl font-bold">{t("profile.title")}</h1>
        </div>
        {!editing && <Button variant="secondary" leftIcon={<Icon name="sliders" size={15} />} onClick={() => setEditing(true)}>{t("profile.edit")}</Button>}
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[13px] text-red-700 flex items-start gap-2"><Icon name="alert" size={15} className="text-red-600 mt-0.5" /> {error}</div>}
      {saved && (
        <div className="mb-3 rounded-lg bg-success-tint border border-success p-3 text-[13px] text-success flex items-center justify-between gap-3 flex-wrap">
          <span>✅ {t("profile.updated")}</span>
          <Button size="sm" variant="secondary" onClick={() => navigate("/dashboard")}>{t("profile.goToDashboard")}</Button>
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-fg-primary text-white grid place-items-center font-bold">{(name || session.user.name || "U").slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="font-semibold text-fg-primary">{name || session.user.name}</div>
            <div className="text-[12px] text-fg-secondary">{session.user.email}</div>
          </div>
        </div>

        {loading ? <div className="grid place-items-center py-8"><Spinner size={20} /></div> : !editing ? (
          <div>
            <Row label={t("profile.emailLabel")} value={session.user.email} />
            <Row label={t("profile.fullName")} value={name} />
            <Row label={t("profile.mobile")}>
              <div className="text-sm text-fg-primary mt-0.5 flex items-center gap-2">
                {phone || <span className="text-fg-tertiary">—</span>}
                {phone && <Badge tone="warning">{t("profile.unverified")}</Badge>}
              </div>
            </Row>
            <Row label={t("profile.company")} value={company} />
            <Row label={t("profile.designation")} value={jobTitle} />
            <Row label={t("profile.city")} value={city} />
            <Row label={t("profile.prefLanguage")} value={LANGS[language] ?? language} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("profile.emailLabel")}</div>
              <input value={session.user.email} readOnly className={`mt-1 ${lockedCls}`} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("profile.fullName")} *</span><input value={name} onChange={e => setName(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("profile.mobile")} *</span><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" className={`mt-1 ${inputCls}`} /></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("profile.company")} *</span><input value={company} onChange={e => setCompany(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("profile.designation")}</span><input value={jobTitle} onChange={e => setJobTitle(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("profile.city")}</span><input value={city} onChange={e => setCity(e.target.value)} className={`mt-1 ${inputCls}`} /></label>
              <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{t("profile.prefLanguage")}</span>
                <Select className="mt-1" value={language} onChange={e => setLanguage(e.target.value)} options={Object.entries(LANGS).map(([v, l]) => ({ value: v, label: l }))} />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={save} loading={busy}>{busy ? t("profile.saving") : t("profile.save")}</Button>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>{t("profile.cancel")}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
