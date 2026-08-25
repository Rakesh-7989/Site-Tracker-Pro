import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useCan } from "@/auth/AuthContext";
import { useT } from "@/i18n";
import { getProject } from "./projectDetailQueries";
import { visibleTabs, PROJECT_TABS } from "./tabs-config";
import { InvoicesTab } from "@/features/finance/InvoicesTab";
import { RaBillsTab } from "@/features/finance/RaBillsTab";
import { PartnersTab } from "@/features/partners/PartnersTab";
import { ClientAccessTab } from "@/features/share/ClientAccessTab";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonPage } from "@/components/ui/Skeleton";

const STATUS_TONE = {
  active: "success",
  paused: "warning",
  on_hold: "warning",
  completed: "info",
  cancelled: "error",
  deactivated: "neutral",
} as const;

const TAB_I18N: Record<string, string> = {
  overview: "detail.overview",
  dpr: "detail.dailyReports",
  invoices: "detail.invoices",
  rabills: "detail.raBills",
  partners: "detail.partners",
  clientaccess: "detail.clientAccess",
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const { session } = useAuth();
  const can = useCan;
  const t = useT();
  const [activeTab, setActiveTab] = useState("overview");

  const q = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
  });

  if (q.isLoading) return <SkeletonPage rows={4} />;
  if (q.isError)
    return (
      <Alert variant="error">
        {String(q.error)} — <Link to="/projects" className="underline">back to projects</Link>
      </Alert>
    );

  const project = q.data;
  if (!project) return null;

  const tabs = visibleTabs(PROJECT_TABS, (cap) => can(cap));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-fg-primary truncate">{project.name}</h1>
            <Badge tone={STATUS_TONE[project.status as keyof typeof STATUS_TONE] ?? "neutral"}>
              {project.status.replace("_", " ")}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-fg-tertiary capitalize">
            {project.type.replace("_", " ")}
            {session?.memberships.find((m) => m.orgId === session.activeOrgId)?.orgName &&
              ` · ${session.memberships.find((m) => m.orgId === session.activeOrgId)?.orgName}`}
          </div>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-default" aria-label="Project sections">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tb.id}
            onClick={() => setActiveTab(tb.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition focus-ring ${
              activeTab === tb.id
                ? "border-accent text-accent font-medium"
                : "border-transparent text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {t(TAB_I18N[tb.id] ?? tb.label)}
          </button>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Budget" value={project.budget != null ? `₹${project.budget.toLocaleString("en-IN")}` : "—"} />
            <StatCard label="Start date" value={fmtDate(project.startDate)} />
            <StatCard label="End date" value={fmtDate(project.endDate)} />
          </div>
          <Card title="Progress" padding="md">
            <p className="text-sm text-fg-secondary">
              Daily reports, tasks and financials will appear here as modules come online.
              Field teams can file today's report from the DPR page.
            </p>
          </Card>
        </div>
      )}

      {activeTab === "dpr" && (
        <Card title="Daily Progress Reports" padding="md">
          <p className="text-sm text-fg-secondary">DPR history for this project lands here.</p>
        </Card>
      )}

      {activeTab === "invoices" && <InvoicesTab projectId={projectId} />}
      {activeTab === "rabills" && <RaBillsTab projectId={projectId} />}
      {activeTab === "partners" && <PartnersTab projectId={projectId} />}
      {activeTab === "clientaccess" && <ClientAccessTab projectId={projectId} />}
    </div>
  );
}
