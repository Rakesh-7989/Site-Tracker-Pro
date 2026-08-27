// SiteTrack Pro — v3 GlobalSearch (top-bar search).
// Searches projects, milestones, issues, and vendors via Supabase.

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui/atoms";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuth } from "@/auth";
import { memberProjectScope } from "@/app/queries/queries";

interface SearchResult {
  type: "project" | "milestone" | "issue" | "vendor";
  title: string;
  sub: string;
  projectId: string | null;
}

export function GlobalSearch(): JSX.Element {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 1023px)");

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setResults([]); return; }
    try {
      const mod = await import("../../lib/supabase/supabase");
      const client = await mod.getSupabaseClient();
      if (!client) { setResults([]); return; }
      if (!session) { setResults([]); return; }
      const pat = `%${query.trim()}%`;
      const scope = memberProjectScope(session);

      let projectQ = client.from("projects").select("id, name, location").ilike("name", pat).limit(5);
      if (scope.mode === "member" && scope.projectIds.length > 0) projectQ = projectQ.in("id", scope.projectIds);

      const [projectsRes, milestonesRes, issuesRes] = await Promise.all([
        projectQ,
        client.from("milestones").select("id, title, project_id, projects!inner(name)").ilike("title", pat).limit(5),
        client.from("issues").select("id, title, project_id, projects!inner(name)").ilike("title", pat).limit(5),
      ]);

      const out: SearchResult[] = [];

      (projectsRes.data ?? []).forEach((r: Record<string, unknown>) => {
        out.push({ type: "project", title: String(r.name ?? ""), sub: String(r.location ?? ""), projectId: String(r.id) });
      });
      (milestonesRes.data ?? []).forEach((r: Record<string, unknown>) => {
        out.push({ type: "milestone", title: String(r.title ?? ""), sub: String((r.projects as Record<string, unknown>)?.name ?? ""), projectId: String(r.project_id) });
      });
      (issuesRes.data ?? []).forEach((r: Record<string, unknown>) => {
        out.push({ type: "issue", title: String(r.title ?? ""), sub: String((r.projects as Record<string, unknown>)?.name ?? ""), projectId: String(r.project_id) });
      });

      setResults(out.slice(0, 15));
    } catch {
      setResults([]);
    }
  }, [session]);

  useEffect(() => {
    const timer = setTimeout(() => { if (q.trim()) doSearch(q); }, 200);
    return () => clearTimeout(timer);
  }, [q, doSearch]);

  const select = (r: SearchResult) => {
    setQ("");
    setShow(false);
    if (r.projectId) {
      navigate(`/projects/${r.projectId}`);
    }
  };

  const typeColor: Record<string, string> = {
    project: "bg-info-tint text-info",
    milestone: "bg-warning-tint text-accent",
    issue: "bg-error-tint text-error",
    vendor: "bg-success-tint text-success",
  };

  return (
    <div className="relative w-full max-w-md">
      <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none" />
      <input
        ref={inputRef}
        value={q}
        onChange={e => { setQ(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder="Search projects, milestones, issues..."
        className="w-full pl-9 pr-3 py-2 bg-secondary border border-default rounded-lg text-xs outline-none focus:border-accent focus:bg-panel text-fg-primary placeholder:text-fg-tertiary"
      />
      {show && q && (
        <div className={`bg-panel border border-default overflow-y-auto z-50 ${
          isMobile
            ? "fixed inset-x-0 top-0 bottom-0 mt-0 rounded-none border-0 shadow-none"
            : "absolute top-full left-0 right-0 mt-1 rounded-xl shadow-xl max-h-96"
        }`}>
          {/* Mobile close header */}
          {isMobile && (
            <div className="sticky top-0 bg-panel border-b border-default flex items-center gap-2 px-4 py-3">
              <Icon name="search" size={16} className="text-fg-tertiary flex-shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => { setQ(e.target.value); setShow(true); }}
                placeholder="Search projects, milestones, issues..."
                className="flex-1 outline-none text-sm text-fg-primary placeholder:text-fg-tertiary"
                autoFocus
              />
              <button onClick={() => { setShow(false); setQ(""); }} className="text-sm font-semibold text-accent hover:text-accent-2">Cancel</button>
            </div>
          )}
          <div className={isMobile ? "flex-1 overflow-y-auto" : ""}>
            {results.length === 0 ? (
              <div className="p-4 text-xs text-fg-secondary text-center">No results</div>
            ) : results.map((r, i) => (
              <button
                key={i}
                onMouseDown={() => select(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-secondary border-b border-default last:border-0 flex items-center gap-3"
              >
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${typeColor[r.type]}`}>{r.type}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-fg-primary truncate">{r.title}</div>
                  <div className="text-[10px] text-fg-secondary truncate">{r.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
