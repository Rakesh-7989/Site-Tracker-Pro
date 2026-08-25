import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { type AppSession } from "@/auth/types";
import { listProjectsForOrg } from "./projectQueries";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonPage } from "@/components/ui/Skeleton";
import { SharedProjectsCard } from "@/features/partners/SharedProjectsCard";

const STATUS_TONE = {
  active: "success",
  paused: "warning",
  on_hold: "warning",
  completed: "info",
  cancelled: "error",
  deactivated: "neutral",
} as const;

export function ProjectsListPage() {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ["projects", session?.activeOrgId],
    queryFn: () => listProjectsForOrg(session as AppSession),
    enabled: !!session?.activeOrgId,
  });

  if (q.isLoading) return <SkeletonPage rows={5} />;
  if (q.isError) return <Alert variant="error">{String(q.error)}</Alert>;

  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <EmptyState
          title="No projects yet"
          message="Projects you are assigned to will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SharedProjectsCard />
      <div className="flex flex-col gap-3">
      {rows.map((p) => (
        <Link key={p.id} to={`/projects/${p.id}`} className="block">
          <Card padding="sm" className="transition hover:border-stronger">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg-primary truncate">
                  {p.name}
                </div>
                <div className="mt-0.5 text-xs text-fg-tertiary capitalize">
                  {p.type.replace("_", " ")}
                  {p.budget != null &&
                    ` · ₹${p.budget.toLocaleString("en-IN")}`}
                </div>
              </div>
              <Badge tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                {p.status.replace("_", " ")}
              </Badge>
            </div>
          </Card>
        </Link>
      ))}
      </div>
    </div>
  );
}
