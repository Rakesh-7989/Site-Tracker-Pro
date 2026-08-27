import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";
import type { IconName } from "@/components/ui/icons";
import { globalSearch, hitUrl, type SearchHit, type SearchKind } from "@/app/queries/searchQueries";

import { getClient } from "@/lib/supabase/supabase";
const KIND_META: Record<SearchKind, { label: string; icon: IconName; tone: "info" | "neutral" | "warning" | "success" }> = {
  project: { label: "Project", icon: "folder", tone: "info" },
  vendor: { label: "Vendor", icon: "truck", tone: "neutral" },
  milestone: { label: "Milestone", icon: "flag", tone: "warning" },
  task: { label: "Task", icon: "check", tone: "success" },
};

export function GlobalSearchView(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) { setHits([]); setSearched(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true); setError(null);
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const res = await globalSearch(client, term);
      if (res.ok) setHits(res.data); else setError(res.error);
      setSearched(true); setLoading(false);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const columns = [
    { key: "result", header: "Result", render: (h: SearchHit) => {
      const m = KIND_META[h.kind];
      return (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-secondary text-fg-secondary grid place-items-center flex-shrink-0"><Icon name={m.icon} size={16} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-fg-primary truncate">{h.label}</div>
            {h.sublabel && <div className="text-[11px] text-fg-tertiary truncate">{h.sublabel}</div>}
          </div>
          <Badge tone={m.tone}>{m.label}</Badge>
        </div>
      );
    }},
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Search</h1>
      <div className="relative">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary" />
        <Input autoFocus className="pl-9" placeholder="Search projects, vendors, milestones, tasks\u2026" value={q}
          onChange={e => { setQ(e.target.value); setParams(e.target.value.trim() ? { q: e.target.value } : {}, { replace: true }); }} />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {q.trim().length < 2 ? <div className="text-sm text-fg-tertiary">Type at least 2 characters.</div>
        : loading ? <div role="status" aria-label="Loading search results" aria-busy="true" className="space-y-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
                <Skeleton decorative height={32} width="w-8" />
                <div className="flex-1 space-y-2">
                  <Skeleton decorative height={12} width="w-1/3" />
                  <Skeleton decorative height={10} width="w-1/4" />
                </div>
                <Skeleton decorative height={20} width="w-16" />
              </div>
            ))}
          </div>
        : hits.length === 0 && searched ? <div className="text-sm text-fg-tertiary text-center py-8">No matches for &ldquo;{q.trim()}&rdquo;.</div>
        : <DataTable
            dense
            columns={columns}
            rows={hits}
            rowKey={h => `${h.kind}-${h.id}`}
            variant="card"
            onRowClick={h => navigate(hitUrl(h))}
          />}
    </div>
  );
}
