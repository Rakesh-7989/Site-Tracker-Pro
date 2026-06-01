// SiteTrack Pro — In-app Help / User Guide.
//
// Session 28.5: renders docs/USER_GUIDE.md inside the app so users can search
// + scroll through the full manual without leaving the workspace. The .md
// file is the single source of truth — we copy it to public/USER_GUIDE.md
// at build time and fetch at runtime so docs updates ship with every deploy.
//
// Why a runtime fetch (vs build-time inline):
//   1. Keeps the help chunk small (markdown is plain text, not JS).
//   2. Lets us swap languages later (USER_GUIDE.te.md / .hi.md) without
//      rebuilding.
//   3. Makes the doc cacheable independently of the SPA shell.

import React, { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function HelpView() {
  const [md, setMd] = useState("");
  const [loadState, setLoadState] = useState("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/USER_GUIDE.md")
      .then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((text) => { if (!cancelled) { setMd(text); setLoadState("ready"); } })
      .catch((err) => { if (!cancelled) { setLoadState("error"); console.warn("Failed to load USER_GUIDE.md:", err); } });
    return () => { cancelled = true; };
  }, []);

  // ── Table-of-contents — parse top-level ## headings ──
  const toc = useMemo(() => {
    const out = [];
    const re = /^##\s+([\d.]+\s+)?(.+?)\s*$/gm;
    let m;
    while ((m = re.exec(md)) !== null) {
      const title = m[2].replace(/[*_`#]/g, "").trim();
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
      out.push({ title, slug });
    }
    return out;
  }, [md]);

  // ── Filter: keep sections whose body matches the search ──
  const filteredMd = useMemo(() => {
    if (!query.trim()) return md;
    const q = query.trim().toLowerCase();
    const sections = md.split(/(?=^##\s)/m);
    const matching = sections.filter((s) => s.toLowerCase().includes(q));
    return matching.length ? matching.join("\n\n") : `## No results for "${query}"\n\nTry simpler keywords or browse the sidebar.`;
  }, [md, query]);

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        {/* Header */}
        <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-orange-600 mb-1">— USER GUIDE</div>
            <h1 className="text-3xl lg:text-4xl font-display font-semibold text-ink-900">How to use SiteTrack Pro</h1>
            <p className="text-ink-700 mt-2 max-w-2xl">
              Full manual — concepts, daily workflows by role, 17 sub-tabs, Org Admin panels, integrations, troubleshooting, glossary.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/USER_GUIDE.md"
              download="SiteTrack-User-Guide.md"
              className="text-xs font-semibold text-ink-700 hover:text-ink-900 bg-white border border-cream-200 rounded-lg px-3 py-2 shadow-card transition-colors"
            >
              Download .md
            </a>
            <a
              href="https://github.com/Rakesh-7989/Site-Tracker-Pro/blob/main/docs/USER_GUIDE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-white bg-ink-900 hover:bg-ink-700 rounded-lg px-3 py-2 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* Search box */}
        <div className="mb-6">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide… (e.g. RA Bill, magic link, BOQ paste, vendor)"
            className="w-full px-4 py-3 bg-white border border-cream-200 rounded-xl shadow-card text-ink-900 placeholder-ink-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition"
          />
        </div>

        {/* Two-column layout: TOC + content */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 lg:gap-10">
          {/* TOC sidebar (desktop) */}
          <aside className="hidden lg:block">
            <nav className="sticky top-6 max-h-[calc(100vh-5rem)] overflow-y-auto pr-2">
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-3">— Contents</div>
              <ol className="space-y-1 text-sm">
                {toc.map((item, idx) => (
                  <li key={item.slug}>
                    <a
                      href={`#${item.slug}`}
                      onClick={(e) => {
                        const target = document.getElementById(item.slug);
                        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth", block: "start" }); }
                      }}
                      className="block py-1.5 px-2 -ml-2 rounded text-ink-700 hover:text-ink-900 hover:bg-white transition"
                    >
                      <span className="text-ink-500 font-mono text-[10px] mr-2">{String(idx + 1).padStart(2, "0")}</span>
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          {/* Content */}
          <article className="bg-white rounded-2xl shadow-card border border-cream-200 p-6 sm:p-8 lg:p-10">
            {loadState === "loading" && (
              <div className="py-20 text-center text-ink-500">Loading user guide…</div>
            )}
            {loadState === "error" && (
              <div className="py-20 text-center">
                <p className="text-red-700 font-semibold mb-2">Couldn't load the user guide.</p>
                <p className="text-ink-500 text-sm">Check your network or read it on GitHub:</p>
                <a
                  href="https://github.com/Rakesh-7989/Site-Tracker-Pro/blob/main/docs/USER_GUIDE.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm text-orange-700 underline"
                >
                  USER_GUIDE.md on GitHub →
                </a>
              </div>
            )}
            {loadState === "ready" && (
              <div className="user-guide-prose">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-3xl lg:text-4xl font-display font-bold text-ink-900 mb-6 mt-2">{children}</h1>,
                    h2: ({ children }) => {
                      const text = String(children).replace(/^\d+\.\s+/, "").trim();
                      const slug = text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
                      return (
                        <h2 id={slug} className="text-2xl font-display font-semibold text-ink-900 mt-12 mb-4 scroll-mt-6 border-t border-cream-200 pt-8 first:border-t-0 first:pt-0 first:mt-0">{children}</h2>
                      );
                    },
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-ink-800 mt-8 mb-3">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-base font-semibold text-ink-800 mt-6 mb-2">{children}</h4>,
                    p: ({ children }) => <p className="text-ink-700 leading-relaxed mb-4">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-4 space-y-1.5 text-ink-700">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-4 space-y-1.5 text-ink-700">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target={href?.startsWith("http") ? "_blank" : undefined}
                        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="text-orange-700 underline hover:text-orange-800"
                      >
                        {children}
                      </a>
                    ),
                    code: ({ inline, children }) =>
                      inline
                        ? <code className="font-mono text-[0.85em] bg-cream-200 text-ink-900 px-1.5 py-0.5 rounded">{children}</code>
                        : <code className="block font-mono text-xs bg-ink-900 text-cream-100 p-4 rounded-lg overflow-x-auto leading-relaxed">{children}</code>,
                    pre: ({ children }) => <pre className="bg-ink-900 text-cream-100 p-4 rounded-lg overflow-x-auto text-xs mb-4 font-mono leading-relaxed">{children}</pre>,
                    blockquote: ({ children }) => <blockquote className="border-l-4 border-orange-500 bg-orange-50 px-4 py-2 italic text-ink-700 mb-4 rounded-r">{children}</blockquote>,
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full border-collapse text-sm">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="border-b-2 border-ink-900">{children}</thead>,
                    th: ({ children }) => <th className="text-left py-2 px-3 font-semibold text-ink-900 text-[11px] uppercase tracking-wider">{children}</th>,
                    td: ({ children }) => <td className="py-2 px-3 border-b border-cream-200 text-ink-700 align-top">{children}</td>,
                    hr: () => <hr className="my-10 border-t border-cream-200" />,
                    strong: ({ children }) => <strong className="font-semibold text-ink-900">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                  }}
                >
                  {filteredMd}
                </ReactMarkdown>
              </div>
            )}
          </article>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center text-xs text-ink-500">
          Need more help? Email <a href="mailto:hello@sitetrack.in" className="text-orange-700 underline">hello@sitetrack.in</a> · WhatsApp +91 78989 71337
        </div>
      </div>
    </div>
  );
}

export default HelpView;
