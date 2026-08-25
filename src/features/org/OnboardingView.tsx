// SiteTrack Pro � Org Onboarding wizard (/org/onboarding).
// 5-step first-time setup for new orgs. Persists to Supabase.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Spinner, Badge } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { getMyOrg, updateOrg, insertOrgMembers, createProject, disableFeatureFlags, completeOnboarding } from "@/app/onboardingQueries";
import { CORE_SEGMENTS, defaultProjectTypeFor, legacySegmentFor, projectTypesForSegments, type CompanySegment } from "@/auth";
import type { ProjectType } from "@/auth";
import { MODULES, CORE_MODULE, templateModules, templateModulesForSegments, type ModuleId } from "@/modules";
import { useT } from "@/i18n/I18nProvider";
import { PLAN_TIERS, priceFor, gstInclusive, formatINR, type BillingPeriod } from "@/features/marketing/plans";
import type { SignupPlan } from "@/app/signupQueries";


import { getClient } from "@/lib/supabase";
const STEPS = ["Org details", "Plan & billing", "Finish"]; // progressive: invites/projects/presets deferred (v5)
const TRIAL_DAYS = 14;

export function OnboardingView(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [orgId, setOrgId] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Step 1
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [segment, setSegment] = useState<CompanySegment | null>(null);
  // Multi-segment picks (migration 228) � the source of truth for Step 1;
  // `segment` above stays as the derived legacy value for back-compat readers.
  const [segments, setSegments] = useState<CompanySegment[]>([]);
  // Firm-type picker (mig 240) hidden � org_type is never set from this UI;
  // null derives from segments (resolveOrgType) when needed downstream.
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>([]);

  // Step 2 � plan & billing. Defaults to the Pro trial so the owner keeps
  // Pro unless they change it; billing defaults monthly.
  const [plan, setPlan] = useState<SignupPlan>("pro");
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  // Step 2
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [pending, setPending] = useState<Array<{ name: string; email: string; role: string }>>([]);

  // Step 3
  const [projName, setProjName] = useState("");
  const [clientName, setClientName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [projType, setProjType] = useState<ProjectType>("construction");

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
    if (res.data.org) {
      setOrgName(res.data.org.name ?? "");
      setContactEmail(res.data.org.contact_email ?? "");
      // Multi-segment (migration 228): prefer the array; fall back to legacy
      // single value (expanding 'multiple' to all four core picks).
      const initSegs = res.data.org.segments ?? (res.data.org.segment && res.data.org.segment !== "multiple" ? [res.data.org.segment] : res.data.org.segment === "multiple" ? [...CORE_SEGMENTS] : []);
      if (initSegs.length) {
        setSegments(initSegs);
        setProjType(defaultProjectTypeFor(legacySegmentFor(initSegs) ?? undefined));
      } else if (res.data.org.segment) {
        setSegment(res.data.org.segment);
        setProjType(defaultProjectTypeFor(res.data.org.segment));
      }
      if (res.data.org.enabled_modules) {
        setEnabledModules(res.data.org.enabled_modules);
      } else if (initSegs.length) {
        setEnabledModules([...templateModulesForSegments(initSegs)]);
      } else if (res.data.org.segment) {
        setEnabledModules([...templateModules(res.data.org.segment)]);
      }
      if (res.data.org.plan) setPlan(res.data.org.plan);
      if (res.data.org.billing_period) setBilling(res.data.org.billing_period);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Multi-segment toggle (migration 228): recompute derived defaults from the UNION. */
  const toggleSegment = (s: Exclude<CompanySegment, "multiple">) => {
    setSegments(prev => {
      const next = prev.includes(s)
        ? prev.filter(x => x !== s)
        : [...prev, s];
      const legacy = legacySegmentFor(next);
      if (legacy) {
        setSegment(legacy);
        setProjType(defaultProjectTypeFor(legacy));
      } else {
        setSegment(null);
      }
      setEnabledModules([...templateModulesForSegments(next)]);
      return next;
    });
  };

  const toggleModule = (id: ModuleId) => {
    if (id === CORE_MODULE) return; // projects is always on
    setEnabledModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id],
    );
  };

  const saveOrg = async () => {
    if (!orgName.trim()) { setFieldError(t("onb.errOrgName")); return; }
    if (!segments.length) { setFieldError(t("onb.errPickSegment")); return; }
    setFieldError(null);
    const modules = enabledModules.includes(CORE_MODULE)
      ? enabledModules
      : [CORE_MODULE, ...enabledModules];
    const client = await getClient();
    const r = await updateOrg(client, orgId, orgName, contactEmail, legacySegmentFor(segments), modules, plan, billing, segments);
    if (!r.ok) { setFieldError(r.error ?? "Could not save. Please try again."); return; }
    setStep(2);
  };

  // Skip with sane defaults: never leave segment/enabled_modules NULL � the
  // four segment-gated nav surfaces stay dark otherwise. Construction basics.
  const skipWithDefaults = async () => {
    setFieldError(null);
    try {
      const client = await getClient();
      const defaults = templateModulesForSegments(["construction"]);
      const r = await updateOrg(
        client,
        orgId,
        orgName || "My Workspace",
        contactEmail,
        "construction",
        [CORE_MODULE, ...defaults.filter(m => m !== CORE_MODULE)],
        plan,
        billing,
        ["construction"],
      );
      if (!r.ok) { setFieldError(r.error ?? "Could not save. Please try again."); return; }
      setSegments(["construction"]);
      setEnabledModules([CORE_MODULE, ...defaults.filter(m => m !== CORE_MODULE)]);
      navigate("/projects");
    } catch (e) {
      setFieldError(e instanceof Error ? e.message : String(e));
    }
  };

  // Growth quick-win: one click ? a fully-populated demo villa project
  // (milestones, tasks, issues, expenses) via the seed_demo_project RPC
  // (migration 227 � org-admin gated, idempotent).
  const loadDemoProject = async () => {
    setSeedingDemo(true);
    setError(null);
    try {
      const client = await getClient();
      if (!client) { setError("Backend not configured."); return; }
      const { data, error: rpcError } = await client.rpc("seed_demo_project");
      if (rpcError || !data) {
        setError(rpcError?.message ?? "Could not load the demo project. Please try again.");
        return;
      }
      navigate(`/projects/${data}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeedingDemo(false);
    }
  };

  const savePlan = async () => {
    const client = await getClient();
    const r = await updateOrg(
      client,
      orgId,
      orgName,
      contactEmail,
      legacySegmentFor(segments),
      enabledModules.includes(CORE_MODULE) ? enabledModules : [CORE_MODULE, ...enabledModules],
      plan,
      billing,
      segments,
    );
    if (!r.ok) { setFieldError(r.error ?? "Could not save. Please try again."); return; }
    setStep(6); // progressive: skip invites/project/presets � finish screen applies balanced defaults
  };

  const addPending = () => {
    if (!inviteName.trim() || !inviteEmail.trim()) { setFieldError(t("onb.errNameEmail")); return; }
    setFieldError(null);
    setPending(p => [...p, { name: inviteName.trim(), email: inviteEmail.trim(), role: "pm" }]);
    setInviteName(""); setInviteEmail("");
  };

  const commitInvites = async () => {
    if (!pending.length) { setStep(4); return; }
    const client = await getClient();
    await insertOrgMembers(client, orgId, pending);
    setPending([]);
    setStep(4);
  };

  const saveProject = async () => {
    if (!projName.trim()) { setFieldError(t("onb.errProjectName")); return; }
    if (!clientName.trim()) { setFieldError(t("onb.errClientName")); return; }
    setFieldError(null);
    const client = await getClient();
    await createProject(client, orgId, projName, clientName, startDate, projType);
    setStep(5);
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
    setStep(6);
  };

  const finish = async () => {
    const client = await getClient();
    await disableFeatureFlags(client, orgId, ["arOverlay", "dprAuto", "photoGeo"]); // balanced defaults
    await completeOnboarding(client, orgId);
    navigate("/projects"); // empty state offers Create-first / Load-demo
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error) return <div className="p-8"><div className="bg-error-tint border border-error text-error rounded-xl p-4 text-sm">{error}</div></div>;

  return (
    <div className="min-h-screen bg-secondary flex items-start justify-center p-4 md:p-12">
      <div className="max-w-lg w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-fg-primary tracking-tight">{t("onb.title")}</h1>
            <p className="text-fg-tertiary text-sm mt-1">{t("onb.subtitle")}</p>
          </div>
          <div className="text-xs font-bold text-fg-tertiary">{step} / 6</div>
        </div>

        <div className="flex gap-1 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < step ? "bg-accent" : "bg-secondary"}`} />
          ))}
        </div>

        <Card className="p-6 md:p-8">
          {/* Step 1: Org details */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">{t("onb.orgDetailsTitle")}</h2>
              <p className="text-xs text-fg-secondary">{t("onb.orgDetailsSub")}</p>
              <div>
                <label className="text-xs font-semibold text-fg-primary block mb-1">{t("onb.orgName")}</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)} className="w-full rounded-lg border border-default px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-primary block mb-1">{t("onb.contactEmail")}</label>
                <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="w-full rounded-lg border border-default px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-primary block mb-1">{t("onb.whatDo")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {CORE_SEGMENTS.map(s => {
                    const active = segments.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => toggleSegment(s)}
                        aria-pressed={active}
                        className={`text-left p-3 rounded-xl border-2 transition ${active ? "border-accent bg-accent-tint" : "border-default"}`}>
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-sm">{t(`segment.label.${s}`)}</div>
                          <span className={`w-4 h-4 grid place-items-center rounded border transition text-[10px] flex-shrink-0 ${active ? "bg-accent border-accent text-white" : "border-fg-tertiary/50"}`}>
                            {active ? "?" : ""}
                          </span>
                        </div>
                        <div className="text-[10px] text-fg-tertiary leading-snug mt-0.5">{t(`segment.tagline.${s}`)}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-fg-tertiary mt-1">{t("onb.selectMany")}</p>
              </div>
              {/* Firm-type picker (mig 240) intentionally hidden: no UI consumes
                  org_type yet; null derives from segments. Re-show when per-firm
                  dashboards ship (CROSS_ORG_COLLABORATION_PLAN C3). */}
              {segments.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-fg-primary block">{t("onb.modules")}</label>
                    <span className="text-[10px] text-fg-tertiary">{t("onb.modulesHint")}</span>
                  </div>
                  <div className="space-y-1.5">
                    {MODULES.map(m => {
                      const on = enabledModules.includes(m.id);
                      const recommended = templateModulesForSegments(segments).includes(m.id);
                      const locked = m.id === CORE_MODULE;
                      return (
                        <button key={m.id} type="button" disabled={locked} onClick={() => toggleModule(m.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition text-left ${on ? "border-accent bg-accent-tint" : "border-default"}`}>
                          <span className={`w-4 h-4 grid place-items-center rounded border transition text-[10px] ${on ? "bg-accent border-accent text-white" : "border-fg-tertiary/50"}`}>
                            {on ? "?" : ""}
                          </span>
                          <span className="flex-1">
                            <span className="flex items-center gap-2 text-sm font-semibold text-fg-primary">
                              {t(`module.${m.id}.label`)}
                              {recommended && <span className="text-[9px] font-bold uppercase tracking-wide text-accent bg-accent-tint px-1.5 py-0.5 rounded-full">{t("onb.recommended")}</span>}
                              {locked && <span className="text-[9px] font-bold uppercase tracking-wide text-fg-tertiary px-1.5 py-0.5 rounded-full">{t("onb.alwaysOn")}</span>}
                            </span>
                            <span className="block text-[11px] text-fg-tertiary leading-snug">{t(`module.${m.id}.desc`)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 flex items-center gap-3">
                <Button variant="secondary" onClick={loadDemoProject} disabled={seedingDemo}>
                  {seedingDemo ? t("onb.loadingDemo") : t("onb.loadDemo")}
                </Button>
                <span className="text-xs text-fg-secondary">{t("onb.demoHint")}</span>
              </div>
              {(error || fieldError) && <div className="text-xs text-error bg-error-tint rounded-lg px-3 py-2">{fieldError ?? error}</div>}
              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={skipWithDefaults} className="text-xs text-fg-tertiary hover:text-fg-secondary underline underline-offset-2">
                  {t("onb.skipBasics")}
                </button>
                <Button onClick={saveOrg}>{t("onb.cont")}</Button>
              </div>
            </div>
          )}

          {/* Step 2: Plan & billing */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">{t("onb.planTitle")}</h2>
              <div className="text-xs text-success bg-success-tint rounded-lg px-3 py-2">
                {t("onb.trialLine", { days: TRIAL_DAYS })}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-fg-primary block">{t("onb.billing")}</label>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-secondary border border-default">
                  <button type="button" onClick={() => setBilling("monthly")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${billing === "monthly" ? "bg-panel text-fg-primary shadow-sm" : "text-fg-secondary hover:text-fg-primary"}`}>
                    {t("onb.monthly")}
                  </button>
                  <button type="button" onClick={() => setBilling("annual")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition inline-flex items-center gap-1.5 ${billing === "annual" ? "bg-panel text-fg-primary shadow-sm" : "text-fg-secondary hover:text-fg-primary"}`}>
                    {t("onb.annual")} <span className="text-[10px] font-bold text-success bg-success-tint px-1.5 py-0.5 rounded-full">{t("onb.twoMonthsFree")}</span>
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {PLAN_TIERS.map(p => {
                  const active = plan === p.id;
                  const pr = priceFor(p, billing);
                  return (
                    <button key={p.id} type="button" onClick={() => setPlan(p.id as SignupPlan)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition relative ${active ? "border-accent bg-accent-tint" : "border-default"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{p.name}</span>
                          {p.popular && <Badge tone="warning">Popular</Badge>}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{pr.amount}<span className="text-xs font-normal text-fg-tertiary">{pr.cadence}</span></div>
                          {billing === "annual" && <div className="text-[10px] text-success font-semibold">{pr.effectiveMonthly} &middot; {t("onb.saveLine", { amount: pr.savingsAmount ?? "" })}</div>}
                        </div>
                      </div>
                      <div className="text-[10px] text-fg-tertiary mt-0.5">{t("signup.gstLine", { amount: formatINR(gstInclusive(billing === "annual" ? p.annual : p.monthly)) })}</div>
                      <div className="text-[11px] text-fg-secondary mt-0.5">{p.tagline}</div>
                    </button>
                  );
                })}
              </div>
              {(error || fieldError) && <div className="text-xs text-error bg-error-tint rounded-lg px-3 py-2">{fieldError ?? error}</div>}
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-fg-tertiary">{t("onb.trialNote")}</span>
                <Button onClick={savePlan}>{t("onb.cont")}</Button>
              </div>
            </div>
          )}

          {/* Step 3: Invite team */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">{t("onb.inviteTitle")}</h2>
              <p className="text-xs text-fg-secondary">{t("onb.inviteSub")}</p>
              <div className="flex gap-2">
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder={t("onb.namePh")} className="flex-1 rounded-lg border border-default px-3 py-2 text-sm" />
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder={t("onb.emailPh")} className="flex-1 rounded-lg border border-default px-3 py-2 text-sm" />
                <Button variant="secondary" onClick={addPending}>{t("onb.add")}</Button>
              </div>
              {(fieldError) && <div className="text-xs text-error bg-error-tint rounded-lg px-3 py-2">{fieldError}</div>}
              {pending.length > 0 && (
                <div className="space-y-1">
                  {pending.map((m, i) => (
                    <div key={i} className="flex items-center justify-between bg-secondary rounded-lg p-2 text-sm">
                      <span>{m.name} ({m.email})</span>
                      <button onClick={() => setPending(p => p.filter((_, j) => j !== i))} className="text-error text-xs">&times;</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="secondary" onClick={() => setStep(4)}>{t("onb.skip")}</Button>
                <Button onClick={commitInvites}>{t("onb.cont")}</Button>
              </div>
            </div>
          )}

          {/* Step 4: First project */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">{t("onb.projectTitle")}</h2>
              <p className="text-xs text-fg-secondary">{t("onb.projectSub")}</p>
              <div>
                <label className="text-xs font-semibold text-fg-primary block mb-1">{t("onb.projectName")}</label>
                <input value={projName} onChange={e => setProjName(e.target.value)} className="w-full rounded-lg border border-default px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-primary block mb-1">{t("onb.clientName")}</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full rounded-lg border border-default px-3 py-2 text-sm" />
              </div>
              {(fieldError) && <div className="text-xs text-error bg-error-tint rounded-lg px-3 py-2">{fieldError}</div>}
              <div>
                <label className="text-xs font-semibold text-fg-primary block mb-1">{t("onb.projectType")}</label>
                <Select value={projType} onChange={e => setProjType(e.target.value as ProjectType)} options={projectTypesForSegments(segments.length ? segments : segment ? [segment] : []).map(pt => ({ value: pt, label: t(`projType.${pt}`) }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-primary block mb-1">{t("onb.startDate")}</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border border-default px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="secondary" onClick={() => setStep(5)}>{t("onb.skip")}</Button>
                <Button onClick={saveProject}>{t("onb.cont")}</Button>
              </div>
            </div>
          )}

          {/* Step 5: Feature presets */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">{t("onb.presetTitle")}</h2>
              <p className="text-xs text-fg-secondary">{t("onb.presetSub")}</p>
              {(["minimal", "balanced", "full"] as const).map(p => (
                <label key={p} className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer border transition-all ${preset === p ? "border-accent bg-accent-tint" : "border-default"}`}>
                  <input type="radio" name="preset" checked={preset === p} onChange={() => setPreset(p)} className="accent-[var(--st-accent)]" />
                  <div>
                    <div className="font-semibold text-sm capitalize">{p}</div>
                    <div className="text-xs text-fg-tertiary">{p === "minimal" ? t("onb.presetMinimalHint") : p === "balanced" ? t("onb.presetBalancedHint") : t("onb.presetFullHint")}</div>
                  </div>
                </label>
              ))}
              <div className="flex justify-end pt-2"><Button onClick={applyPreset}>{t("onb.cont")}</Button></div>
            </div>
          )}

          {/* Step 6: Integrations */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">{t("onb.finishTitle")}</h2>
              <p className="text-xs text-fg-secondary">{t("onb.finishSub")}</p>
              <ul className="text-xs text-fg-secondary space-y-1 list-disc pl-4">
                <li>{t("onb.finishInvite")}</li>
                <li>{t("onb.finishProject")}</li>
              </ul>
              <div className="text-[11px] text-fg-tertiary">{t("onb.aiKeyLabel")}: {aiKey ? "?" : "�"}</div>
              <div className="flex justify-end pt-2 gap-2">
                <Button variant="secondary" onClick={() => setAiKey("")}>{t("onb.skip")}</Button>
                <Button onClick={finish}>{t("onb.finishGo")}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
