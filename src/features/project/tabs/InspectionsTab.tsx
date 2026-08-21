// SiteTrack Pro — Enterprise Quality, Inspections, Lab Testing, NCR & Handover Suite
// Full multi-trade quality lifecycle supporting Civil, MEP, Interior & Consultancy domains.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import {
  listInspections,
  createInspection,
  setInspectionResult,
  deleteInspection,
  type Inspection,
  type InspectionResult,
} from "@/app/siteOpsQueries";
import {
  listCorrectiveActions,
  createCorrectiveAction,
  setCorrectiveStatus,
  deleteCorrectiveAction,
  correctiveRollup,
  CORRECTIVE_NEXT,
  CORRECTIVE_STATUS_LABEL,
  CORRECTIVE_PRIORITY_LABEL,
  type CorrectiveAction,
  type CorrectiveStatus,
} from "@/app/qualityQueries";
import { publishCorrectiveActionOpened } from "@/app/outboxQueries";
import {
  TRADE_TEMPLATES,
  INITIAL_LAB_TESTS,
  INITIAL_NCRS,
  type TradeTemplate,
  type ChecklistRun,
  type LabTestRecord,
  type NcrRecord,
} from "@/app/qualityLifecycle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

type QualitySubTab = "inspections" | "checklists" | "lab_tests" | "ncr" | "corrective";

const RES = [
  { value: "pending", label: "Pending" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "conditional", label: "Conditional" },
];

const resTone = (r: InspectionResult): "neutral" | "success" | "danger" | "warning" =>
  r === "pass" ? "success" : r === "fail" ? "danger" : r === "conditional" ? "warning" : "neutral";

const PRIOS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const prioTone = (p: CorrectiveAction["priority"]): "neutral" | "warning" | "danger" =>
  p === "critical" ? "danger" : p === "high" ? "warning" : "neutral";

const actionTone = (s: CorrectiveStatus): "neutral" | "warning" | "success" =>
  s === "verified" ? "success" : s === "open" ? "warning" : "neutral";

const ncrSeverityTone = (s: NcrRecord["severity"]): "neutral" | "warning" | "danger" =>
  s === "critical" ? "danger" : s === "major" ? "warning" : "neutral";

export function InspectionsTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("inspection:create", { orgId: activeOrg?.orgId, projectId });

  const [activeSubTab, setActiveSubTab] = useState<QualitySubTab>("inspections");
  const [rows, setRows] = useState<Inspection[]>([]);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states for basic inspections
  const [type, setType] = useState("quality");
  const [scope, setScope] = useState("");
  const [sd, setSd] = useState("");
  const [isHoldPoint, setIsHoldPoint] = useState(false);

  // Form states for corrective actions
  const [caDesc, setCaDesc] = useState("");
  const [caPrio, setCaPrio] = useState("high");
  const [caAssigned, setCaAssigned] = useState("");
  const [caDue, setCaDue] = useState("");

  // Quality Engine states
  const [selectedTemplate, setSelectedTemplate] = useState<TradeTemplate | null>(null);
  const [activeChecklistRun, setActiveChecklistRun] = useState<ChecklistRun | null>(null);
  const [savedChecklists, setSavedChecklists] = useState<ChecklistRun[]>([]);
  const [labTests, setLabTests] = useState<LabTestRecord[]>(() =>
    INITIAL_LAB_TESTS.map((t) => ({ ...t, projectId }))
  );
  const [ncrs, setNcrs] = useState<NcrRecord[]>(() =>
    INITIAL_NCRS.map((n) => ({ ...n, projectId }))
  );

  // New Lab Test Form state
  const [newTestType, setNewTestType] = useState<LabTestRecord["testType"]>("concrete_cube");
  const [newLot, setNewLot] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newSpec, setNewSpec] = useState("M30 Grade Concrete");
  const [newActualVal, setNewActualVal] = useState("");
  const [newExpectedVal, setNewExpectedVal] = useState("20.0");
  const [newLabName, setNewLabName] = useState("Site Quality Testing Lab");

  // New NCR Form state
  const [showNcrModal, setShowNcrModal] = useState(false);
  const [ncrTitle, setNcrTitle] = useState("");
  const [ncrSeverity, setNcrSeverity] = useState<NcrRecord["severity"]>("major");
  const [ncrLocation, setNcrLocation] = useState("");
  const [ncrPackage, setNcrPackage] = useState("Structural RCC");
  const [ncrFinding, setNcrFinding] = useState("");
  const [ncrImmediate, setNcrImmediate] = useState("");
  const [ncrRoot, setNcrRoot] = useState("");
  const [ncrCorrective, setNcrCorrective] = useState("");
  const [ncrPreventive, setNcrPreventive] = useState("");
  const [ncrContractor, setNcrContractor] = useState("");
  const [ncrReworkCost, setNcrReworkCost] = useState("0");
  const [ncrDueDate, setNcrDueDate] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = await getClient();
    if (!client) {
      setError("Backend not configured.");
      setLoading(false);
      return;
    }
    const res = await listInspections(client, projectId);
    if (res.ok) setRows(res.data);
    else setError(res.error);

    const ca = await listCorrectiveActions(client, projectId);
    if (ca.ok) setActions(ca.data);
    else setError(ca.error);

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!session) return;
    const tmpId = "tmp-" + Date.now();
    const formattedScope = isHoldPoint
      ? `[HOLD POINT] ${scope.trim() || "Mandatory Inspection"}`
      : scope.trim() || undefined;

    await run(
      "add",
      (c) =>
        createInspection(c, {
          projectId,
          type,
          scope: formattedScope,
          scheduledDate: sd || null,
          inspectorId: session.user.id,
        }),
      {
        apply: () =>
          setRows(
            (prev) =>
              [
                {
                  id: tmpId,
                  type,
                  scope: formattedScope,
                  scheduledDate: sd || null,
                  result: "pending" as InspectionResult,
                  inspectorName: null,
                },
                ...prev,
              ] as Inspection[]
          ),
        rollback: () => setRows((prev) => prev.filter((x) => x.id !== tmpId)),
      }
    );
    setScope("");
    setSd("");
    setIsHoldPoint(false);
  };

  const addAction = async () => {
    if (!caDesc.trim()) return;
    const tmpId = "tmp-" + Date.now();
    await run(
      "ca",
      async (c) => {
        const res = await createCorrectiveAction(c, {
          projectId,
          description: caDesc.trim(),
          priority: caPrio as CorrectiveAction["priority"],
          assignedTo: caAssigned.trim() || undefined,
          dueDate: caDue || null,
        });
        if (res.ok && activeOrg?.orgId) {
          await publishCorrectiveActionOpened(c, {
            orgId: activeOrg.orgId,
            projectId,
            actionId: res.data.id,
            description: caDesc.trim(),
            priority: caPrio,
          });
        }
        return res;
      },
      {
        apply: () =>
          setActions((prev) => [
            {
              id: tmpId,
              projectId,
              inspectionId: null,
              description: caDesc.trim(),
              priority: caPrio as CorrectiveAction["priority"],
              status: "open" as CorrectiveStatus,
              assignedTo: caAssigned.trim() || null,
              dueDate: caDue || null,
              openedByName: null,
              openedAt: new Date().toISOString(),
            },
            ...prev,
          ]),
        rollback: () => setActions((prev) => prev.filter((x) => x.id !== tmpId)),
      }
    );
    setCaDesc("");
    setCaPrio("high");
    setCaAssigned("");
    setCaDue("");
  };

  const advanceAction = async (a: CorrectiveAction) => {
    const next = CORRECTIVE_NEXT[a.status];
    if (!next) return;
    await run(
      `as-${a.id}`,
      (c) =>
        setCorrectiveStatus(c, a.id, next, {
          verifiedBy: next === "verified" ? session?.user.id ?? null : undefined,
        }),
      {
        apply: () =>
          setActions((prev) =>
            prev.map((x) => (x.id === a.id ? { ...x, status: next } : x))
          ),
        rollback: () =>
          setActions((prev) =>
            prev.map((x) => (x.id === a.id ? { ...x, status: a.status } : x))
          ),
      }
    );
  };

  // Start Checklist Execution
  const startChecklist = (tpl: TradeTemplate) => {
    setSelectedTemplate(tpl);
    setActiveChecklistRun({
      id: `chk-${Date.now()}`,
      projectId,
      templateId: tpl.id,
      title: tpl.title,
      location: "",
      workPackage: tpl.scopeDescription,
      inspectedBy: session?.user.email ?? "Lead Quality Inspector",
      inspectedAt: new Date().toISOString().split("T")[0],
      status: "draft",
      items: tpl.items.map((it) => ({
        itemId: it.id,
        status: "pending",
        measuredValue: "",
        notes: "",
      })),
    });
  };

  const updateChecklistItem = (
    itemId: string,
    field: "status" | "measuredValue" | "notes",
    val: string
  ) => {
    if (!activeChecklistRun) return;
    setActiveChecklistRun({
      ...activeChecklistRun,
      items: activeChecklistRun.items.map((item) =>
        item.itemId === itemId ? { ...item, [field]: val } : item
      ),
    });
  };

  const completeChecklist = () => {
    if (!activeChecklistRun) return;
    const hasFail = activeChecklistRun.items.some((i) => i.status === "fail");
    const finalRun: ChecklistRun = {
      ...activeChecklistRun,
      status: hasFail ? "failed_ncr_opened" : "approved",
    };
    setSavedChecklists((prev) => [finalRun, ...prev]);

    // If there's a failure, auto-generate an NCR
    if (hasFail) {
      const failedItem = activeChecklistRun.items.find((i) => i.status === "fail");
      const tplItem = selectedTemplate?.items.find((i) => i.id === failedItem?.itemId);
      const newNcr: NcrRecord = {
        id: `ncr-${Date.now()}`,
        projectId,
        ncrNumber: `NCR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        title: `Defect in ${tplItem?.description ?? activeChecklistRun.title}`,
        severity: "major",
        status: "issued",
        location: activeChecklistRun.location || "Site Level",
        workPackage: activeChecklistRun.workPackage,
        findingDescription: `Failed item: ${tplItem?.code} - ${tplItem?.description}. Measured/Notes: ${failedItem?.notes || failedItem?.measuredValue || "Non-compliant"}.`,
        immediateCause: "Field execution variance from approved technical submittal.",
        correctiveAction: "Rectify and re-inspect as per quality standard protocol.",
        preventiveAction: "Re-brief trade supervisor on technical tolerances.",
        responsibleContractor: "Site Subcontractor",
        targetResolutionDate: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
        slaHoursRemaining: 72,
        isBackchargeable: true,
        estimatedReworkCost: 25000,
      };
      setNcrs((prev) => [newNcr, ...prev]);
    }

    setActiveChecklistRun(null);
    setSelectedTemplate(null);
  };

  // Add Lab Test
  const handleAddLabTest = () => {
    if (!newLot.trim() || !newLocation.trim()) return;
    const act = parseFloat(newActualVal) || 0;
    const exp = parseFloat(newExpectedVal) || 0;
    const isPass = act >= exp;

    const record: LabTestRecord = {
      id: `lab-${Date.now()}`,
      projectId,
      testType: newTestType,
      materialLot: newLot.trim(),
      pourLocation: newLocation.trim(),
      sampleDate: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
      testDate: new Date().toISOString().split("T")[0],
      targetGradeOrSpec: newSpec.trim(),
      ageDays: newTestType === "concrete_cube" ? 7 : undefined,
      expectedValue: exp,
      actualValue: act,
      unit: newTestType === "concrete_cube" ? "MPa" : newTestType === "slump" ? "mm" : "% MDD",
      status: isPass ? "pass" : "fail",
      testedByLab: newLabName.trim(),
      certificateRef: `CERT-${Math.floor(1000 + Math.random() * 9000)}`,
    };

    setLabTests((prev) => [record, ...prev]);
    setNewLot("");
    setNewLocation("");
    setNewActualVal("");
  };

  // Add Manual NCR
  const handleCreateNcr = () => {
    if (!ncrTitle.trim() || !ncrLocation.trim()) return;
    const newNcr: NcrRecord = {
      id: `ncr-${Date.now()}`,
      projectId,
      ncrNumber: `NCR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      title: ncrTitle.trim(),
      severity: ncrSeverity,
      status: "issued",
      location: ncrLocation.trim(),
      workPackage: ncrPackage.trim(),
      findingDescription: ncrFinding.trim(),
      immediateCause: ncrImmediate.trim() || undefined,
      rootCause: ncrRoot.trim() || undefined,
      correctiveAction: ncrCorrective.trim() || "Perform approved repair procedure.",
      preventiveAction: ncrPreventive.trim() || "Enforce pre-pour checklist clearance.",
      responsibleContractor: ncrContractor.trim() || "Main Civil Contractor",
      targetResolutionDate: ncrDueDate || new Date(Date.now() + 4 * 86400000).toISOString().split("T")[0],
      slaHoursRemaining: ncrSeverity === "critical" ? 24 : 72,
      isBackchargeable: true,
      estimatedReworkCost: parseFloat(ncrReworkCost) || 0,
    };

    setNcrs((prev) => [newNcr, ...prev]);
    setShowNcrModal(false);
    setNcrTitle("");
    setNcrLocation("");
    setNcrFinding("");
    setNcrImmediate("");
    setNcrRoot("");
    setNcrCorrective("");
    setNcrPreventive("");
  };

  // Rollups & Sentinel calculations
  const rollup = correctiveRollup(actions);
  const activeHoldPoints = rows.filter(
    (r) => r.scope?.includes("[HOLD POINT]") && r.result !== "pass"
  ).length;
  const labPassRate =
    labTests.length > 0
      ? Math.round(
          (labTests.filter((t) => t.status === "pass").length / labTests.length) * 100
        )
      : 100;
  const openNcrsCount = ncrs.filter((n) => n.status !== "verified_closed").length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quality Sentinel */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-fg-primary tracking-tight">
            Quality Management & Inspection Suite
          </h2>
          <p className="text-xs text-fg-secondary mt-0.5">
            Enterprise QA/QC, Trade Checklists, Hold Points, Material Tests & NCR Lifecycle
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-default bg-panel text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-fg-secondary">Quality Sentinel:</span>
            {activeHoldPoints > 0 ? (
              <span className="text-amber-500 font-bold">{activeHoldPoints} Hold Point(s) Active</span>
            ) : (
              <span className="text-emerald-600 font-bold">All Gates Clear</span>
            )}
          </div>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card padding="sm" className="bg-panel border border-default">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Hold Points Active
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${activeHoldPoints > 0 ? "text-amber-600" : "text-fg-primary"}`}>
              {activeHoldPoints}
            </span>
            <span className="text-[11px] text-fg-secondary">Mandatory Stops</span>
          </div>
        </Card>

        <Card padding="sm" className="bg-panel border border-default">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Open NCRs
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${openNcrsCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {openNcrsCount}
            </span>
            <span className="text-[11px] text-fg-secondary">Defect Notices</span>
          </div>
        </Card>

        <Card padding="sm" className="bg-panel border border-default">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Lab Test Pass Rate
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{labPassRate}%</span>
            <span className="text-[11px] text-fg-secondary">{labTests.length} Total Tests</span>
          </div>
        </Card>

        <Card padding="sm" className="bg-panel border border-default">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Corrective Actions
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-fg-primary">{rollup.open + rollup.inProgress}</span>
            <span className="text-[11px] text-fg-secondary">{rollup.verified} Verified</span>
          </div>
        </Card>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex border-b border-default gap-1">
        {[
          { id: "inspections", label: "Inspections & Hold Points", badge: rows.length },
          { id: "checklists", label: "Trade Checklists", badge: TRADE_TEMPLATES.length },
          { id: "lab_tests", label: "Lab Testing (Cubes)", badge: labTests.length },
          { id: "ncr", label: "NCR & RCA", badge: openNcrsCount },
          { id: "corrective", label: "Corrective Actions", badge: rollup.open },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as QualitySubTab)}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 flex items-center gap-2 ${
              activeSubTab === tab.id
                ? "border-accent text-accent bg-accent/5"
                : "border-transparent text-fg-secondary hover:text-fg-primary"
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeSubTab === tab.id ? "bg-accent text-white" : "bg-elevated text-fg-secondary"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* SUB-TAB 1: Inspections & Hold Points */}
      {activeSubTab === "inspections" && (
        <div className="space-y-4">
          {canEdit && (
            <Card padding="md" className="border border-default bg-elevated">
              <div className="text-xs font-bold uppercase tracking-wider text-fg-tertiary mb-2">
                Schedule Quality / Hold Point Inspection
              </div>
              <div className="flex gap-3 flex-wrap items-end">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Discipline
                  </span>
                  <Select
                    fit
                    className="mt-1 w-auto text-xs"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    options={[
                      { value: "quality", label: "General Quality" },
                      { value: "structural", label: "Civil / Structural" },
                      { value: "mep", label: "MEP Concealment" },
                      { value: "safety", label: "Safety Audit" },
                      { value: "handover", label: "Handover Inspection" },
                    ]}
                  />
                </div>

                <div className="flex-1 min-w-[200px]">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Inspection Scope & Location
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. 4th Floor Slab Pour Rebar & Conduits"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  />
                </div>

                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Target Date
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    type="date"
                    value={sd}
                    onChange={(e) => setSd(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2 pb-2.5">
                  <input
                    type="checkbox"
                    id="holdpoint-check"
                    checked={isHoldPoint}
                    onChange={(e) => setIsHoldPoint(e.target.checked)}
                    className="rounded border-default text-accent focus:ring-accent"
                  />
                  <label htmlFor="holdpoint-check" className="text-xs font-medium text-fg-primary cursor-pointer">
                    Mandatory Hold Point
                  </label>
                </div>

                <Button
                  onClick={() => void add()}
                  disabled={busy === "add"}
                  leftIcon="calendar"
                  size="sm"
                >
                  {busy === "add" ? <Spinner size={14} /> : "Schedule Inspection"}
                </Button>
              </div>
            </Card>
          )}

          {loading ? (
            <div className="grid place-items-center py-12">
              <Spinner size={24} />
            </div>
          ) : rows.length === 0 ? (
            <Card padding="lg" className="text-center text-fg-secondary">
              No inspections scheduled yet. Use the form above to add quality inspections.
            </Card>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const isHp = r.scope?.includes("[HOLD POINT]");
                const cleanScope = r.scope?.replace("[HOLD POINT]", "").trim();

                return (
                  <Card
                    key={r.id}
                    className={`p-3.5 flex items-center justify-between gap-3 border transition-colors ${
                      isHp && r.result === "pending"
                        ? "border-amber-500/50 bg-amber-500/5"
                        : "border-default bg-panel"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-fg-primary flex items-center gap-2 truncate">
                        {isHp && (
                          <Badge tone="warning" size="sm">
                            HOLD POINT
                          </Badge>
                        )}
                        <span className="capitalize">{r.type}</span>
                        {cleanScope ? ` — ${cleanScope}` : ""}
                      </div>
                      <div className="text-[11px] text-fg-tertiary mt-0.5">
                        {r.scheduledDate ? `Scheduled for ${r.scheduledDate}` : "Unscheduled"}
                        {r.inspectorName ? ` · Lead: ${r.inspectorName}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canEdit ? (
                        <Select
                          fit
                          className="w-auto text-xs"
                          value={r.result}
                          onChange={(e) => {
                            const v = e.target.value as InspectionResult;
                            void run(
                              `s-${r.id}`,
                              (c) => setInspectionResult(c, r.id, v),
                              {
                                apply: () =>
                                  setRows((prev) =>
                                    prev.map((x) =>
                                      x.id === r.id ? { ...x, result: v } : x
                                    )
                                  ),
                                rollback: () =>
                                  setRows((prev) =>
                                    prev.map((x) =>
                                      x.id === r.id ? { ...x, result: r.result } : x
                                    )
                                  ),
                              }
                            );
                          }}
                          options={RES}
                        />
                      ) : (
                        <Badge tone={resTone(r.result)}>{r.result}</Badge>
                      )}

                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void run(
                              `d-${r.id}`,
                              (c) => deleteInspection(c, r.id),
                              {
                                apply: () => setRows((prev) => prev.filter((x) => x.id !== r.id)),
                                rollback: () => setRows((prev) => [...prev, r]),
                              }
                            )
                          }
                        >
                          <span className="text-error font-bold">✕</span>
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: Trade Checklists */}
      {activeSubTab === "checklists" && (
        <div className="space-y-6">
          {!activeChecklistRun ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-fg-primary uppercase tracking-wider">
                    Trade Inspection Checklists
                  </h3>
                  <p className="text-xs text-fg-secondary">
                    Select an engineering discipline template to execute an interactive site inspection.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TRADE_TEMPLATES.map((tpl) => (
                  <Card key={tpl.id} padding="md" className="border border-default hover:border-accent transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral" size="sm" className="uppercase font-mono">
                            {tpl.trade}
                          </Badge>
                          <h4 className="font-bold text-sm text-fg-primary">{tpl.title}</h4>
                        </div>
                        <p className="text-xs text-fg-secondary mt-1.5 leading-relaxed">
                          {tpl.scopeDescription}
                        </p>
                        <div className="text-[11px] text-fg-tertiary mt-2">
                          {tpl.items.length} Verification Checks
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => startChecklist(tpl)}
                        leftIcon="clipboard"
                      >
                        Start Inspection
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {savedChecklists.length > 0 && (
                <div className="mt-8 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-fg-tertiary">
                    Recently Executed Checklists ({savedChecklists.length})
                  </h4>
                  <div className="space-y-2">
                    {savedChecklists.map((chk) => (
                      <Card key={chk.id} padding="sm" className="border border-default flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-fg-primary flex items-center gap-2">
                            <span>{chk.title}</span>
                            <Badge tone={chk.status === "approved" ? "success" : "danger"}>
                              {chk.status === "approved" ? "Passed" : "NCR Generated"}
                            </Badge>
                          </div>
                          <div className="text-xs text-fg-tertiary mt-0.5">
                            Location: {chk.location || "Site"} · Inspected: {chk.inspectedAt} · By: {chk.inspectedBy}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Active Checklist Runner */
            <Card padding="lg" className="border border-accent/40 bg-elevated space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3">
                <div>
                  <Badge tone="neutral" className="uppercase font-mono text-[10px]">
                    Active Checklist Run
                  </Badge>
                  <h3 className="text-base font-bold text-fg-primary mt-1">
                    {activeChecklistRun.title}
                  </h3>
                  <p className="text-xs text-fg-secondary">{activeChecklistRun.workPackage}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveChecklistRun(null);
                      setSelectedTemplate(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" variant="primary" onClick={completeChecklist} leftIcon="check">
                    Sign & Complete Inspection
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-panel p-3 rounded-lg border border-default">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Location / Grid / Level
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. Tower B / Level 3 / Slab 3B"
                    value={activeChecklistRun.location}
                    onChange={(e) =>
                      setActiveChecklistRun({ ...activeChecklistRun, location: e.target.value })
                    }
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Inspector
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    value={activeChecklistRun.inspectedBy}
                    onChange={(e) =>
                      setActiveChecklistRun({ ...activeChecklistRun, inspectedBy: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-fg-tertiary">
                  Verification Criteria
                </div>
                {selectedTemplate?.items.map((item, idx) => {
                  const currentRes = activeChecklistRun.items.find((i) => i.itemId === item.id);
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-default bg-panel flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-accent">
                            {idx + 1}. {item.code}
                          </span>
                          {item.standardRef && (
                            <span className="text-[10px] bg-elevated px-1.5 py-0.5 rounded text-fg-tertiary">
                              {item.standardRef}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-fg-primary mt-1">
                          {item.description}
                        </div>
                        {item.requiresMeasurement && (
                          <div className="text-[11px] text-fg-secondary mt-0.5">
                            Expected: {item.expectedMin} - {item.expectedMax} {item.unit}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {item.requiresMeasurement && (
                          <div className="w-28">
                            <Input
                              className="text-xs h-8"
                              placeholder={`Val (${item.unit})`}
                              value={currentRes?.measuredValue ?? ""}
                              onChange={(e) =>
                                updateChecklistItem(item.id, "measuredValue", e.target.value)
                              }
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-1 bg-elevated p-1 rounded-md border border-default">
                          {(["pass", "fail", "na"] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => updateChecklistItem(item.id, "status", st)}
                              className={`px-2.5 py-1 text-xs font-bold rounded uppercase transition-colors ${
                                currentRes?.status === st
                                  ? st === "pass"
                                    ? "bg-emerald-600 text-white"
                                    : st === "fail"
                                    ? "bg-rose-600 text-white"
                                    : "bg-gray-600 text-white"
                                  : "text-fg-secondary hover:text-fg-primary"
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* SUB-TAB 3: Lab Tests & Concrete Cube Strength */}
      {activeSubTab === "lab_tests" && (
        <div className="space-y-4">
          <Card padding="md" className="border border-default bg-elevated space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-fg-tertiary">
              Log Material & Concrete Laboratory Test
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-2 items-end">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  Test Type
                </span>
                <Select
                  fit
                  className="mt-1 w-full text-xs"
                  value={newTestType}
                  onChange={(e) => setNewTestType(e.target.value as LabTestRecord["testType"])}
                  options={[
                    { value: "concrete_cube", label: "Concrete Cube (7d/28d)" },
                    { value: "slump", label: "Workability Slump" },
                    { value: "soil_compaction", label: "Soil Compaction MDD" },
                    { value: "rebar_tensile", label: "Rebar Tensile Test" },
                  ]}
                />
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  Material Lot #
                </span>
                <Input
                  className="mt-1 text-xs"
                  placeholder="e.g. CON-LOT-104"
                  value={newLot}
                  onChange={(e) => setNewLot(e.target.value)}
                />
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  Pour / Sample Location
                </span>
                <Input
                  className="mt-1 text-xs"
                  placeholder="e.g. Slab Pour 4B"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                />
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  Target / Spec
                </span>
                <Input
                  className="mt-1 text-xs"
                  placeholder="e.g. M30 Grade"
                  value={newSpec}
                  onChange={(e) => setNewSpec(e.target.value)}
                />
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  Tested Actual
                </span>
                <Input
                  className="mt-1 text-xs"
                  placeholder="e.g. 23.4"
                  value={newActualVal}
                  onChange={(e) => setNewActualVal(e.target.value)}
                />
              </div>

              <Button
                size="sm"
                onClick={handleAddLabTest}
                disabled={!newLot.trim() || !newLocation.trim()}
                leftIcon="plus"
              >
                Log Test
              </Button>
            </div>
          </Card>

          <div className="space-y-2">
            {labTests.map((t) => (
              <Card key={t.id} padding="sm" className="border border-default flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-fg-primary flex items-center gap-2 truncate">
                    <Badge tone={t.status === "pass" ? "success" : "danger"} size="sm">
                      {t.status.toUpperCase()}
                    </Badge>
                    <span className="uppercase font-mono text-xs">{t.materialLot}</span>
                    <span>— {t.pourLocation}</span>
                  </div>
                  <div className="text-xs text-fg-tertiary mt-0.5">
                    Spec: {t.targetGradeOrSpec} · Expected: {t.expectedValue} {t.unit} · Tested:{" "}
                    <strong className={t.actualValue >= t.expectedValue ? "text-emerald-600" : "text-rose-600"}>
                      {t.actualValue} {t.unit}
                    </strong>{" "}
                    · Lab: {t.testedByLab} ({t.testDate})
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.certificateRef && (
                    <span className="text-[11px] font-mono text-fg-secondary bg-elevated px-2 py-1 rounded">
                      {t.certificateRef}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Non-Conformance Reports (NCR) & Root Cause Analysis */}
      {activeSubTab === "ncr" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-fg-primary uppercase tracking-wider">
              Non-Conformance Reports (NCR) & CAPA Log
            </h3>
            <Button size="sm" variant="danger" onClick={() => setShowNcrModal(true)} leftIcon="alert">
              Issue New NCR
            </Button>
          </div>

          {/* New NCR Modal */}
          {showNcrModal && (
            <Card padding="lg" className="border border-rose-500/40 bg-elevated space-y-4">
              <div className="flex items-center justify-between border-b border-default pb-2">
                <h4 className="text-base font-bold text-fg-primary">Issue Formal Non-Conformance Report</h4>
                <Button size="sm" variant="ghost" onClick={() => setShowNcrModal(false)}>
                  ✕
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Defect Title
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. Rebar spacing non-conformance in Beam B-12"
                    value={ncrTitle}
                    onChange={(e) => setNcrTitle(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Severity
                  </span>
                  <Select
                    fit
                    className="mt-1 w-full text-xs"
                    value={ncrSeverity}
                    onChange={(e) => setNcrSeverity(e.target.value as NcrRecord["severity"])}
                    options={[
                      { value: "critical", label: "Critical (Immediate Stop Work)" },
                      { value: "major", label: "Major (Rework Required)" },
                      { value: "minor", label: "Minor (Touch-up / Patch)" },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Location & Grid
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. Block A, 2nd Floor Corridor"
                    value={ncrLocation}
                    onChange={(e) => setNcrLocation(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Responsible Contractor
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. Apex Civil Contractors"
                    value={ncrContractor}
                    onChange={(e) => setNcrContractor(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                  Finding & Non-Compliance Description
                </span>
                <Input
                  className="mt-1 text-xs"
                  placeholder="Detailed observations and measurements"
                  value={ncrFinding}
                  onChange={(e) => setNcrFinding(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Corrective Action (Immediate)
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. Chip out and re-pour with micro-concrete"
                    value={ncrCorrective}
                    onChange={(e) => setNcrCorrective(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Preventive Action (Long-term)
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. Mandatory vibrator checklist signoff"
                    value={ncrPreventive}
                    onChange={(e) => setNcrPreventive(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setShowNcrModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onClick={handleCreateNcr} leftIcon="alert">
                  Publish NCR Notice
                </Button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {ncrs.map((n) => (
              <Card key={n.id} padding="md" className="border border-default bg-panel space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-rose-600">{n.ncrNumber}</span>
                      <Badge tone={ncrSeverityTone(n.severity)} size="sm">
                        {n.severity.toUpperCase()}
                      </Badge>
                      <h4 className="font-bold text-sm text-fg-primary">{n.title}</h4>
                    </div>
                    <div className="text-xs text-fg-tertiary mt-1">
                      Location: {n.location} · Contractor: {n.responsibleContractor} · SLA Target:{" "}
                      {n.targetResolutionDate}
                    </div>
                  </div>
                  <Badge tone={n.status === "verified_closed" ? "success" : "warning"}>
                    {n.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </div>

                <p className="text-xs text-fg-secondary bg-elevated p-2.5 rounded-lg border border-default">
                  {n.findingDescription}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-panel p-2 rounded border border-default">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-tertiary block">
                      Corrective Action
                    </span>
                    <span className="text-fg-primary mt-0.5 block">{n.correctiveAction}</span>
                  </div>
                  <div className="bg-panel p-2 rounded border border-default">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-tertiary block">
                      Preventive Action
                    </span>
                    <span className="text-fg-primary mt-0.5 block">{n.preventiveAction}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: Corrective Actions Log (Database-Wired) */}
      {activeSubTab === "corrective" && (
        <Card
          padding="md"
          className="border border-default bg-elevated"
          title={
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                Database Corrective Actions Log
              </div>
              <div className="text-sm font-semibold text-fg-primary">
                {rollup.open + rollup.inProgress} open · {rollup.verified} verified
              </div>
            </div>
          }
          action={
            <div className="flex gap-4 text-[11px] text-fg-secondary">
              <span>Critical {rollup.critical}</span>
              <span>High {rollup.high}</span>
              <span>Resolved {rollup.resolved}</span>
            </div>
          }
        >
          <div className="space-y-3">
            {canEdit && (
              <div className="flex gap-2 flex-wrap items-end">
                <div className="flex-1 min-w-[160px]">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Description
                  </span>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g. re-level 3rd floor slab rebar"
                    value={caDesc}
                    onChange={(e) => setCaDesc(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Priority
                  </span>
                  <Select
                    fit
                    className="mt-1 w-auto text-xs"
                    value={caPrio}
                    onChange={(e) => setCaPrio(e.target.value)}
                    options={PRIOS}
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Assignee
                  </span>
                  <Input
                    fit
                    className="mt-1 w-32 text-xs"
                    placeholder="Name / trade"
                    value={caAssigned}
                    onChange={(e) => setCaAssigned(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Due
                  </span>
                  <Input
                    fit
                    className="mt-1 w-36 text-xs"
                    type="date"
                    value={caDue}
                    onChange={(e) => setCaDue(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => void addAction()}
                  disabled={busy === "ca" || !caDesc.trim()}
                  size="sm"
                >
                  {busy === "ca" ? <Spinner size={14} /> : "Add Action"}
                </Button>
              </div>
            )}

            {actions.length === 0 ? (
              <div className="text-sm text-fg-tertiary py-4 text-center">
                No corrective actions. Failed inspections auto-open here.
              </div>
            ) : (
              <div className="space-y-1.5">
                {actions.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg bg-card border border-default px-3 py-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-fg-primary truncate">
                        {a.description}
                      </div>
                      <div className="text-[11px] text-fg-tertiary truncate">
                        {[
                          a.assignedTo && `→ ${a.assignedTo}`,
                          a.dueDate && `due ${a.dueDate}`,
                          a.openedByName && `opened by ${a.openedByName}`,
                          CORRECTIVE_PRIORITY_LABEL[a.priority],
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge tone={prioTone(a.priority)}>{CORRECTIVE_PRIORITY_LABEL[a.priority]}</Badge>
                      {canEdit && a.status !== "verified" ? (
                        <Button
                          size="sm"
                          disabled={busy === `as-${a.id}`}
                          onClick={() => void advanceAction(a)}
                        >
                          {busy === `as-${a.id}` ? (
                            <Spinner size={12} />
                          ) : (
                            `Mark ${CORRECTIVE_NEXT[a.status]!.replace("_", " ")}`
                          )}
                        </Button>
                      ) : (
                        <Badge tone={actionTone(a.status)}>{CORRECTIVE_STATUS_LABEL[a.status]}</Badge>
                      )}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void run(
                              `ad-${a.id}`,
                              (c) => deleteCorrectiveAction(c, a.id),
                              {
                                apply: () =>
                                  setActions((prev) => prev.filter((x) => x.id !== a.id)),
                                rollback: () => setActions((prev) => [...prev, a]),
                              }
                            )
                          }
                        >
                          <span className="text-error">✕</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
