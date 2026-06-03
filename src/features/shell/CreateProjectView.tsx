// SiteTrack Pro — v3 create project.
//
// Capability-gated form. The project-type select drives which member
// roles are valid later (per VALID_PROJECT_ROLES_BY_TYPE).

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useOrgSwitcher, useCan, PROJECT_TYPES, type ProjectType } from "@/auth";
import { createProject } from "@/app/queries";
import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";

const TYPE_LABEL: Record<ProjectType, string> = {
  construction: "Construction",
  interior: "Interior",
  design: "Design",
  consultant: "Consultant",
};

export function CreateProjectView(): JSX.Element {
  const navigate = useNavigate();
  const { activeOrg } = useOrgSwitcher();
  const canCreate = useCan("project:create", activeOrg ? { orgId: activeOrg.orgId } : {});

  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("construction");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center">
        <Icon name="lock" size={24} className="mx-auto text-ink-400 mb-2" />
        <div className="text-sm text-ink-600">You don't have permission to create projects in this organization.</div>
      </Card>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) { setError("No active organization."); return; }
    if (name.trim().length < 2) { setError("Project name is required."); return; }
    setBusy(true); setError(null);
    const mod = await import("../../lib/supabase.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) { setBusy(false); setError("Backend not configured."); return; }
    const res = await createProject(client, {
      orgId: activeOrg.orgId,
      name: name.trim(),
      type,
      ...(location.trim() ? { location: location.trim() } : {}),
    });
    setBusy(false);
    if (res.ok) navigate("/projects");
    else setError(res.error);
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display text-xl font-bold text-ink-900 mb-4">New Project</h1>
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="pname" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-500 block mb-1.5">Project name</label>
            <input
              id="pname" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Vasavi Vista Phase 2"
              className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white"
            />
          </div>

          <div>
            <label htmlFor="ptype" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-500 block mb-1.5">Project type</label>
            <select
              id="ptype" value={type} onChange={e => setType(e.target.value as ProjectType)}
              className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white"
            >
              {PROJECT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="ploc" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-ink-500 block mb-1.5">Location <span className="text-ink-400 normal-case tracking-normal">(optional)</span></label>
            <input
              id="ploc" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="Banjara Hills, Hyderabad"
              className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
              <Icon name="alert" size={16} className="text-red-600 mt-0.5" />
              <span className="text-xs text-red-700">{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="lg" disabled={busy} leftIcon={busy ? <Spinner size={16} /> : <Icon name="check" size={16} />}>
              {busy ? "Creating…" : "Create project"}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => navigate("/projects")}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
