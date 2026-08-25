import { useAuth, useCan } from "@/auth/AuthContext";
import { useT } from "@/i18n";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listProjectsForOrg } from "@/features/projects/projectQueries";

export function DashboardPage() {
  const { session } = useAuth();
  const t = useT();
  const canSubmitDpr = useCan("dpr:submit");
  const q = useQuery({
    queryKey: ["projects", session?.activeOrgId],
    queryFn: () => listProjectsForOrg(session!),
    enabled: !!session,
  });
  const rows = q.data ?? [];
  const active = rows.filter((p) => p.status === "active").length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-fg-primary">
        Welcome back{session?.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}
      </h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Projects" value={rows.length} />
        <StatCard label="Active" value={active} hint="status = active" />
        <StatCard
          label="Plan"
          value={session?.memberships.find((m) => m.orgId === session.activeOrgId)?.plan || "—"}
        />
      </div>
      <Card title={t("dash.quickActions")} padding="md">
        {canSubmitDpr ? (
          <Link to="/dpr">
            <Button size="lg">File today's DPR</Button>
          </Link>
        ) : (
          <p className="text-sm text-fg-secondary">
            Browse your projects from the sidebar to see progress.
          </p>
        )}
      </Card>
      <Card title={t("dash.capabilities")} padding="md">
        <p className="text-sm text-fg-secondary">
          {session ? `${session.capabilities.size} capabilities resolved for this session.` : ""}
        </p>
      </Card>
    </div>
  );
}
