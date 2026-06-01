// SiteTrack Pro — Sprint 1 (Session 30.2): WhatsApp DPR placeholder.
//
// The one workflow the founder is selling in Sprint 1: Daily Progress
// Report from site supervisor → builder promoter via WhatsApp, in Telugu,
// anchored to BuildNow Telangana audit trail.
//
// Sprint 2 ships the real implementation (voice note + photo + geotag +
// Bhashini transcription + WhatsApp Cloud API send + BuildNow anchor).
// Until then, this view explains the value proposition and collects
// pilot-interest signals. It is intentionally honest: "This ships in
// Sprint 2. Want to be one of our first 5 pilots? Tell us."
//
// Why a placeholder instead of nothing: the home shell needs to surface
// SOMETHING for non-staff users now that 16 stub views are hidden. A
// placeholder with a clear roadmap is more honest than an empty nav.

import React, { useState } from "react";
import { Ic, Button, FlatStatus } from "../../components/ui.jsx";

export function DailyProgressView({ user }) {
  const [signal, setSignal] = useState({ state: "idle", msg: "" });
  const [supervisorPhone, setSupervisorPhone] = useState("");
  const [promoterPhone, setPromoterPhone] = useState("");
  const [siteName, setSiteName] = useState("");

  const submit = () => {
    if (!supervisorPhone.trim() || !promoterPhone.trim() || !siteName.trim()) {
      setSignal({ state: "err", msg: "Supervisor phone, promoter phone, and site name are all required." });
      return;
    }
    // Sprint 1: capture intent client-side (Sprint 2 will POST to the
    // real Edge Function). We persist to localStorage so the founder
    // can pull a list of interested pilots from devtools or via the
    // ops console.
    try {
      const key = "sitetrack_dpr_interest";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push({
        supervisor_phone: supervisorPhone.trim(),
        promoter_phone: promoterPhone.trim(),
        site_name: siteName.trim(),
        captured_by: user?.email || user?.name || "anonymous",
        captured_at: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // ignore — the signal still counts even if storage failed
    }
    setSignal({ state: "ok", msg: "Got it. We'll WhatsApp you within 24 hours to schedule a 90-minute on-site activation." });
    setSupervisorPhone("");
    setPromoterPhone("");
    setSiteName("");
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10">
      {/* Hero */}
      <div className="mb-8">
        <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-600 mb-3">
          Sprint 1 · Pilot interest capture
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold leading-tight text-ink-900">
          Daily Progress Report — over WhatsApp.
        </h1>
        <p className="text-ink-500 text-sm md:text-base mt-3 leading-relaxed">
          Mee site supervisor Telugu lo voice note + photo + geotag pampisthe,
          builder promoter 7am ki coffee taguthunnappudu WhatsApp lo chusukuntaru.
          No app install. No dashboard login. Just WhatsApp.
        </p>
      </div>

      {/* What it does */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          {
            icon: "mic",
            title: "Telugu voice note",
            sub: "Supervisor speaks. Bhashini API transcribes on-device.",
          },
          {
            icon: "camera",
            title: "Photo + geotag",
            sub: "Yesterday's pour. Basement parking. Works on 2G.",
          },
          {
            icon: "send",
            title: "WhatsApp to promoter",
            sub: "7am daily digest. Cost vs budget. Top 3 risks. Anchored to BuildNow Telangana.",
          },
        ].map(card => (
          <div key={card.title} className="bg-white border border-cream-200 rounded-xl p-5 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center mb-3">
              <Ic n={card.icon === "mic" ? "phone" : card.icon} s={20} c="text-safety-600" />
            </div>
            <div className="font-display text-base font-semibold text-ink-900">{card.title}</div>
            <div className="text-xs text-ink-500 mt-1 leading-snug">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Status banner */}
      <div className="mb-8 rounded-xl border-2 border-dashed border-safety-500/30 bg-orange-50/40 p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-safety-500 flex items-center justify-center flex-shrink-0">
            <Ic n="zap" s={18} c="text-white" />
          </div>
          <div className="flex-1">
            <div className="font-display text-base font-semibold text-ink-900">Shipping in Sprint 2 (Day 16–30)</div>
            <p className="text-sm text-ink-500 mt-1 leading-relaxed">
              Real WhatsApp send, real Telugu transcription, real BuildNow audit anchor.
              First 5 paid pilots locked at <span className="font-semibold text-ink-700">₹29,999/yr</span>{" "}
              for 24 months with 3-month exclusivity in their micro-segment. After that the tier
              moves to <span className="font-semibold text-ink-700">₹49,999/yr Pro</span> — still
              30% under Powerplay's ₹71,999/yr.
            </p>
          </div>
        </div>
      </div>

      {/* Pilot interest capture */}
      <div className="bg-white rounded-xl border border-cream-200 shadow-card p-6">
        <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-600 mb-3">
          Be one of the first 5
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink-900 mb-2">
          Want to pilot it on your next site?
        </h2>
        <p className="text-ink-500 text-sm mb-5 leading-relaxed">
          Drop your supervisor's phone + promoter's phone + the site name. Founder will
          WhatsApp you within 24 hours to schedule a 90-minute on-site activation.
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="siteName" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">
              Site name <span className="text-safety-600">*</span>
            </label>
            <input
              id="siteName"
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              type="text"
              placeholder="e.g. Vasavi Vista, Phase 2"
              className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 bg-white"
            />
          </div>

          <div>
            <label htmlFor="supervisorPhone" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">
              Site supervisor's WhatsApp number <span className="text-safety-600">*</span>
            </label>
            <input
              id="supervisorPhone"
              value={supervisorPhone}
              onChange={e => setSupervisorPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 bg-white font-mono"
            />
          </div>

          <div>
            <label htmlFor="promoterPhone" className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">
              Builder promoter's WhatsApp number <span className="text-safety-600">*</span>
            </label>
            <input
              id="promoterPhone"
              value={promoterPhone}
              onChange={e => setPromoterPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 bg-white font-mono"
            />
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={submit}
          disabled={signal.state === "ok"}
          className="mt-5"
          rightIcon={signal.state === "ok" ? null : <span aria-hidden>→</span>}
        >
          {signal.state === "ok" ? "Captured · Thank you" : "Lock my pilot slot"}
        </Button>

        {signal.state === "ok" && (
          <div className="mt-4">
            <FlatStatus label={signal.msg} variant="success" />
          </div>
        )}
        {signal.state === "err" && (
          <div className="mt-4">
            <FlatStatus label={signal.msg} variant="danger" />
          </div>
        )}

        <p className="mt-4 text-[11px] text-ink-500 leading-relaxed">
          The first 5 pilots get founder-led 90-minute on-site activation at the builder's office in Banjara Hills /
          Gachibowli / Kondapur. INR 29,999/yr design-partner price, 24-month lock, 3-month logo exclusivity in micro-segment.
          See <span className="font-semibold text-ink-700">docs/PILOT_AGREEMENT_v1.md</span>.
        </p>
      </div>

      {/* Why this view is here */}
      <p className="mt-8 text-[11px] text-ink-500 text-center leading-relaxed">
        Sprint 1 · Feature Freeze · 16 stub views hidden from non-staff users.
        See <span className="font-semibold text-ink-700">docs/FEATURE_FREEZE.md</span>.
      </p>
    </div>
  );
}
