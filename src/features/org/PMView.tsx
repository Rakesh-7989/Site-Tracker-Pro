// SiteTrack Pro — PM Dashboard view (/pm). Project Manager landing.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";

interface ProjectBrief { id: string; name: string; location: string | null; status: string; progress: number; }
interface NotifBrief { id: string; title: string; message: string; }

async function getClient() {
  const mod = await import("../../lib/supabase.js");
  return await (mod as any).getSupabaseClient();
}

function PBar({ v }: { v: number }) {
  return (
    <div className="w-full h-2 bg-cream-200 rounded-full overflow-hidden">
      <div className="h-full bg-safety-500 rounded-full transition-all" style={{ width: `${Math.min(v, 100)}%` }} />
    </div>
  );
}

export function PMView(): JSX.Element {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [notifs, setNotifs] = useState<NotifBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const { data: p, error: pe } = await client.from("projects").select("id, name, location, status, progress").order("name");
      if (pe) { setError(String(pe.message ?? pe)); } else { setProjects((p ?? []).map((r: any) => ({ id: r.id, name: r.name, location: r.location, status: r.status, progress: r.progress ?? 0 }))); }
      const { data: n, error: ne } = await client.from("notifications").select("id, title, message").order("created_at", { ascending: false }).limit(10);
      if (ne) { setError(String(ne.message ?? ne)); } else { setNotifs((n ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", message: r.message ?? "" }))); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error) return <div className="p-8"><Alert variant="danger">{error}</Alert></div>;

  const active = projects.filter(p => p.status === "active").length;
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-ink-900">PM Dashboard</h1>
          <p className="text-ink-400 text-sm mt-1">Project overview</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
          <Icon name="shield" size={12} />Project Manager
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4"><div className="text-ink-400 text-xs font-semibold uppercase tracking-wider mb-1">Projects</div><div className="text-3xl font-black text-ink-900">{projects.length}</div></Card>
        <Card className="p-4"><div className="text-ink-400 text-xs font-semibold uppercase tracking-wider mb-1">Active</div><div className="text-3xl font-black text-safety-600">{active}</div></Card>
        <Card className="p-4"><div className="text-ink-400 text-xs font-semibold uppercase tracking-wider mb-1">Unread</div><div className="text-3xl font-black text-safety-600">{notifs.length}</div></Card>
      </div>

      {notifs.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bold text-ink-900 text-base mb-4">Notifications</h2>
          <div className="space-y-3">
            {notifs.map(n => (
              <Card key={n.id} className="p-4 border-safety-200 bg-safety-50 flex gap-3">
                <div className="w-8 h-8 bg-safety-100 rounded-xl flex items-center justify-center shrink-0">
                  <Icon name="bell" size={16} className="text-safety-600" />
                </div>
                <div>
                  <div className="font-semibold text-ink-900 text-sm">{n.title}</div>
                  <p className="text-ink-500 text-xs mt-0.5">{n.message}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => (
          <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
            className="bg-white rounded-2xl border border-cream-200 p-5 text-left hover:shadow-md hover:border-safety-300 transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-bold text-ink-900 text-sm group-hover:text-safety-600">{p.name}</h3>
              <Badge tone={p.status === "active" ? "success" : p.status === "completed" ? "info" : "neutral"}>{p.status}</Badge>
            </div>
            {p.location && <div className="text-xs text-ink-400 mb-3 flex items-center gap-1.5"><Icon name="map" size={11} />{p.location}</div>}
            <PBar v={p.progress} />
            <div className="text-xs text-ink-400 mt-1">{p.progress}%</div>
          </button>
        ))}
      </div>
    </div>
  );
}
