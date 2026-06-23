// SiteTrack Pro — Client Portal view (/client). Shows the client's projects,
// progress, and unread notifications. Mirrors legacy ClientPortal.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";

interface ProjectBrief {
  id: string;
  name: string;
  location: string | null;
  status: string;
  progress: number;
  client_email: string | null;
}

interface NotificationBrief {
  id: string;
  title: string;
  message: string;
  read: boolean;
}

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

export function ClientPortalView(): JSX.Element {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [notifs, setNotifs] = useState<NotificationBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user.email ?? "";

  useEffect(() => {
    (async () => {
      setError(null);
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const { data: p, error: pe } = await client.from("projects")
        .select("id, name, location, status, progress, client_email")
        .eq("client_email", email)
        .order("name");
      if (pe) { setError(String(pe.message ?? pe)); } else { setProjects((p ?? []).map((r: any) => ({ id: r.id, name: r.name, location: r.location, status: r.status, progress: r.progress ?? 0, client_email: r.client_email }))); }

      const { data: n, error: ne } = await client.from("notifications")
        .select("id, title, message, read")
        .order("created_at", { ascending: false })
        .limit(20);
      if (ne) { setError(String(ne.message ?? ne)); } else { setNotifs((n ?? []).map((r: any) => ({ id: r.id, title: r.title ?? "", message: r.message ?? "", read: r.read ?? false }))); }

      setLoading(false);
    })();
  }, [email]);

  const unread = notifs.filter(n => !n.read);
  const mp = projects;

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error) return <div className="p-8"><Alert variant="danger">{error}</Alert></div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-ink-900">Client Portal</h1>
          <p className="text-ink-400 text-sm mt-1">Your project overview</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
          <Icon name="shield" size={12} />Client View
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4"><div className="text-ink-400 text-xs font-semibold uppercase tracking-wider mb-1">Projects</div><div className="text-3xl font-black text-ink-900">{mp.length}</div></Card>
        <Card className="p-4"><div className="text-ink-400 text-xs font-semibold uppercase tracking-wider mb-1">Updates</div><div className="text-3xl font-black text-safety-600">{unread.length}</div></Card>
        <Card className="p-4"><div className="text-ink-400 text-xs font-semibold uppercase tracking-wider mb-1">Status</div><div className="text-lg font-black text-ink-900">{mp.filter(p => p.status === "active").length} active</div></Card>
      </div>

      {unread.length > 0 && (
        <Card className="mb-8 border-safety-200 bg-safety-50 p-5">
          <h3 className="font-bold text-safety-800 text-sm mb-3 flex items-center gap-2">
            <Icon name="bell" size={16} className="text-safety-600" />{unread.length} New Updates
          </h3>
          {unread.map(n => (
            <div key={n.id} className="py-2 border-t border-safety-100 first:border-0">
              <div className="font-semibold text-safety-900 text-xs">{n.title}</div>
              <div className="text-safety-700 text-xs mt-0.5">{n.message}</div>
            </div>
          ))}
        </Card>
      )}

      <div className="space-y-4">
        {mp.map(p => (
          <button
            key={p.id}
            onClick={() => navigate(`/projects/${p.id}`)}
            className="w-full bg-white rounded-2xl border border-cream-200 p-6 text-left hover:shadow-md hover:border-safety-300 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-ink-900 group-hover:text-safety-600">{p.name}</h3>
                {p.location && <div className="flex items-center gap-1.5 text-ink-400 text-xs mt-1"><Icon name="map" size={12} />{p.location}</div>}
              </div>
              <Badge tone={p.status === "active" ? "success" : p.status === "completed" ? "info" : "neutral"}>{p.status}</Badge>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-ink-400">Progress</span>
              <span className="font-black">{p.progress}%</span>
            </div>
            <PBar v={p.progress} />
          </button>
        ))}
        {mp.length === 0 && (
          <div className="text-center py-20 text-ink-400">
            <Icon name="building" size={32} className="mx-auto mb-3 opacity-30" />
            <p>No projects assigned to your account</p>
          </div>
        )}
      </div>
    </div>
  );
}
