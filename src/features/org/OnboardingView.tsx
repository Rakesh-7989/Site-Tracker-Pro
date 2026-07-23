// SiteTrack Pro â€” Org Onboarding wizard (/org/onboarding).
// 5-step first-time setup for new orgs. Persists to Supabase.

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Spinner } from "@/components/ui/atoms";
import { getMyOrg, updateOrg, insertOrgMembers, createProject, disableFeatureFlags, completeOnboarding } from "@/app/onboardingQueries";


import { getClient } from "@/lib/supabase";
const STEPS = ["Org details", "Invite team", "First project", "Feature presets", "Integrations"];

export function OnboardingView(): JSX.Element {
  const [orgId, setOrgId] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Step 2
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [pending, setPending] = useState<Array<{ name: string; email: string; role: string }>>([]);

  // Step 3
  const [projName, setProjName] = useState("");
  const [clientName, setClientName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Step 4
  const [preset, setPreset] = useState<"minimal" | "balanced" | "full">("balanced");

  // Step 5
  const [aiKey, setAiKey] = useState("");

  const load = useCallback(async () => {
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getMyOrg(client);
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setOrgId(res.data.orgId);
    if (res.data.org) { setOrgName(res.data.org.name ?? ""); setContactEmail(res.data.org.contact_email ?? ""); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveOrg = async () => {
    if (!orgName.trim()) { alert("Org name required"); return; }
    const client = await getClient();
    await updateOrg(client, orgId, orgName, contactEmail);
    setStep(2);
  };

  const addPending = () => {
    if (!inviteName.trim() || !inviteEmail.trim()) { alert("Name + email required"); return; }
    setPending(p => [...p, { name: inviteName.trim(), email: inviteEmail.trim(), role: "pm" }]);
    setInviteName(""); setInviteEmail("");
  };

  const commitInvites = async () => {
    if (!pending.length) { setStep(3); return; }
    const client = await getClient();
    await insertOrgMembers(client, orgId, pending);
    setPending([]);
    setStep(3);
  };

  const saveProject = async () => {
    if (!projName.trim()) { alert("Project name required"); return; }
    if (!clientName.trim()) { alert("Client name required"); return; }
    const client = await getClient();
    await createProject(client, orgId, projName, clientName, startDate);
    setStep(4);
  };

  const applyPreset = async () => {
    const client = await getClient();
    const toDisable: string[] = [];
    if (preset === "minimal") {
      toDisable.push("tasks", "punchlist", "ledger", "boq", "estimate", "rfi", "changeorders", "approvals", "inspections", "safety", "rabills", "labour", "gantt", "forecast", "compliance", "delegations", "snapshot", "materialPrices", "hierarchy", "vendors", "po");
    } else if (preset === "balanced") {
      toDisable.push("arOverlay", "dprAuto", "photoGeo");
    }
    await disableFeatureFlags(client, orgId, toDisable);
    setStep(5);
  };

  const finish = async () => {
    const client = await getClient();
    await completeOnboarding(client, orgId);
    // Signal parent to redirect (SS check will catch it)
    window.location.href = "/org";
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error) return <div className="p-8"><div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">{error}</div></div>;

  return (
    <div className="min-h-screen bg-cream-100 flex items-start justify-center p-4 md:p-12">
      <div className="max-w-lg w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-ink-900 tracking-tight">Welcome to SiteTrack</h1>
            <p className="text-ink-400 text-sm mt-1">Let's get your workspace set up</p>
          </div>
          <div className="text-xs font-bold text-ink-400">{step} / 5</div>
        </div>

        <div className="flex gap-1 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < step ? "bg-safety-500" : "bg-stone-200"}`} />
          ))}
        </div>

        <Card className="p-6 md:p-8">
          {/* Step 1: Org details */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Organisation details</h2>
              <p className="text-xs text-ink-500">Your company or firm name and contact email.</p>
              <div>
                <label className="text-xs font-semibold text-ink-700 block mb-1">Organisation name *</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-700 block mb-1">Contact email</label>
                <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end pt-2"><Button onClick={saveOrg}>Continue</Button></div>
            </div>
          )}

          {/* Step 2: Invite team */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Invite your team</h2>
              <p className="text-xs text-ink-500">Add at least an architect and a project manager.</p>
              <div className="flex gap-2">
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Name" className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email" className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <Button variant="secondary" onClick={addPending}>Add</Button>
              </div>
              {pending.length > 0 && (
                <div className="space-y-1">
                  {pending.map((m, i) => (
                    <div key={i} className="flex items-center justify-between bg-stone-50 rounded-lg p-2 text-sm">
                      <span>{m.name} ({m.email})</span>
                      <button onClick={() => setPending(p => p.filter((_, j) => j !== i))} className="text-red-500 text-xs">&times;</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="secondary" onClick={() => setStep(3)}>Skip</Button>
                <Button onClick={commitInvites}>Continue</Button>
              </div>
            </div>
          )}

          {/* Step 3: First project */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Create your first project</h2>
              <p className="text-xs text-ink-500">A project is a construction site you track.</p>
              <div>
                <label className="text-xs font-semibold text-ink-700 block mb-1">Project name *</label>
                <input value={projName} onChange={e => setProjName(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-700 block mb-1">Client name *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-700 block mb-1">Start date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="secondary" onClick={() => setStep(4)}>Skip</Button>
                <Button onClick={saveProject}>Continue</Button>
              </div>
            </div>
          )}

          {/* Step 4: Feature presets */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Feature preset</h2>
              <p className="text-xs text-ink-500">Choose how many features to turn on by default.</p>
              {(["minimal", "balanced", "full"] as const).map(p => (
                <label key={p} className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer border transition-all ${preset === p ? "border-safety-500 bg-safety-50" : "border-stone-200"}`}>
                  <input type="radio" name="preset" checked={preset === p} onChange={() => setPreset(p)} className="accent-safety-500" />
                  <div>
                    <div className="font-semibold text-sm capitalize">{p}</div>
                    <div className="text-xs text-ink-400">{p === "minimal" ? "Only the essentials" : p === "balanced" ? "Most features, trim beta" : "Everything available"}</div>
                  </div>
                </label>
              ))}
              <div className="flex justify-end pt-2"><Button onClick={applyPreset}>Continue</Button></div>
            </div>
          )}

          {/* Step 5: Integrations */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Integrations (optional)</h2>
              <p className="text-xs text-ink-500">Connect your tools later from the Integrations panel.</p>
              <div>
                <label className="text-xs font-semibold text-ink-700 block mb-1">AI API key (optional)</label>
                <input value={aiKey} onChange={e => setAiKey(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="sk-..." />
              </div>
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="secondary" onClick={() => setAiKey("")}>Skip</Button>
                <Button onClick={finish}>Finish</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
