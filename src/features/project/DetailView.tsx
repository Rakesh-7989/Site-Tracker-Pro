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
import { usePlanCaps } from "@/auth";
import { visibleTabs, DEFAULT_TAB, tabById } from "./tabs-config";
import { OverviewTab } from "./tabs/OverviewTab";
import { TeamTab } from "./tabs/TeamTab";
import { MilestonesTab } from "./tabs/MilestonesTab";
import { TasksTab } from "./tabs/TasksTab";
import { UpdatesTab } from "./tabs/UpdatesTab";
import { IssuesTab } from "./tabs/IssuesTab";
import { MaterialsTab } from "./tabs/MaterialsTab";
import { SafetyTab } from "./tabs/SafetyTab";
import { InspectionsTab } from "./tabs/InspectionsTab";
import { PunchTab } from "./tabs/PunchTab";
import { AttendanceTab } from "./tabs/AttendanceTab";
import { POsTab } from "./tabs/POsTab";
import { InvoicesTab } from "./tabs/InvoicesTab";
import { BudgetTab } from "./tabs/BudgetTab";
import { RaBillsTab } from "./tabs/RaBillsTab";
import { LedgerTab } from "./tabs/LedgerTab";
import { DrawingsTab } from "./tabs/DrawingsTab";
import { RfiTab } from "./tabs/RfiTab";
import { ChangeOrdersTab } from "./tabs/ChangeOrdersTab";
import { EstimateTab } from "./tabs/EstimateTab";
import { MapTab } from "./tabs/MapTab";
import { BoqTab } from "./tabs/BoqTab";
import { LabourTab } from "./tabs/LabourTab";
import { ComplianceTab } from "./tabs/ComplianceTab";
import { FieldOpsTab } from "./tabs/FieldOpsTab";
import { GanttTab } from "./tabs/GanttTab";
import { ApprovalsTab } from "./tabs/ApprovalsTab";
import { MessagesTab } from "./tabs/MessagesTab";
import { TabPlaceholder } from "./tabs/TabPlaceholder";

// Tabs that have a real ported implementation (others fall to the placeholder).
const REAL_TABS = new Set([
  "overview", "team", "milestones", "tasks", "updates", "issues",
  "materials", "safety", "inspections", "punchlist",
  "attendance", "po", "invoices", "budget",
  "rabills", "ledger", "drawings", "rfi",
  "changeorders", "estimate", "map",
  "boq", "labour", "compliance", "fieldops", "gantt", "approvals", "messages",
]);

export function DetailView(): JSX.Element {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { can: planCan } = usePlanCaps();
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
    // planCan hides Pro+ tabs (finance/rfi/estimate/etc) on lower plans.
    return visibleTabs(caps, state.project.type, planCan);
  }, [caps, state, planCan]);

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
        {activeId === "milestones" && <MilestonesTab projectId={project.id} />}
        {activeId === "tasks" && <TasksTab projectId={project.id} />}
        {activeId === "updates" && <UpdatesTab projectId={project.id} />}
        {activeId === "issues" && <IssuesTab projectId={project.id} />}
        {activeId === "materials" && <MaterialsTab projectId={project.id} />}
        {activeId === "safety" && <SafetyTab projectId={project.id} />}
        {activeId === "inspections" && <InspectionsTab projectId={project.id} />}
        {activeId === "punchlist" && <PunchTab projectId={project.id} />}
        {activeId === "attendance" && <AttendanceTab projectId={project.id} />}
        {activeId === "po" && <POsTab projectId={project.id} />}
        {activeId === "invoices" && <InvoicesTab projectId={project.id} />}
        {activeId === "budget" && <BudgetTab projectId={project.id} />}
        {activeId === "rabills" && <RaBillsTab projectId={project.id} />}
        {activeId === "ledger" && <LedgerTab projectId={project.id} />}
        {activeId === "drawings" && <DrawingsTab projectId={project.id} />}
        {activeId === "rfi" && <RfiTab projectId={project.id} />}
        {activeId === "changeorders" && <ChangeOrdersTab projectId={project.id} />}
        {activeId === "estimate" && <EstimateTab projectId={project.id} />}
        {activeId === "map" && <MapTab project={project} />}
        {activeId === "boq" && <BoqTab projectId={project.id} />}
        {activeId === "labour" && <LabourTab projectId={project.id} />}
        {activeId === "compliance" && <ComplianceTab projectId={project.id} orgId={project.orgId} />}
        {activeId === "fieldops" && <FieldOpsTab projectId={project.id} />}
        {activeId === "gantt" && <GanttTab projectId={project.id} />}
        {activeId === "approvals" && <ApprovalsTab projectId={project.id} />}
        {activeId === "messages" && <MessagesTab projectId={project.id} />}
        {!REAL_TABS.has(activeId) && activeDef && (
          <TabPlaceholder label={activeDef.label} icon={activeDef.icon} />
        )}
      </div>
    </div>
  );
}
