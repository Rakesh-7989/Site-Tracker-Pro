// SiteTrack Pro — public legal pages (/privacy, /terms). Renders the content
// from legalContent.ts with the marketing chrome.

import { Link } from "react-router-dom";
import { PRIVACY, TERMS, LAST_UPDATED, PRODUCT, type LegalSection } from "./legalContent";

function Logo(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src="/logo-horizontal.png" alt={PRODUCT} className="h-8 w-auto" />
    </Link>
  );
}

function LegalDoc({ title, sections }: { title: string; sections: LegalSection[] }): JSX.Element {
  return (
    <div className="min-h-screen bg-panel text-fg-primary">
      <header className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo />
        <Link to="/" className="text-sm font-semibold text-fg-secondary hover:text-fg-primary">← Home</Link>
      </header>
      <main className="max-w-3xl mx-auto px-5 pb-16">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="text-xs text-fg-tertiary mt-1">Last updated: {LAST_UPDATED}</p>
        <div className="mt-6 space-y-6">
          {sections.map(s => (
            <section key={s.heading}>
              <h2 className="font-display text-lg font-bold text-fg-primary">{s.heading}</h2>
              <div className="mt-1.5 space-y-2">
                {s.body.map((p, i) => <p key={i} className="text-sm text-fg-secondary leading-relaxed">{p}</p>)}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-default text-xs text-fg-tertiary">
          <Link to="/privacy" className="text-accent hover:text-accent-2 font-semibold">Privacy Policy</Link>
          {" · "}
          <Link to="/terms" className="text-accent hover:text-accent-2 font-semibold">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}

export function PrivacyView(): JSX.Element { return <LegalDoc title="Privacy Policy" sections={PRIVACY} />; }
export function TermsView(): JSX.Element { return <LegalDoc title="Terms of Service" sections={TERMS} />; }
