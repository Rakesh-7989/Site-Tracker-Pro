// SiteTrack Pro — PM Dashboard view (/pm). Project Manager landing.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";
import { listPMProjects, listPMNotifications, type ProjectBrief, type NotifBrief } from "@/app/pmQueries";
import { memberProjectScope } from "@/app/queries";
import { useSession } from "@/auth/OrganizationContext";


import { getClient } from "@/lib/supabase";
function PBar({ v }: { v: number }) {
  return (
    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(v, 100)}%` }} />
    </div>
  );
}

export function PMView(): JSX.Element {
  const navigate = useNavigate();
  const session = useSession();
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [notifs, setNotifs] = useState<NotifBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const orgId = session.activeOrgId;
      if (!orgId) { setLoading(false); return; }
      setError(null);
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const [pRes, nRes] = await Promise.all([listPMProjects(client, orgId, memberProjectScope(session)), listPMNotifications(client)]);
      if (pRes.ok) setProjects(pRes.data); else setError(pRes.error);
      if (nRes.ok) setNotifs(nRes.data); else setError(nRes.error);
      setLoading(false);
    })();
  }, [session]);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error) return <div className="p-8"><Alert variant="danger">{error}</Alert></div>;

  const active = projects.filter(p => p.status === "active").length;
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-fg-primary">PM Dashboard</h1>
          <p className="text-fg-tertiary text-sm mt-1">Project overview</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-info-tint text-info">
          <Icon name="shield" size={12} />Project Manager
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-4"><div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">Projects</div><div className="text-3xl font-black text-fg-primary">{projects.length}</div></Card>
        <Card className="p-4"><div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">Active</div><div className="text-3xl font-black text-accent">{active}</div></Card>
        <Card className="p-4"><div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">Unread</div><div className="text-3xl font-black text-accent">{notifs.length}</div></Card>
      </div>

      {notifs.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bold text-fg-primary text-base mb-4">Notifications</h2>
          <div className="space-y-3">
            {notifs.map(n => (
              <Card key={n.id} className="p-4 border-accent bg-accent-tint flex gap-3">
                <div className="w-8 h-8 bg-accent-tint rounded-xl flex items-center justify-center shrink-0">
                  <Icon name="bell" size={16} className="text-accent" />
                </div>
                <div>
                  <div className="font-semibold text-fg-primary text-sm">{n.title}</div>
                  <p className="text-fg-secondary text-xs mt-0.5">{n.body}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => (
          <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
            className="bg-panel rounded-2xl border border-default p-5 text-left hover:shadow-md hover:border-accent transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-fg-primary text-sm group-hover:text-accent">{p.name}</h3>
              <Badge tone={p.status === "active" ? "success" : p.status === "completed" ? "info" : "neutral"}>{p.status}</Badge>
            </div>
            {p.location && <div className="text-xs text-fg-tertiary mb-3 flex items-center gap-1.5"><Icon name="map" size={11} />{p.location}</div>}
            <PBar v={p.progress} />
            <div className="text-xs text-fg-tertiary mt-1">{p.progress}%</div>
          </button>
        ))}
      </div>
    </div>
  );
}
