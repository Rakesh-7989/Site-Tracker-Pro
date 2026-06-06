// SiteTrack Pro — public legal pages (/privacy, /terms). Renders the content
// from legalContent.ts with the marketing chrome.

import { Link } from "react-router-dom";
import { PRIVACY, TERMS, LAST_UPDATED, PRODUCT, type LegalSection } from "./legalContent";

function Logo(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-safety-500 text-white grid place-items-center font-display font-bold">S</div>
      <span className="font-display text-lg font-bold text-ink-900">{PRODUCT}</span>
    </Link>
  );
}

function LegalDoc({ title, sections }: { title: string; sections: LegalSection[] }): JSX.Element {
  return (
    <div className="min-h-screen bg-cream-50 text-ink-900">
      <header className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo />
        <Link to="/" className="text-sm font-semibold text-ink-600 hover:text-ink-900">← Home</Link>
      </header>
      <main className="max-w-3xl mx-auto px-5 pb-16">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="text-xs text-ink-400 mt-1">Last updated: {LAST_UPDATED}</p>
        <div className="mt-6 space-y-6">
          {sections.map(s => (
            <section key={s.heading}>
              <h2 className="font-display text-lg font-bold text-ink-800">{s.heading}</h2>
              <div className="mt-1.5 space-y-2">
                {s.body.map((p, i) => <p key={i} className="text-sm text-ink-600 leading-relaxed">{p}</p>)}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-cream-200 text-xs text-ink-400">
          <Link to="/privacy" className="text-safety-600 hover:text-safety-700 font-semibold">Privacy Policy</Link>
          {" · "}
          <Link to="/terms" className="text-safety-600 hover:text-safety-700 font-semibold">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}

export function PrivacyView(): JSX.Element { return <LegalDoc title="Privacy Policy" sections={PRIVACY} />; }
export function TermsView(): JSX.Element { return <LegalDoc title="Terms of Service" sections={TERMS} />; }
