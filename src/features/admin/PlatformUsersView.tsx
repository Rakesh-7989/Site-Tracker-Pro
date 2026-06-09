// SiteTrack Pro — platform Users (/admin/users, superadmin). Cross-tenant list
// of every user (profile + auth email) with org membership count. Read-only.

import { useCallback, useEffect, useState } from "react";
import { useCan, ROLE_LABEL } from "@/auth";
import { Card, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { listPlatformUsers, ADMIN_PAGE_SIZE, type PlatformUser } from "@/app/platformAdminQueries";
import { Pager } from "@/components/ui/Pager";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const roleLabel = (r: string): string => (ROLE_LABEL as any)[r] ?? r;

export function PlatformUsersView(): JSX.Element {
  const can = useCan("platform:users:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  return <Inner />;
}

function Inner(): JSX.Element {
  const [rows, setRows] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");   // debounced, server-side
  const [page, setPage] = useState(0);

  useEffect(() => { const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPlatformUsers(client, { limit: ADMIN_PAGE_SIZE, offset: page * ADMIN_PAGE_SIZE, search });
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [page, search]);
  useEffect(() => { void reload(); }, [reload]);

  const hasNext = rows.length === ADMIN_PAGE_SIZE;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-ink-900">Users</h1>
        <span className="text-sm text-ink-500">{search ? "filtered" : `page ${page + 1}`}</span>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Input placeholder="Search by name or email…" value={q} onChange={e => setQ(e.target.value)} />
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div>
        : rows.length === 0 ? <Card className="p-8 text-center text-sm text-ink-500"><Icon name="users" size={24} className="mx-auto text-ink-300 mb-2" />No users{search ? " match your search." : "."}</Card>
        : <><div className="space-y-2">{rows.map(u => (
            <Card key={u.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink-900 truncate">{u.name || "—"}</span>
                  <Badge tone={u.role === "superadmin" ? "danger" : "neutral"}>{roleLabel(u.role)}</Badge>
                  {u.isStaff && <Badge tone="warning">Staff</Badge>}
                </div>
                <div className="text-[11px] text-ink-400">{u.email ?? "no email"} · joined {fmtDate(u.createdAt)}</div>
              </div>
              <div className="flex-shrink-0 text-center"><div className="text-lg font-bold text-ink-900 leading-none">{u.orgCount}</div><div className="text-[10px] text-ink-400 uppercase tracking-wide">orgs</div></div>
            </Card>
          ))}</div>
          <Pager page={page} hasNext={hasNext} busy={loading} onPrev={() => setPage(p => Math.max(0, p - 1))} onNext={() => setPage(p => p + 1)} />
          </>}
    </div>
  );
}
