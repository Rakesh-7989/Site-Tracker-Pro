// SiteTrack Pro — v3 projects list with lifecycle management (P-B) + redesign (P-C).
//
// Lists the active org's projects via the typed query helper. Adds:
//   * lifecycle filter chips (All / Active / Paused / On hold / Deactivated /
//     Completed / Cancelled / Archived);
//   * stat strip (live / paused+hold / completed / cancelled / archived) from
//     the pure `projectRollup` helper;
//   * client-side search (name / location / client / description) + sort
//     (name / status / location / progress / budget / start date);
//   * richer cards: progress bar, budget, dates, client, description;
//   * per-card lifecycle actions menu (pause / hold / deactivate / reactivate /
//     complete / cancel / archive / restore / delete) — capability-gated.
// RLS (`update_project_architect`, migration 116) enforces writes server-side.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useOrgSwitcher, useCan, RequireCapability } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { cn } from "@/lib/utils/cn";
import { getClient } from "@/lib/supabase/supabase";
import type { TypedSupabaseClient } from "@/lib/supabase/db";
import {
  listProjectsForOrg, memberProjectScope, type ProjectSummary,
  setProjectStatus, archiveProject, restoreProject, deleteProject,
} from "@/app/queries/queries";
import { fmtCompactRupees } from "@/app/queries/financeQueries";
import { Card, Button, Icon, Spinner, Badge, Alert, StatCard, ProgressBar } from "@/components/ui/atoms";
import { DropdownMenu, DropdownItem } from "@/components/ui";
import { Input, Select } from "@/components/ui/forms";
import {
  filterProjects, projectRollup, sortProjects, PROJECT_SORT_KEYS,
  type ProjectSortKey, type SortDirection,
} from "@/lib/projectList";
import {
  asProjectLifecycleStatus,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  isProjectLifecycleStatus,
  lifecycleActions,
  type ProjectLifecycleStatus,
  type StatusTone,
} from "@/lib/projectLifecycle";
import { SharedProjectsCard } from "./SharedProjectsCard";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; projects: ProjectSummary[] }
  | { kind: "error"; message: string }
  | { kind: "no-org" };

const TYPE_TONE: Record<string, BadgeTone> = {
  construction: "info",
  interior: "success",
  design: "warning",
  consultant: "neutral",
};

type BadgeTone = "neutral" | "success" | "warning" | "info" | "danger";

const STATUS_TONE_MAP: Record<StatusTone, BadgeTone> = {
  success: "success",
  warning: "warning",
  info: "info",
  error: "danger",
  neutral: "neutral",
};

type LifecycleFilter = ProjectLifecycleStatus | "all" | "archived";

const FILTERS: Array<{ key: LifecycleFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "on_hold", label: "On hold" },
  { key: "deactivated", label: "Deactivated" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "archived", label: "Archived" },
];

export function ProjectsListView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const navigate = useNavigate();
  const orgCtx = activeOrg ? { orgId: activeOrg.orgId } : {};
  const canCreate = useCan("project:create", orgCtx);
  const canArchive = useCan("project:archive", orgCtx);
  const canRestore = useCan("project:restore", orgCtx);
  const canDelete = useCan("project:delete", orgCtx);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState<LifecycleFilter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ProjectSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [busy, setBusy] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);

  // Growth quick-win: one click loads a fully-populated demo villa project
  // (seed_demo_project RPC — migration 227; org-admin gated + idempotent).
  const loadDemoProject = async () => {
    setSeedingDemo(true);
    try {
      const client = await getClient();
      if (!client) return;
      const { data, error } = await client.rpc("seed_demo_project");
      if (!error && data) {
        setState({ kind: "loading" }); // refetch list with the new project
        navigate(`/projects/${data}`);
        return;
      }
    } catch { /* fall through: button re-enables */ }
    setSeedingDemo(false);
  };
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!activeOrg) { setState({ kind: "no-org" }); return; }
      setState({ kind: "loading" });
      const mod = await import("../../lib/supabase/supabase");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (mod as any).getSupabaseClient();
      if (!client) { setState({ kind: "error", message: "Backend not configured." }); return; }
      const res = await listProjectsForOrg(client as unknown as TypedSupabaseClient, activeOrg.orgId, memberProjectScope(session));
      if (cancelled) return;
      if (res.ok) setState({ kind: "ready", projects: res.data });
      else setState({ kind: "error", message: res.error });
    })();
    return () => { cancelled = true; };
  }, [activeOrg, session]);

  async function runLifecycleAction(
    client: TypedSupabaseClient,
    p: ProjectSummary,
    action: (c: TypedSupabaseClient, id: string) => Promise<{ ok: boolean; error?: string }>,
  ): Promise<void> {
    if (state.kind !== "ready") return;
    setBusy(true);
    setActionError(null);
    const res = await action(client, p.id);
    if (!res.ok) { setActionError(res.error ?? "Action failed."); setBusy(false); return; }
    // Refresh after a successful mutation (archived_at + status both change).
    const mod = await import("../../lib/supabase/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client2 = await (mod as any).getSupabaseClient();
    if (client2 && activeOrg) {
      const refreshed = await listProjectsForOrg(client2 as unknown as TypedSupabaseClient, activeOrg.orgId, memberProjectScope(session));
      if (refreshed.ok) setState({ kind: "ready", projects: refreshed.data });
    }
    setBusy(false);
  }

  async function onSetStatus(p: ProjectSummary, status: ProjectLifecycleStatus): Promise<void> {
    const mod = await import("../../lib/supabase/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => setProjectStatus(c, id, status));
  }

  async function onArchive(p: ProjectSummary): Promise<void> {
    const mod = await import("../../lib/supabase/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => archiveProject(c, id));
  }

  async function onRestore(p: ProjectSummary): Promise<void> {
    const mod = await import("../../lib/supabase/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => restoreProject(c, id));
  }

  async function onDelete(p: ProjectSummary): Promise<void> {
    if (!window.confirm(`Permanently delete "${p.name}"? This cannot be undone.`)) return;
    const mod = await import("../../lib/supabase/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => deleteProject(c, id));
  }

  const rollup = useMemo(
    () => (state.kind === "ready" ? projectRollup(state.projects) : undefined),
    [state],
  );

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const filtered = state.projects.filter(p => {
      const archived = p.archivedAt != null;
      if (filter === "all") return !archived;
      if (filter === "archived") return archived;
      return !archived && isProjectLifecycleStatus(p.status) && p.status === filter;
    });
    return sortProjects(filterProjects(filtered, query), sortKey, sortDir);
  }, [state, filter, query, sortKey, sortDir]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-display text-xl font-bold text-fg-primary">Projects</h1>
        {canCreate && (
          <Link to="/projects/new">
            <Button size="sm" leftIcon={<Icon name="plus" size={14} />}>New Project</Button>
          </Link>
        )}
      </div>

      <SharedProjectsCard />

      {actionError && (
        <Alert variant="danger" onDismiss={() => setActionError(null)}>{actionError}</Alert>
      )}

      {state.kind === "loading" && (
        <div className="grid place-items-center py-16 text-accent"><Spinner size={24} /></div>
      )}

      {state.kind === "no-org" && (
        <Card className="p-8 text-center text-fg-secondary text-sm">
          You're not a member of any organization yet.
        </Card>
      )}

      {state.kind === "error" && (
        <Card className="p-6 flex items-start gap-3 border-error bg-error-tint">
          <Icon name="alert" size={18} className="text-error mt-0.5" />
          <div className="text-sm text-error">Couldn't load projects: {state.message}</div>
        </Card>
      )}

      {state.kind === "ready" && rollup && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <StatCard label="Live" value={rollup.total} sub={`${rollup.totalBudget > 0 ? fmtCompactRupees(rollup.totalBudget) : "—"} budget`} accent="orange" />
          <StatCard label="Active" value={rollup.active} sub={`${rollup.paused + rollup.onHold} paused / hold`} accent="emerald" />
          <StatCard label="Completed" value={rollup.completed} accent="blue" />
          <StatCard label="Cancelled" value={rollup.cancelled} accent="red" />
          <StatCard label="Archived" value={rollup.archived} accent="violet" />
        </div>
      )}

      {state.kind === "ready" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              fit
              leftIcon={<Icon name="search" size={14} />}
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-56"
            />
            <div className="flex items-center gap-1.5">
              <Select
                fit
                compact
                aria-label="Sort by"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as ProjectSortKey)}
                options={PROJECT_SORT_KEYS.map(({ key, label }) => ({ value: key, label }))}
              />
              <Button
                size="sm"
                variant="secondary"
                aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
                onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
              >
                <Icon name="chevron" size={14} className={cn(sortDir === "desc" && "rotate-180")} />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition",
                  filter === f.key
                    ? "bg-accent text-white"
                    : "bg-bg-secondary text-fg-secondary hover:text-fg-primary",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.kind === "ready" && visible.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-sm text-fg-secondary mb-3">
            {state.projects.length === 0
              ? `No projects yet in ${activeOrg?.orgName}.`
              : `No ${filter === "all" ? "" : filter + " "}projects match.`}
          </div>
          {state.projects.length === 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <RequireCapability capability="project:create" orgId={activeOrg?.orgId}>
                <Link to="/projects/new">
                  <Button size="md" leftIcon={<Icon name="plus" size={16} />}>Create the first project</Button>
                </Link>
              </RequireCapability>
              <RequireCapability capability="project:create" orgId={activeOrg?.orgId}>
                <Button size="md" variant="secondary" onClick={loadDemoProject} disabled={seedingDemo}>
                  {seedingDemo ? "Loading demo…" : "Load demo project"}
                </Button>
              </RequireCapability>
            </div>
          )}
          {state.projects.length === 0 && (
            <div className="text-xs text-fg-tertiary mt-3">The demo project pre-fills milestones, tasks, issues and finance so you can explore every feature instantly.</div>
          )}
        </Card>
      )}

      {state.kind === "ready" && visible.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {visible.map(p => {
            const status = asProjectLifecycleStatus(p.status);
            const archived = p.archivedAt != null;
            const statusTone = STATUS_TONE_MAP[PROJECT_STATUS_TONE[status]];
            const actions = lifecycleActions(status);
            return (
              <Card key={p.id} className="p-4 hover:border-accent transition h-full">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
                    <div className="font-semibold text-fg-primary truncate">{p.name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-fg-secondary">
                      {p.location && <span className="truncate">{p.location}</span>}
                      {p.clientName && <span className="truncate">Client: {p.clientName}</span>}
                    </div>
                    {p.description && (
                      <div className="text-xs text-fg-tertiary mt-1 line-clamp-2">{p.description}</div>
                    )}
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge tone={TYPE_TONE[p.type] ?? "neutral"}>{p.type}</Badge>
                    <Badge tone={statusTone}>
                      {archived ? "Archived" : PROJECT_STATUS_LABEL[status]}
                    </Badge>
                    {(canArchive || canRestore || canDelete || actions.length > 0) && (
                      <DropdownMenu
                        trigger={
                          <button
                            type="button"
                            aria-label="Project actions"
                            className="p-1.5 rounded-lg bg-transparent hover:bg-elevated text-fg-primary border border-transparent"
                          >
                            <Icon name="dots" size={14} />
                          </button>
                        }
                      >
                        {!archived && actions.map(a => (
                          <DropdownItem
                            key={a.key}
                            disabled={busy}
                            onClick={() => void onSetStatus(p, a.to)}
                            className={a.tone === "error" ? "text-error" : undefined}
                          >
                            {a.to === "active" ? "Reactivate" : a.label}
                          </DropdownItem>
                        ))}
                        {!archived && canArchive && (
                          <DropdownItem disabled={busy} onClick={() => void onArchive(p)} className="text-fg-secondary">
                            Archive
                          </DropdownItem>
                        )}
                        {archived && canRestore && (
                          <DropdownItem disabled={busy} onClick={() => void onRestore(p)} className="text-success">
                            Restore
                          </DropdownItem>
                        )}
                        {canDelete && (
                          <DropdownItem disabled={busy} onClick={() => void onDelete(p)} className="text-error">
                            Delete permanently
                          </DropdownItem>
                        )}
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {!archived && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={p.progress} ariaLabel={`${p.name} progress`} className="flex-1" />
                      <span className="text-xs text-fg-secondary shrink-0">{Math.min(Math.max(p.progress || 0, 0), 100)}%</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
                      {typeof p.budget === "number" && (
                        <span className="flex items-center gap-1">
                          <Icon name="wallet" size={12} />{fmtCompactRupees(p.budget)}
                        </span>
                      )}
                      {p.startDate && <span>Start {p.startDate}</span>}
                      {p.expectedEndDate && <span>Due {p.expectedEndDate}</span>}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
