// SiteTrack Pro — v3 create project.
//
// Capability-gated form. The project-type select drives which member
// roles are valid later (per VALID_PROJECT_ROLES_BY_TYPE).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useOrgSwitcher, useCan, CONSTRUCTION_INDUSTRIES, CONSTRUCTION_INDUSTRY_LABEL, segmentProjectTypes, defaultProjectTypeFor, type ProjectType, type ConstructionIndustry } from "@/auth";
import { createProject } from "@/app/queries";
import { Card, Button, Icon, Spinner } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";

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
  const [industrySubtype, setIndustrySubtype] = useState<ConstructionIndustry | "">("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v4 C0 — org segment scopes which project types may be created. Legacy
  // orgs (null segment) keep the full catalog.
  const segment = activeOrg?.segment ?? null;
  const allowedTypes = segmentProjectTypes(segment);
  useEffect(() => {
    if (!allowedTypes.includes(type)) setType(defaultProjectTypeFor(segment));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment]);

  if (!canCreate) {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center">
        <Icon name="lock" size={24} className="mx-auto text-fg-tertiary mb-2" />
        <div className="text-sm text-fg-secondary">You don't have permission to create projects in this organization.</div>
      </Card>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) { setError("No active organization."); return; }
    if (name.trim().length < 2) { setError("Project name is required."); return; }
    setBusy(true); setError(null);
    const mod = await import("../../lib/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) { setBusy(false); setError("Backend not configured."); return; }
    const res = await createProject(client, {
      orgId: activeOrg.orgId,
      name: name.trim(),
      type,
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(industrySubtype ? { industrySubtype: industrySubtype as ConstructionIndustry } : {}),
    });
    setBusy(false);
    if (res.ok) navigate("/projects");
    else setError(res.error);
  };

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary mb-4">New Project</h1>
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="pname" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Project name</label>
            <input
              id="pname" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Vasavi Vista Phase 2"
              className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
            />
          </div>

          <div>
            <label htmlFor="ptype" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Project type</label>
            <Select id="ptype" value={type} onChange={e => setType(e.target.value as ProjectType)} options={allowedTypes.map(t => ({ value: t, label: TYPE_LABEL[t] }))} />
          </div>

          {type === "construction" && (
            <div>
              <label htmlFor="pindustry" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Construction industry <span className="text-fg-tertiary normal-case tracking-normal">(optional)</span></label>
              <Select id="pindustry" value={industrySubtype} onChange={e => setIndustrySubtype(e.target.value as ConstructionIndustry | "")} options={[{ value: "", label: "Any industry" }, ...CONSTRUCTION_INDUSTRIES.map(ind => ({ value: ind, label: CONSTRUCTION_INDUSTRY_LABEL[ind] }))]} />
            </div>
          )}

          <div>
            <label htmlFor="ploc" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Location <span className="text-fg-tertiary normal-case tracking-normal">(optional)</span></label>
            <input
              id="ploc" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="Banjara Hills, Hyderabad"
              className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-error-tint border border-error p-3">
              <Icon name="alert" size={16} className="text-error mt-0.5" />
              <span className="text-xs text-error">{error}</span>
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
