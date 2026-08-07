// SiteTrack Pro — project DetailView (Phase 6).
//
// Replaces the legacy 5,000-line detail view with a role-gated tab shell.
// The visible tabs are computed from the user's capabilities (resolved
// in the project's org+project context) intersected with the project's
// type. Overview + Team are real; the rest render an honest placeholder
// until their Phase 6 sub-pass.
//
// URL: /projects/:id/:tab?  (defaults to overview)

import { useMemo, useRef, useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import { useAuth, resolveCapabilities } from "@/auth";
import { Card, Icon, Spinner, Badge } from "@/components/ui/atoms";
import { useT } from "@/i18n/I18nProvider";
import { useProject } from "./useProject";
import { usePlanCaps } from "@/auth";
import { useModules, ModuleGate } from "@/modules";
import { visibleTabs, tabModuleId, DEFAULT_TAB } from "./tabs-config";
import { OverviewTab } from "./tabs/OverviewTab";
import { TeamTab } from "./tabs/TeamTab";
import { RequestProjectAccess } from "./RequestProjectAccess";
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
import { PhasesTab } from "./tabs/PhasesTab";
import { TimeTab } from "./tabs/TimeTab";
import { DeliverablesTab } from "./tabs/DeliverablesTab";
import { ReviewRoundsTab } from "./tabs/ReviewRoundsTab";
import { BillingTab } from "./tabs/BillingTab";
import { FfeTab } from "./tabs/FfeTab";
import { StatutoryTab } from "./tabs/StatutoryTab";
import { MoodBoardsTab } from "./tabs/MoodBoardsTab";
import { RoomsTab } from "./tabs/RoomsTab";

export function DetailView(): JSX.Element {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { session } = useAuth();
  const { can: planCan } = usePlanCaps();
  const { isEnabled: moduleEnabled } = useModules();
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const check = () => setCanScrollRight(el.scrollWidth > el.clientWidth && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, []);
  const { state, reload } = useProject(id);

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
    // activeSegment gates v4 segment-specific tabs (migration 134).
    // moduleEnabled hides tabs whose owning industry module is switched off.
    const activeSegment = session?.orgs.find(o => o.orgId === session.activeOrgId)?.segment ?? null;
    return visibleTabs(caps, state.project.type, planCan, activeSegment, undefined, moduleEnabled);
  }, [caps, state, planCan, session, moduleEnabled]);

  if (state.kind === "loading") {
    return <div className="grid place-items-center py-20 text-accent"><Spinner size={26} /></div>;
  }
  if (state.kind === "error") {
  return (
      <Card className="max-w-lg mx-auto p-8 text-center">
        <Icon name="alert" size={24} className="mx-auto text-error mb-2" />
        <div className="text-sm text-fg-primary">{state.message}</div>
        <Link to="/projects" className="inline-block mt-4 text-sm font-semibold text-accent hover:text-accent-2">← {t("nav.projects")}</Link>
      </Card>
    );
  }

  const { project, members } = state;
  const isMember = session ? session.projectMemberships.some(pm => pm.projectId === project.id) : false;
  const isOrgAdmin = session ? session.orgs.some(o => o.orgId === project.orgId && o.isAdmin) : false;
  const canAccess = isMember || isOrgAdmin;

  if (!canAccess) {
    return <RequestProjectAccess projectId={project.id} projectName={project.name} />;
  }

  // Resolve the active tab: requested → if visible use it, else default.
  const activeId = tab && tabs.some(tb => tb.id === tab) ? tab : DEFAULT_TAB;
  const activeModule = tabModuleId(activeId);

  const tabContent = (
    <div>
      {activeId === "overview" && <OverviewTab project={project} members={members} />}
      {activeId === "team" && <TeamTab projectId={project.id} orgId={project.orgId} members={members} onReload={reload} />}
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
      {activeId === "phases" && <PhasesTab projectId={project.id} />}
      {activeId === "time" && <TimeTab projectId={project.id} />}
      {activeId === "deliverables" && <DeliverablesTab projectId={project.id} />}
      {activeId === "reviews" && <ReviewRoundsTab projectId={project.id} />}
      {activeId === "billing" && <BillingTab projectId={project.id} />}
      {activeId === "ffe" && <FfeTab projectId={project.id} />}
      {activeId === "statutory" && <StatutoryTab projectId={project.id} />}
      {activeId === "moodboards" && <MoodBoardsTab projectId={project.id} />}
      {activeId === "rooms" && <RoomsTab projectId={project.id} />}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Breadcrumb + title */}
      <div className="mb-4">
        <Link to="/projects" className="text-xs text-fg-secondary hover:text-accent inline-flex items-center gap-1">
          <Icon name="arrow" size={12} /> {t("nav.projects")}
        </Link>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">{project.name}</h1>
          <Badge tone="info">{project.type}</Badge>
        </div>
      </div>

      {/* Tab bar */}
      <div className="relative mb-5">
        <div ref={tabBarRef} className="border-b border-default overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 min-w-max">
          {tabs.map(tb => (
            <button
              key={tb.id}
              onClick={() => navigate(`/projects/${project.id}/${tb.id}`)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
                tb.id === activeId
                  ? "border-accent text-accent-2 font-semibold"
                  : "border-transparent text-fg-secondary hover:text-fg-primary"
              }`}
            >
              <Icon name={tb.icon} size={15} />
              {t(`projTab.${tb.id}`)}
            </button>
          ))}
        </div>
      </div>
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-bg-primary to-transparent" />
      )}
      </div>

      {/* Tab content (module-gated at render time as defense-in-depth) */}
      {activeModule ? <ModuleGate module={activeModule}>{tabContent}</ModuleGate> : tabContent}
    </div>
  );
}
