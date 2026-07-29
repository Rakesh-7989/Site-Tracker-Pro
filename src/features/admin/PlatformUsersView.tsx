import { useCallback, useEffect, useState } from "react";
import { useCan, ROLE_LABEL } from "@/auth";
import { Badge, Alert, AccessDenied } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { DataTable } from "@/components/ui/DataTable";
import { listPlatformUsers, ADMIN_PAGE_SIZE, type PlatformUser } from "@/app/platformAdminQueries";

import { getClient } from "@/lib/supabase";
const fmtDate = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const roleLabel = (r: string): string => (ROLE_LABEL as Record<string, string>)[r] ?? r;

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
  const [search, setSearch] = useState("");
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

  const columns = [
    { key: "name", header: "Name", render: (u: PlatformUser) => (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-fg-primary">{u.name || "\u2014"}</span>
        <Badge tone={u.role === "superadmin" ? "danger" : "neutral"}>{roleLabel(u.role)}</Badge>
        {u.isStaff && <Badge tone="warning">Staff</Badge>}
      </div>
    )},
    { key: "email", header: "Email", render: (u: PlatformUser) => (
      <span className="text-sm text-fg-secondary">{u.email ?? "no email"}</span>
    ), hideOnMobile: true },
    { key: "joined", header: "Joined", render: (u: PlatformUser) => (
      <span className="text-xs text-fg-tertiary">{fmtDate(u.createdAt)}</span>
    ), hideOnMobile: true },
    { key: "orgCount", header: "Orgs", className: "text-center", render: (u: PlatformUser) => (
      <div className="text-center"><div className="text-lg font-bold text-fg-primary leading-none">{u.orgCount}</div><div className="text-[10px] text-fg-tertiary uppercase tracking-wide">orgs</div></div>
    )},
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Users</h1>
        <span className="text-sm text-fg-secondary">{search ? "filtered" : `page ${page + 1}`}</span>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Input placeholder="Search by name or email\u2026" value={q} onChange={e => setQ(e.target.value)} />
      <div className="overflow-x-auto"><DataTable
        columns={columns}
        rows={rows}
        rowKey={u => u.id}
        loading={loading}
        error={error}
        emptyMessage={search ? `No users match "${search}".` : "No users."}
        variant="card"
        pagination={{ page, hasNext, busy: loading, onPrev: () => setPage(p => Math.max(0, p - 1)), onNext: () => setPage(p => p + 1) }}
      /></div>
    </div>
  );
}
