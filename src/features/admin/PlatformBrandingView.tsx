import { useEffect, useState, useCallback } from "react";
import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { listProjectsForOrg, memberProjectScope, type ProjectSummary } from "@/app/queries/queries";
import { getClient } from "@/lib/supabase/supabase";
import {
  getOrgBranding, listProjectBrandings,
  upsertOrgBranding, upsertProjectBranding, deleteProjectBranding,
} from "@/app/queries/brandingQueries";
import { resolveBranding, accentToHex } from "@/lib/integrations/branding";


export function PlatformBrandingView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const can = useCan("platform:branding:manage");
  if (!can) return <AccessDenied message="Platform superadmin access required." />;
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner user={session.user} orgId={activeOrg.orgId} />;
}

function Inner({ user, orgId }: { user: any; orgId: string }): JSX.Element {
  const session = useSession();
  const [level, setLevel] = useState<"org" | "project">("org");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selProject, setSelProject] = useState("");
  const [orgBranding, setOrgBranding] = useState<Record<string, any>>({});
  const [projectBrandings, setProjectBrandings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const [orgRes, projRes] = await Promise.all([
      getOrgBranding(client, orgId),
      listProjectBrandings(client, orgId),
    ]);
    if (orgRes.ok && orgRes.data) {
      setOrgBranding({ [orgId]: { logoUrl: orgRes.data.logoUrl, tagline: orgRes.data.tagline, accent: orgRes.data.accent, theme: orgRes.data.theme } });
    }
    if (projRes.ok) {
      const map: Record<string, any> = {};
      for (const row of projRes.data) {
        if (row.projectId) map[row.projectId] = { logoUrl: row.logoUrl, tagline: row.tagline, accent: row.accent, theme: row.theme };
      }
      setProjectBrandings(map);
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const client = await getClient();
      if (!client) { setLoading(false); return; }
      const [pRes] = await Promise.all([
        listProjectsForOrg(client, orgId, memberProjectScope(session)),
      ]);
      if (cancelled) return;
      if (pRes.ok) {
        setProjects(pRes.data);
        if (pRes.data.length > 0) setSelProject(pRes.data[0].id);
      }
      await fetchBranding();
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, fetchBranding, session]);

  const branding = { org: orgBranding, project: projectBrandings };
  const effective = resolveBranding(branding, orgId, selProject);
  const current = level === "org"
    ? (orgBranding[orgId] || {})
    : (projectBrandings[selProject] || {});

  const update = async (patch: Record<string, any>) => {
    const client = await getClient();
    if (!client) return;
    let res;
    if (level === "org") {
      res = await upsertOrgBranding(client, orgId, patch);
    } else {
      res = await upsertProjectBranding(client, orgId, selProject, patch);
    }
    if (res.ok) await fetchBranding();
    else alert(res.error);
  };
  const clearProject = async () => {
    if (!window.confirm("Clear project-level branding? Cascade falls back to org defaults.")) return;
    const client = await getClient();
    if (!client) return;
    const res = await deleteProjectBranding(client, orgId, selProject);
    if (res.ok) await fetchBranding();
    else alert(res.error);
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  return (
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— White-label</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Branding</h1>
        <p className="text-fg-secondary text-sm mt-2">Org → Project → defaults cascade. Project override wins over org; org wins over system defaults.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-bg-primary rounded-2xl p-5 shadow-editorial border-default">
          <div className="flex gap-2 mb-4">
            <button onClick={() => setLevel("org")} className={`px-4 py-2 text-xs font-bold tracking-wider uppercase rounded-lg ${level === "org" ? "bg-ink text-cream" : "bg-bg-secondary text-fg-primary"}`}>Org level</button>
            <button onClick={() => setLevel("project")} className={`px-4 py-2 text-xs font-bold tracking-wider uppercase rounded-lg ${level === "project" ? "bg-ink text-cream" : "bg-bg-secondary text-fg-primary"}`}>Project level</button>
          </div>
          {level === "org" ?
            <div className="w-full p-2.5 border border-default rounded-xl text-sm mb-4 bg-bg-secondary text-fg-primary">{user.org_name || "My Org"}</div> :
            <Select value={selProject} onChange={e => setSelProject(e.target.value)} className="mb-4" options={projects.map(p => ({ value: p.id, label: p.name }))} />
          }
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Logo URL</label>
          <input value={current.logoUrl || ""} onChange={e => update({ logoUrl: e.target.value || null })} placeholder="https://yourbrand.com/logo.png" className="w-full p-2.5 border border-default rounded-xl text-sm outline-none focus:border-accent mb-3" />
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Tagline</label>
          <input value={current.tagline || ""} onChange={e => update({ tagline: e.target.value || null })} placeholder="e.g. Buildco Premium Homes" className="w-full p-2.5 border border-default rounded-xl text-sm outline-none focus:border-accent mb-3" />
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Accent</label>
          <div className="flex gap-2 mb-3">{["amber", "blue", "emerald", "violet", "rose"].map(c => (<button key={c} onClick={() => update({ accent: c })} className={`w-9 h-9 rounded-full ${current.accent === c ? "ring-2 ring-offset-2 ring-[var(--st-text-primary)]" : ""}`} style={{ backgroundColor: accentToHex(c) }} title={c} />))}</div>
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-secondary mb-1.5 block">Theme</label>
          <Select value={current.theme || ""} onChange={e => update({ theme: e.target.value || null })} className="mb-3" options={[{ value: "", label: "(inherit)" }, { value: "editorial", label: "Editorial — Fraunces + cream" }, { value: "operational", label: "Operational — Inter + slate (site mode)" }]} />
          {level === "project" && <button onClick={clearProject} className="text-[11px] font-bold text-error hover:text-error">Clear project override</button>}
        </div>
        <div className="bg-bg-primary rounded-2xl p-5 shadow-editorial border-default">
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-warning mb-3">— Live preview (effective cascade)</div>
          <div className="rounded-xl p-6 flex items-center gap-4" style={{ backgroundColor: accentToHex(effective.accent) + "10", border: `1px solid ${accentToHex(effective.accent)}30` }}>
            {effective.logoUrl ? <img src={effective.logoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: accentToHex(effective.accent) }}>SP</div>}
            <div className="flex-1 min-w-0"><div className="font-display text-lg font-bold text-fg-primary truncate" style={{ color: accentToHex(effective.accent) }}>{effective.tagline}</div><div className="text-[11px] text-fg-secondary">accent={effective.accent} · theme={effective.theme}</div></div>
          </div>
          <p className="text-[11px] text-fg-secondary mt-4 leading-relaxed">Project-level overrides win. Org-level fills missing fields. System defaults fill the rest. Set fields to blank to fall through.</p>
        </div>
      </div>
    </div>
  );
}
