// SiteTrack Pro — v3 projects list.
//
// Lists the active org's projects via the typed query helper. Demonstrates
// the data layer + loading / empty / error states. "New Project" button is
// capability-gated.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useOrgSwitcher, useCan, RequireCapability } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { listProjectsForOrg, memberProjectScope, type ProjectSummary } from "@/app/queries";
import { Card, Button, Icon, Spinner, Badge } from "@/components/ui/atoms";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; projects: ProjectSummary[] }
  | { kind: "error"; message: string }
  | { kind: "no-org" };

const TYPE_TONE: Record<string, "neutral" | "info" | "success" | "warning"> = {
  construction: "info",
  interior: "success",
  design: "warning",
  consultant: "neutral",
};

export function ProjectsListView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const orgCtx = activeOrg ? { orgId: activeOrg.orgId } : {};
  const canCreate = useCan("project:create", orgCtx);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

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

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-fg-primary">Projects</h1>
        {canCreate && (
          <Link to="/projects/new">
            <Button size="sm" leftIcon={<Icon name="plus" size={14} />}>New Project</Button>
          </Link>
        )}
      </div>

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

      {state.kind === "ready" && state.projects.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-sm text-fg-secondary mb-3">No projects yet in {activeOrg?.orgName}.</div>
          <RequireCapability capability="project:create" orgId={activeOrg?.orgId}>
            <Link to="/projects/new">
              <Button size="md" leftIcon={<Icon name="plus" size={16} />}>Create the first project</Button>
            </Link>
          </RequireCapability>
        </Card>
      )}

      {state.kind === "ready" && state.projects.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {state.projects.map(p => (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="p-4 hover:border-accent transition cursor-pointer h-full">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-fg-primary">{p.name}</div>
                    {p.location && <div className="text-xs text-fg-secondary mt-0.5">{p.location}</div>}
                  </div>
                  <Badge tone={TYPE_TONE[p.type] ?? "neutral"}>{p.type}</Badge>
                </div>
                {p.status && <div className="mt-2 text-[11px] text-fg-tertiary uppercase tracking-wide">{p.status}</div>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
