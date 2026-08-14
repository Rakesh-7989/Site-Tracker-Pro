// SiteTrack Pro — v3 projects list with lifecycle management (P-B).
//
// Lists the active org's projects via the typed query helper. Adds:
//   * lifecycle filter chips (All / Active / Paused / On hold / Deactivated /
//     Completed / Cancelled / Archived);
//   * status-coded tone badges (design-system tokens via projectLifecycle);
//   * per-card lifecycle actions menu (pause / hold / deactivate / reactivate /
//     complete / cancel / archive / restore / delete) — capability-gated.
// RLS (`update_project_architect`, migration 116) enforces writes server-side.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useOrgSwitcher, useCan, RequireCapability } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { cn } from "@/lib/cn";
import {
  listProjectsForOrg, memberProjectScope, type ProjectSummary,
  setProjectStatus, archiveProject, restoreProject, deleteProject,
} from "@/app/queries";
import { Card, Button, Icon, Spinner, Badge, Alert } from "@/components/ui/atoms";
import { DropdownMenu, DropdownItem } from "@/components/ui";
import {
  asProjectLifecycleStatus,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  isProjectLifecycleStatus,
  lifecycleActions,
  type ProjectLifecycleStatus,
  type StatusTone,
} from "@/lib/projectLifecycle";

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
  const orgCtx = activeOrg ? { orgId: activeOrg.orgId } : {};
  const canCreate = useCan("project:create", orgCtx);
  const canArchive = useCan("project:archive", orgCtx);
  const canRestore = useCan("project:restore", orgCtx);
  const canDelete = useCan("project:delete", orgCtx);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState<LifecycleFilter>("all");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!activeOrg) { setState({ kind: "no-org" }); return; }
      setState({ kind: "loading" });
      const mod = await import("../../lib/supabase");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (mod as any).getSupabaseClient();
      if (!client) { setState({ kind: "error", message: "Backend not configured." }); return; }
      const res = await listProjectsForOrg(client, activeOrg.orgId, memberProjectScope(session));
      if (cancelled) return;
      if (res.ok) setState({ kind: "ready", projects: res.data });
      else setState({ kind: "error", message: res.error });
    })();
    return () => { cancelled = true; };
  }, [activeOrg]);

  async function runLifecycleAction(
    client: unknown,
    p: ProjectSummary,
    action: (c: unknown, id: string) => Promise<{ ok: boolean; error?: string }>,
  ): Promise<void> {
    if (state.kind !== "ready") return;
    setBusy(true);
    setActionError(null);
    const res = await action(client, p.id);
    if (!res.ok) { setActionError(res.error ?? "Action failed."); setBusy(false); return; }
    // Refresh after a successful mutation (archived_at + status both change).
    const mod = await import("../../lib/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client2 = await (mod as any).getSupabaseClient();
    if (client2 && activeOrg) {
      const refreshed = await listProjectsForOrg(client2, activeOrg.orgId, memberProjectScope(session));
      if (refreshed.ok) setState({ kind: "ready", projects: refreshed.data });
    }
    setBusy(false);
  }

  async function onSetStatus(p: ProjectSummary, status: ProjectLifecycleStatus): Promise<void> {
    const mod = await import("../../lib/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => setProjectStatus(c, id, status));
  }

  async function onArchive(p: ProjectSummary): Promise<void> {
    const mod = await import("../../lib/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => archiveProject(c, id));
  }

  async function onRestore(p: ProjectSummary): Promise<void> {
    const mod = await import("../../lib/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => restoreProject(c, id));
  }

  async function onDelete(p: ProjectSummary): Promise<void> {
    if (!window.confirm(`Permanently delete "${p.name}"? This cannot be undone.`)) return;
    const mod = await import("../../lib/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) return;
    await runLifecycleAction(client, p, (c, id) => deleteProject(c, id));
  }

  const visible = state.kind === "ready"
    ? state.projects.filter(p => {
        const archived = p.archivedAt != null;
        if (filter === "all") return !archived;
        if (filter === "archived") return archived;
        return !archived && isProjectLifecycleStatus(p.status) && p.status === filter;
      })
    : [];

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

      {state.kind === "ready" && (
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
      )}

      {state.kind === "ready" && visible.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-sm text-fg-secondary mb-3">
            {state.projects.length === 0
              ? `No projects yet in ${activeOrg?.orgName}.`
              : `No ${filter === "all" ? "" : filter + " "}projects match.`}
          </div>
          {state.projects.length === 0 && (
            <RequireCapability capability="project:create" orgId={activeOrg?.orgId}>
              <Link to="/projects/new">
                <Button size="md" leftIcon={<Icon name="plus" size={16} />}>Create the first project</Button>
              </Link>
            </RequireCapability>
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
                    {p.location && <div className="text-xs text-fg-secondary mt-0.5 truncate">{p.location}</div>}
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
