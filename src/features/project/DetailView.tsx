// SiteTrack Pro — project DetailView (Phase 6).
//
// Replaces the legacy 5,000-line detail view with a role-gated tab shell.
// The visible tabs are computed from the user's capabilities (resolved
// in the project's org+project context) intersected with the project's
// type. Overview + Team are real; the rest render an honest placeholder
// until their Phase 6 sub-pass.
//
// URL: /projects/:id/:tab?  (defaults to overview)

import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import { useAuth, resolveCapabilities } from "@/auth";
import { Card, Icon, Spinner, Badge } from "@/components/ui/atoms";
import { useProject } from "./useProject";
import { visibleTabs, DEFAULT_TAB, tabById } from "./tabs-config";
import { OverviewTab } from "./tabs/OverviewTab";
import { TeamTab } from "./tabs/TeamTab";
import { TabPlaceholder } from "./tabs/TabPlaceholder";

export function DetailView(): JSX.Element {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { state } = useProject(id);

  // Resolve the user's capabilities for THIS project's context.
  const caps = useMemo(() => {
    if (!session || state.kind !== "ready") return new Set<never>();
    return resolveCapabilities(session, {
      orgId: state.project.orgId,
      projectId: state.project.id,
    }).capabilities;
  }, [session, state]);

  const tabs = useMemo(() => {
    if (state.kind !== "ready") return [];
    return visibleTabs(caps, state.project.type);
  }, [caps, state]);

  if (state.kind === "loading") {
    return <div className="grid place-items-center py-20 text-safety-500"><Spinner size={26} /></div>;
  }
  if (state.kind === "error") {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center">
        <Icon name="alert" size={24} className="mx-auto text-red-500 mb-2" />
        <div className="text-sm text-ink-700">{state.message}</div>
        <Link to="/projects" className="inline-block mt-4 text-sm font-semibold text-safety-600 hover:text-safety-700">← Back to projects</Link>
      </Card>
    );
  }

  const { project, members } = state;
  // Resolve the active tab: requested → if visible use it, else default.
  const activeId = tab && tabs.some(t => t.id === tab) ? tab : DEFAULT_TAB;
  const activeDef = tabById(activeId);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb + title */}
      <div className="mb-4">
        <Link to="/projects" className="text-xs text-ink-500 hover:text-safety-600 inline-flex items-center gap-1">
          <Icon name="arrow" size={12} /> Projects
        </Link>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <h1 className="font-display text-xl font-bold text-ink-900">{project.name}</h1>
          <Badge tone="info">{project.type}</Badge>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-cream-200 mb-5 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => navigate(`/projects/${project.id}/${t.id}`)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
                t.id === activeId
                  ? "border-safety-500 text-safety-700 font-semibold"
                  : "border-transparent text-ink-500 hover:text-ink-700"
              }`}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeId === "overview" && <OverviewTab project={project} members={members} />}
        {activeId === "team" && <TeamTab projectId={project.id} members={members} />}
        {activeId !== "overview" && activeId !== "team" && activeDef && (
          <TabPlaceholder label={activeDef.label} icon={activeDef.icon} />
        )}
      </div>
    </div>
  );
}
