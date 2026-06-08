// SiteTrack Pro — public landing page (route "/"). Professional marketing site:
// hero → trust bar → problem → features → how-it-works → who-it's-for → why-us →
// pricing → FAQ → final CTA → footer. Logged-in users are bounced to dashboard.
//
// Claims are limited to capabilities the product actually ships (feature-freeze
// guardrail) — no fabricated testimonials or customer logos.

import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Icon, Badge } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";
import { PLAN_TIERS, priceFor, gstInclusive, formatINR, type BillingPeriod } from "./plans";
import { CONTACT_EMAIL } from "./legalContent";

function BillingToggle({ value, onChange }: { value: BillingPeriod; onChange: (p: BillingPeriod) => void }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-cream-100 border border-cream-200">
      <button type="button" onClick={() => onChange("monthly")}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${value === "monthly" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}>
        Monthly
      </button>
      <button type="button" onClick={() => onChange("annual")}
        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition inline-flex items-center gap-1.5 ${value === "annual" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"}`}>
        Annual <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">2 months free</span>
      </button>
    </div>
  );
}

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "clipboard", title: "Daily site reports", body: "Voice-to-text DPRs in Telugu, geo-tagged photos and a promoter digest — from the field, in minutes." },
  { icon: "wallet", title: "Money under control", body: "POs, invoices, RA bills, budget vs actuals and a ledger every stakeholder can trust." },
  { icon: "shield", title: "Compliance built-in", body: "RERA stages, GST, EPFO, approval chains and an immutable audit trail — nothing slips." },
  { icon: "truck", title: "Materials & labour", body: "Indents, stock, attendance and wage registers — all linked to the right project." },
  { icon: "doc", title: "Drawings & RFIs", body: "Latest drawings, revisions, RFIs and change orders. No more “which version is this?”." },
  { icon: "users", title: "Role-based access", body: "Promoters, PMs, site engineers, contractors and clients each see exactly what they should." },
];

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "check", title: "Sign up & pick a plan", body: "Start with a 14-day free trial — no credit card needed." },
  { icon: "users", title: "Add projects & team", body: "Invite by email or WhatsApp and set roles in minutes." },
  { icon: "phone", title: "Run from the field", body: "Your team logs reports, bills and photos from any phone." },
];

const WHO = ["Promoters & owners", "Project managers", "Site engineers", "Contractors", "Architects", "Clients"];

const WHY: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "hardhat", title: "Construction-native", body: "Built for sites — DPRs, RA bills, RERA — not a generic project tool bent to fit." },
  { icon: "msgcircle", title: "Speaks your language", body: "Telugu, Hindi and English, with voice input so the field actually uses it." },
  { icon: "zap", title: "Built for the field", body: "Works on any phone, over WhatsApp, even when the site has poor signal." },
  { icon: "lock", title: "Secure & compliant", body: "Encrypted data, role-based access and a tamper-evident audit trail." },
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: "Is there a free trial?", a: "Yes — every plan starts with a 14-day free trial. No credit card required." },
  { q: "Can my site team use it in Telugu?", a: "Yes. The app works in Telugu, Hindi and English, and daily reports support voice input." },
  { q: "Do you support RERA and GST?", a: "Yes — RERA stage tracking, GST and e-invoice are built in (availability varies by plan)." },
  { q: "Is my data safe?", a: "Your data is encrypted, access is role-based, and every change is recorded in an audit trail." },
  { q: "Can I change plans later?", a: "Anytime. Upgrade from your billing page, or send an upgrade request and our team helps you move up." },
  { q: "Do you help with setup?", a: "Yes. We help you create your first projects and onboard your team so you're productive from day one." },
];

function Logo(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-safety-500 text-white grid place-items-center font-display font-bold">S</div>
      <span className="font-display text-lg font-bold text-ink-900">SiteTrack Pro</span>
    </div>
  );
}

export function LandingView(): JSX.Element {
  const { session, status } = useAuth();
  const [billing, setBilling] = useState<BillingPeriod>("annual");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // Render INSTANTLY — never gate on auth loading. Redirect only once a
  // logged-in session is confirmed.
  if (status === "ready" && session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-cream-50 text-ink-900">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-cream-50/85 backdrop-blur border-b border-cream-200/70">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <a href="#features" className="hidden sm:inline text-sm font-semibold text-ink-600 hover:text-ink-900 px-3 py-2">Features</a>
            <a href="#pricing" className="hidden sm:inline text-sm font-semibold text-ink-600 hover:text-ink-900 px-3 py-2">Pricing</a>
            <Link to="/login" className="text-sm font-semibold text-ink-600 hover:text-ink-900 px-3 py-2">Sign in</Link>
            <Link to="/signup" className="text-sm font-semibold text-white bg-safety-500 hover:bg-safety-600 px-4 py-2 rounded-lg transition">Start free</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-5 pt-16 pb-12 text-center">
        <Badge tone="warning">Built for Indian construction firms</Badge>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl font-bold leading-tight">
          Run every site from one place.
        </h1>
        <p className="mt-4 text-lg text-ink-600 max-w-2xl mx-auto">
          SiteTrack Pro brings daily reports, finance, materials, labour and compliance into a single
          workspace your promoters, PMs and site engineers actually use — in Telugu, Hindi or English.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/signup" className="text-base font-semibold text-white bg-safety-500 hover:bg-safety-600 px-6 py-3 rounded-xl transition inline-flex items-center gap-2">
            Start 14-day free trial <Icon name="arrow" size={16} className="rotate-180" />
          </Link>
          <a href="#features" className="text-base font-semibold text-ink-700 hover:text-ink-900 px-6 py-3 rounded-xl border border-cream-300">See how it works</a>
        </div>
        <p className="mt-3 text-xs text-ink-400">No credit card · Works on WhatsApp · Telugu / Hindi / English</p>
      </section>

      {/* Trust bar */}
      <div className="border-y border-cream-200 bg-white/60">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-semibold text-ink-500">
          {["RERA-ready", "GST & e-invoice", "Telugu · Hindi · English", "WhatsApp-first", "Works on any phone"].map(t => (
            <span key={t} className="inline-flex items-center gap-1.5"><Icon name="check" size={14} className="text-emerald-500" /> {t}</span>
          ))}
        </div>
      </div>

      {/* Problem */}
      <section className="max-w-3xl mx-auto px-5 pt-16 pb-4 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-bold">Site updates lost in WhatsApp. Bills in ten Excel sheets.</h2>
        <p className="mt-3 text-ink-600">When every project lives in chat threads and spreadsheets, nobody trusts the numbers and the promoter is always the last to know. SiteTrack Pro gives you one record everyone works from.</p>
      </section>

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-5 pt-10 pb-16 scroll-mt-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <Card key={f.title} className="p-5">
              <div className="w-10 h-10 rounded-xl bg-safety-50 text-safety-600 grid place-items-center mb-3"><Icon name={f.icon} size={20} /></div>
              <div className="font-semibold text-ink-800">{f.title}</div>
              <div className="text-sm text-ink-500 mt-1">{f.body}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-cream-200">
        <div className="max-w-5xl mx-auto px-5 py-16">
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl font-bold">Up and running in a day</h2>
            <p className="text-sm text-ink-500 mt-1">No long implementation. No IT team needed.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-safety-500 text-white grid place-items-center font-bold text-sm">{i + 1}</div>
                  <Icon name={s.icon} size={18} className="text-ink-400" />
                </div>
                <div className="font-semibold text-ink-800">{s.title}</div>
                <div className="text-sm text-ink-500 mt-1">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="max-w-4xl mx-auto px-5 py-14 text-center">
        <h2 className="font-display text-2xl font-bold">One workspace, every role</h2>
        <p className="text-sm text-ink-500 mt-1 mb-5">Everyone sees exactly what they need — and nothing they shouldn't.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {WHO.map(r => (
            <span key={r} className="text-sm font-semibold text-ink-700 bg-white border border-cream-200 rounded-full px-4 py-2">{r}</span>
          ))}
        </div>
      </section>

      {/* Why SiteTrack */}
      <section className="bg-white border-y border-cream-200">
        <div className="max-w-5xl mx-auto px-5 py-16">
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl font-bold">Why builders choose SiteTrack Pro</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {WHY.map(w => (
              <div key={w.title} className="flex items-start gap-3 p-4 rounded-xl border border-cream-200">
                <div className="w-10 h-10 rounded-xl bg-safety-50 text-safety-600 grid place-items-center flex-shrink-0"><Icon name={w.icon} size={20} /></div>
                <div>
                  <div className="font-semibold text-ink-800">{w.title}</div>
                  <div className="text-sm text-ink-500 mt-0.5">{w.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-5 py-16 scroll-mt-20">
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl font-bold">Simple, per-firm pricing</h2>
          <p className="text-sm text-ink-500 mt-1">Priced per organization — add your whole team, not per seat.</p>
          <div className="mt-4 flex justify-center"><BillingToggle value={billing} onChange={setBilling} /></div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
            <Icon name="check" size={14} /> Every plan starts with a 14-day free trial — no credit card
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {PLAN_TIERS.map(p => {
            const pr = priceFor(p, billing);
            return (
            <Card key={p.id} className={`p-5 relative ${p.popular ? "ring-2 ring-safety-400" : ""}`}>
              {p.popular && <div className="absolute -top-2 left-1/2 -translate-x-1/2"><Badge tone="warning">Most popular</Badge></div>}
              <div className="font-display font-bold text-lg">{p.name}</div>
              <div className="text-2xl font-bold mt-1">{pr.amount}<span className="text-sm font-normal text-ink-400">{pr.cadence}</span></div>
              {billing === "annual"
                ? <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">{pr.effectiveMonthly} · save {pr.savingsAmount} ({pr.savingsPct}%)</div>
                : <div className="text-[11px] text-ink-400 mt-0.5">or pay yearly &amp; save ~17%</div>}
              <div className="text-[10px] text-ink-400 mt-0.5">+ 18% GST · {formatINR(gstInclusive(billing === "annual" ? p.annual : p.monthly))} incl.</div>
              <div className="text-xs text-ink-500 mt-1">{p.tagline}</div>
              <ul className="mt-3 space-y-1.5">
                {p.features.slice(0, 5).map(ft => (
                  <li key={ft} className="text-sm text-ink-600 flex items-start gap-1.5"><Icon name="check" size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" /> {ft}</li>
                ))}
              </ul>
              <Link to={`/signup?plan=${p.id}&billing=${billing}`} className="mt-4 block text-center text-sm font-semibold text-white bg-safety-500 hover:bg-safety-600 py-2 rounded-lg transition">Start free with {p.name}</Link>
            </Card>
            );
          })}
        </div>

        {/* Enterprise — sales-led */}
        <Card className="mt-4 p-5 flex items-center justify-between gap-4 flex-wrap border-ink-200">
          <div>
            <div className="font-display font-bold text-lg">Enterprise</div>
            <div className="text-sm text-ink-500 mt-0.5">Custom roles &amp; permissions, SSO, white-label client portal, API access, dedicated CSM &amp; on-prem audit mirror. For pan-state / multi-org builders.</div>
          </div>
          <a href={`mailto:${CONTACT_EMAIL}?subject=SiteTrack%20Enterprise%20enquiry`} className="text-sm font-semibold text-ink-700 hover:text-ink-900 px-5 py-2.5 rounded-lg border border-cream-300 whitespace-nowrap">Contact sales</a>
        </Card>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-5 pb-16">
        <h2 className="font-display text-2xl font-bold text-center mb-6">Questions, answered</h2>
        <div className="space-y-2">
          {FAQ.map((f, i) => (
            <Card key={f.q} className="p-0 overflow-hidden">
              <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left">
                <span className="font-semibold text-ink-800">{f.q}</span>
                <Icon name="chevron" size={16} className={`text-ink-400 transition-transform flex-shrink-0 ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && <div className="px-5 pb-4 -mt-1 text-sm text-ink-600">{f.a}</div>}
            </Card>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-5 pb-20">
        <div className="rounded-2xl bg-ink-900 text-white px-6 py-12 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">Ready to run your sites from one place?</h2>
          <p className="mt-2 text-ink-300">Start free in two minutes. Bring your team in today.</p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/signup" className="text-base font-semibold text-white bg-safety-500 hover:bg-safety-600 px-6 py-3 rounded-xl transition">Start 14-day free trial</Link>
            <Link to="/login" className="text-base font-semibold text-ink-200 hover:text-white px-6 py-3 rounded-xl border border-ink-700">Sign in</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-cream-200 py-8 text-center text-xs text-ink-400 space-y-2">
        <div className="flex justify-center"><Logo /></div>
        <div className="pt-1">
          <Link to="/privacy" className="hover:text-ink-600">Privacy Policy</Link>
          {" · "}
          <Link to="/terms" className="hover:text-ink-600">Terms of Service</Link>
          {" · "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink-600">Contact</a>
        </div>
        <div>© SiteTrack Pro · GiggleZen Technologies · Hyderabad, India</div>
      </footer>
    </div>
  );
}
