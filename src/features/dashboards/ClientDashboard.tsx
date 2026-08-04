// SiteTrack Pro — Client Dashboard component.
//
// Dedicated dashboard for the client role. Shows a quick overview of their
// projects, progress, and key actions. Replaces the generic DashboardView
// for client users.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";
import { listClientProjects, type ProjectBrief } from "@/app/clientPortalQueries";
import { getClient } from "@/lib/supabase";

function PBar({ v }: { v: number }) {
  return (
    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
      <div
        className="h-full bg-accent rounded-full transition-all"
        style={{ width: `${Math.min(v, 100)}%` }}
      />
    </div>
  );
}

export function ClientDashboard(): JSX.Element {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user.email ?? "";

  useEffect(() => {
    (async () => {
      setError(null);
      const client = await getClient();
      if (!client) {
        setError("Backend not configured.");
        setLoading(false);
        return;
      }
      const pRes = await listClientProjects(client, email);
      if (pRes.ok) setProjects(pRes.data);
      else setError(pRes.error);
      setLoading(false);
    })();
  }, [email]);

  const activeProjects = projects.filter((p) => p.status === "active");
  const unreadCount = 0; // Notifications will be added here in Phase 8

  if (loading) return <Spinner size={24} />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-fg-primary">Welcome back</h1>
        <p className="text-fg-tertiary mt-1">
          Here’s an overview of your projects and key updates
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">
            Projects
          </div>
          <div className="text-3xl font-black text-fg-primary">
            {projects.length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">
            Updates
          </div>
          <div className="text-3xl font-black text-accent">
            {unreadCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">
            Active Projects
          </div>
          <div className="text-lg font-black text-fg-primary">
            {activeProjects.length}
          </div>
        </Card>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-bold text-fg-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => navigate("/client")}
            className="bg-panel rounded-2xl border border-default p-4 text-left hover:shadow-md hover:border-accent transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Icon name="shield" size={20} className="text-accent" />
              <h3 className="font-semibold text-fg-primary group-hover:text-accent">
                Client Portal
              </h3>
            </div>
            <p className="text-sm text-fg-tertiary">
              View all your projects and manage permissions
            </p>
          </button>

          <button
            onClick={() => navigate("/dpr/history")}
            className="bg-panel rounded-2xl border border-default p-4 text-left hover:shadow-md hover:border-accent transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Icon name="clipboard" size={20} className="text-accent" />
              <h3 className="font-semibold text-fg-primary group-hover:text-accent">
                Daily Reports
              </h3>
            </div>
            <p className="text-sm text-fg-tertiary">
              View your DPR history and submit new reports
            </p>
          </button>

          <button
            onClick={() => navigate("/handover")}
            className="bg-panel rounded-2xl border border-default p-4 text-left hover:shadow-md hover:border-accent transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Icon name="doc" size={20} className="text-accent" />
              <h3 className="font-semibold text-fg-primary group-hover:text-accent">
                Handover Packet
              </h3>
            </div>
            <p className="text-sm text-fg-tertiary">
              Manage punch list, submittals, and sign the handover
            </p>
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card className="p-8 text-center">
          <Icon name="building" size={32} className="mx-auto mb-3 opacity-30" />
          <h3 className="font-semibold text-fg-primary mb-2">No projects assigned</h3>
          <p className="text-sm text-fg-tertiary">
            You don&#39;t have any projects assigned to your account yet.
          </p>
          <p className="text-xs text-fg-tertiary mt-2">
            If you believe this is an error, contact your project manager.
          </p>
        </Card>
      ) : (
        <div>
          <h2 className="text-lg font-bold text-fg-primary mb-4">Your Projects</h2>
          <div className="space-y-4">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="w-full bg-panel rounded-2xl border border-default p-6 text-left hover:shadow-md hover:border-accent transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-fg-primary group-hover:text-accent">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {p.location && (
                        <div className="flex items-center gap-1.5 text-fg-tertiary text-xs">
                          <Icon name="map" size={12} />
                          {p.location}
                        </div>
                      )}
                      <Badge tone="neutral" size="sm" className="text-xs">
                        {p.type || "construction"}
                      </Badge>
                    </div>
                  </div>
                  <Badge
                    tone={p.status === "active" ? "success" : p.status === "completed" ? "info" : "neutral"}
                  >
                    {p.status}
                  </Badge>
                </div>

                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-fg-tertiary">Progress</span>
                  <span className="font-black">{p.progress}%</span>
                </div>
                <PBar v={p.progress} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
