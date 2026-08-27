// SiteTrack Pro — v3 create project.
//
// Capability-gated form. The project-type select drives which member
// roles are valid later (per VALID_PROJECT_ROLES_BY_TYPE).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useOrgSwitcher, useCan, PROJECT_INDUSTRIES_BY_TYPE, PROJECT_INDUSTRY_LABELS, segmentProjectTypes, defaultProjectTypeFor, type ProjectType } from "@/auth";
import { createProject } from "@/app/queries/queries";
import { Card, Button, Icon } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { QuotaGate } from "@/auth/QuotaGate";

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
  const [industrySubtype, setIndustrySubtype] = useState<string>("");
  const [location, setLocation] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const industryOptions = PROJECT_INDUSTRIES_BY_TYPE[type];

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
    if (name.trim().length < 2) { setError("Project name is required (at least 2 characters)."); return; }
    if (name.trim().length > 120) { setError("Project name must be 120 characters or less."); return; }
    if (clientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) { setError("Client email is not a valid email address."); return; }
    if (budget.trim()) {
      const n = Number(budget);
      if (!Number.isFinite(n) || n < 0) { setError("Budget must be a valid number ≥ 0."); return; }
      if (n > 999999999999) { setError("Budget is too large (max ₹9,99,99,99,999)."); return; }
    }
    if (startDate && endDate && endDate < startDate) { setError("Expected end date cannot be before start date."); return; }
    setBusy(true); setError(null);
    const mod = await import("../../lib/supabase/supabase");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (mod as any).getSupabaseClient();
    if (!client) { setBusy(false); setError("Backend not configured."); return; }
    const res = await createProject(client, {
      orgId: activeOrg.orgId,
      name: name.trim(),
      type,
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(industrySubtype ? { industrySubtype } : {}),
      ...(clientName.trim() ? { clientName: clientName.trim() } : {}),
      ...(clientEmail.trim() ? { clientEmail: clientEmail.trim() } : {}),
      ...(budget.trim() ? { budget: Number(budget) } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
    setBusy(false);
    if (res.ok) navigate("/projects");
    else setError(res.error);
  };

  return (
    <div className="max-w-lg mx-auto p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary mb-4">New Project</h1>
      <QuotaGate resource="projects">
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
            <Select id="ptype" value={type} onChange={e => { setType(e.target.value as ProjectType); setIndustrySubtype(""); }} options={allowedTypes.map(t => ({ value: t, label: TYPE_LABEL[t] }))} />
          </div>

          <div>
            <label htmlFor="pindustry" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">{TYPE_LABEL[type]} industry <span className="text-fg-tertiary normal-case tracking-normal">(optional)</span></label>
            <Select id="pindustry" value={industrySubtype} onChange={e => setIndustrySubtype(e.target.value)} options={[{ value: "", label: "Any industry" }, ...industryOptions.map(ind => ({ value: ind, label: PROJECT_INDUSTRY_LABELS[ind] ?? ind }))]} />
          </div>

          <div>
            <label htmlFor="pclient" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Client name <span className="text-fg-tertiary normal-case tracking-normal">(optional)</span></label>
            <input
              id="pclient" value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="e.g. Vasavi Constructions"
              className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
            />
          </div>

          <div>
            <label htmlFor="pemail" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Client email <span className="text-fg-tertiary normal-case tracking-normal">(optional — portal invites)</span></label>
            <input
              id="pemail" type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
              placeholder="client@example.com"
              className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="pbudget" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Budget ₹ <span className="text-fg-tertiary normal-case tracking-normal">(optional)</span></label>
              <input
                id="pbudget" type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)}
                placeholder="25000000"
                className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
              />
            </div>
            <div>
              <label htmlFor="pstart" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Start date</label>
              <input
                id="pstart" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
              />
            </div>
            <div>
              <label htmlFor="pend" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Expected end</label>
              <input
                id="pend" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ploc" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Location <span className="text-fg-tertiary normal-case tracking-normal">(optional)</span></label>
            <input
              id="ploc" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="Banjara Hills, Hyderabad"
              className="w-full px-3.5 py-2.5 border border-default rounded-lg text-sm outline-none focus:border-accent bg-panel"
            />
          </div>

          <div>
            <label htmlFor="pdesc" className="text-[10px] font-semibold tracking-[0.16em] uppercase text-fg-secondary block mb-1.5">Description <span className="text-fg-tertiary normal-case tracking-normal">(optional)</span></label>
            <textarea
              id="pdesc" rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Scope summary — phases, built-up area, special requirements…"
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
            <Button type="submit" size="lg" loading={busy} leftIcon={<Icon name="check" size={16} />}>
              {busy ? "Creating…" : "Create project"}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => navigate("/projects")}>Cancel</Button>
          </div>
          </form>
        </Card>
      </QuotaGate>
    </div>
  );
}
