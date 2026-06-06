// SiteTrack Pro — public landing page (route "/"). Hero + value props + plan
// teaser + CTAs. Logged-in users are bounced to the dashboard.

import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Icon, Badge, Spinner } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";
import { PLAN_TIERS } from "./plans";
import { CONTACT_EMAIL } from "./legalContent";

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "clipboard", title: "Daily site reports", body: "Voice-to-text DPRs, photos with geo-tags, and a promoter digest — from the field, in minutes." },
  { icon: "wallet", title: "Money under control", body: "POs, invoices, RA bills, budget vs actuals and a ledger that every stakeholder can trust." },
  { icon: "shield", title: "Compliance built-in", body: "RERA stages, GST, EPFO, approval chains and an immutable audit trail — nothing slips." },
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
  if (status === "loading" || status === "idle") {
    return <div className="min-h-screen grid place-items-center bg-cream-50"><Spinner size={26} /></div>;
  }
  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-cream-50 text-ink-900">
      {/* Nav */}
      <header className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm font-semibold text-ink-600 hover:text-ink-900 px-3 py-2">Sign in</Link>
          <Link to="/signup" className="text-sm font-semibold text-white bg-safety-500 hover:bg-safety-600 px-4 py-2 rounded-lg transition">Sign up</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-5 pt-12 pb-16 text-center">
        <Badge tone="warning">Built for Indian construction firms</Badge>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl font-bold leading-tight">
          Run every site from one place.
        </h1>
        <p className="mt-4 text-lg text-ink-600 max-w-2xl mx-auto">
          SiteTrack Pro brings daily reports, finance, materials, labour and compliance into a single
          workspace your promoters, PMs and site engineers actually use.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/signup" className="text-base font-semibold text-white bg-safety-500 hover:bg-safety-600 px-6 py-3 rounded-xl transition inline-flex items-center gap-2">
            Get started <Icon name="arrow" size={16} className="rotate-180" />
          </Link>
          <Link to="/login" className="text-base font-semibold text-ink-700 hover:text-ink-900 px-6 py-3 rounded-xl border border-cream-300">Sign in</Link>
        </div>
        <p className="mt-3 text-xs text-ink-400">No credit card. Your workspace is activated after a quick review.</p>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-5 pb-16 grid sm:grid-cols-3 gap-4">
        {FEATURES.map(f => (
          <Card key={f.title} className="p-5">
            <div className="w-10 h-10 rounded-xl bg-safety-50 text-safety-600 grid place-items-center mb-3"><Icon name={f.icon} size={20} /></div>
            <div className="font-semibold text-ink-800">{f.title}</div>
            <div className="text-sm text-ink-500 mt-1">{f.body}</div>
          </Card>
        ))}
      </section>

      {/* Plans teaser */}
      <section className="max-w-5xl mx-auto px-5 pb-20">
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl font-bold">Plans for every firm size</h2>
          <p className="text-sm text-ink-500 mt-1">Pick a plan when you sign up — change it any time.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {PLAN_TIERS.map(p => (
            <Card key={p.id} className={`p-5 relative ${p.popular ? "ring-2 ring-safety-400" : ""}`}>
              {p.popular && <div className="absolute -top-2 left-1/2 -translate-x-1/2"><Badge tone="warning">Most popular</Badge></div>}
              <div className="font-display font-bold text-lg">{p.name}</div>
              <div className="text-2xl font-bold mt-1">{p.price}<span className="text-sm font-normal text-ink-400">{p.cadence}</span></div>
              <div className="text-xs text-ink-500 mt-0.5">{p.tagline}</div>
              <ul className="mt-3 space-y-1.5">
                {p.features.slice(0, 4).map(ft => (
                  <li key={ft} className="text-sm text-ink-600 flex items-start gap-1.5"><Icon name="check" size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" /> {ft}</li>
                ))}
              </ul>
              <Link to={`/signup?plan=${p.id}`} className="mt-4 block text-center text-sm font-semibold text-white bg-safety-500 hover:bg-safety-600 py-2 rounded-lg transition">Choose {p.name}</Link>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-cream-200 py-6 text-center text-xs text-ink-400 space-y-1">
        <div>
          <Link to="/privacy" className="hover:text-ink-600">Privacy Policy</Link>
          {" · "}
          <Link to="/terms" className="hover:text-ink-600">Terms of Service</Link>
          {" · "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink-600">Contact</a>
        </div>
        <div>© SiteTrack Pro · GiggleZen Technologies · Hyderabad</div>
      </footer>
    </div>
  );
}
