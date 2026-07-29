// SiteTrack Pro — In-app Help / User Guide (/help).
// Fetches USER_GUIDE.md at runtime and renders as searchable markdown.

import { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Spinner, Alert } from "@/components/ui/atoms";

export function HelpView(): JSX.Element {
  const [md, setMd] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/USER_GUIDE.md")
      .then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((text) => { if (!cancelled) { setMd(text); setLoadState("ready"); } })
      .catch(() => { if (!cancelled) { setLoadState("error"); } });
    return () => { cancelled = true; };
  }, []);

  const toc = useMemo(() => {
    const out: Array<{ title: string; slug: string }> = [];
    const re = /^##\s+([\d.]+\s+)?(.+?)\s*$/gm;
    let m;
    while ((m = re.exec(md)) !== null) {
      const title = m[2].replace(/[*_`#]/g, "").trim();
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
      out.push({ title, slug });
    }
    return out;
  }, [md]);

  const filteredMd = useMemo(() => {
    if (!query.trim()) return md;
    const q = query.trim().toLowerCase();
    const sections = md.split(/(?=^##\s)/m);
    const matching = sections.filter((s) => s.toLowerCase().includes(q));
    return matching.length ? matching.join("\n\n") : "";
  }, [md, query]);

  if (loadState === "loading") return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (loadState === "error") return <div className="p-8"><Alert variant="danger">Failed to load user guide. Try refreshing.</Alert></div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-fg-primary">Help & User Guide</h1>
        <p className="text-fg-tertiary text-sm mt-1">Search and browse the full manual</p>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the guide…"
          className="flex-1 p-3 bg-panel border border-default rounded-xl text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="flex gap-6">
        <aside className="hidden lg:block w-56 shrink-0">
          <nav className="sticky top-24 space-y-1">
            <div className="text-xs font-bold text-fg-tertiary uppercase tracking-wider mb-2">Contents</div>
            {toc.map(s => (
              <a
                key={s.slug}
                href={`#${s.slug}`}
                className="block text-xs text-fg-secondary hover:text-accent-2 truncate py-0.5"
              >{s.title}</a>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 prose prose-sm max-w-none">
          {filteredMd
            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{filteredMd}</ReactMarkdown>
            : <div className="text-center py-16 text-fg-tertiary">No sections match your search</div>}
        </div>
      </div>
    </div>
  );
}
