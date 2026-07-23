import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import type { IconName } from "@/components/ui/icons";
import { globalSearch, hitUrl, type SearchHit, type SearchKind } from "@/app/searchQueries";

import { getClient } from "@/lib/supabase";
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
          <div className="w-8 h-8 rounded-lg bg-cream-100 text-ink-500 grid place-items-center flex-shrink-0"><Icon name={m.icon} size={16} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink-800 truncate">{h.label}</div>
            {h.sublabel && <div className="text-[11px] text-ink-400 truncate">{h.sublabel}</div>}
          </div>
          <Badge tone={m.tone}>{m.label}</Badge>
        </div>
      );
    }},
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink-900">Search</h1>
      <div className="relative">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input autoFocus className="pl-9" placeholder="Search projects, vendors, milestones, tasks\u2026" value={q}
          onChange={e => { setQ(e.target.value); setParams(e.target.value.trim() ? { q: e.target.value } : {}, { replace: true }); }} />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {q.trim().length < 2 ? <div className="text-sm text-ink-400">Type at least 2 characters.</div>
        : loading ? <div className="grid place-items-center py-8"><Spinner size={22} /></div>
        : hits.length === 0 && searched ? <div className="text-sm text-ink-400 text-center py-8">No matches for &ldquo;{q.trim()}&rdquo;.</div>
        : <DataTable
            columns={columns}
            rows={hits}
            rowKey={h => `${h.kind}-${h.id}`}
            variant="card"
            onRowClick={h => navigate(hitUrl(h))}
          />}
    </div>
  );
}
