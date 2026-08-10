import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { useSession } from "@/auth/OrganizationContext";
import { memberProjectScope } from "@/app/queries";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select, Textarea } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listPunch, createPunch, setPunchStatus, deletePunch, type PunchItem, type PunchSeverity, type PunchStatus } from "@/app/siteOpsQueries";
import { listSubmittals, createSubmittal, setSubmittalStatus, deleteSubmittal, type Submittal, type SubmittalStatus, type SubmittalType } from "@/app/siteOpsQueries";
import { listPermits, createPermit, setPermitStatus, deletePermit, type Permit, type PermitKind, type PermitStatus } from "@/app/siteOpsQueries";
import { buildHandoverManifest, serializeManifest } from "@/lib/handoverPacket";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

type Tab = "punch" | "submittals" | "permits" | "generate";

const SEV = [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" }];
const STT = [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "resolved", label: "Resolved" }, { value: "verified", label: "Verified" }, { value: "wont_fix", label: "Won't fix" }];
const sevTone = (s: PunchSeverity): "danger" | "warning" | "neutral" => (s === "critical" || s === "high" ? "danger" : s === "medium" ? "warning" : "neutral");

const SUBMITTAL_TYPE_OPTS = [{ value: "shop_drawing", label: "Shop drawing" }, { value: "material_sample", label: "Material sample" }, { value: "method_statement", label: "Method statement" }];
const SUBMITTAL_STATUS_OPTS = [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "approved_w_comments", label: "Approved w/ comments" }, { value: "rejected", label: "Rejected" }, { value: "resubmit", label: "Resubmit" }];
const PERMIT_KIND_OPTS = [{ value: "environment", label: "Environment" }, { value: "commencement", label: "Commencement" }, { value: "occupancy", label: "Occupancy" }, { value: "fire", label: "Fire" }, { value: "electrical", label: "Electrical" }];
const PERMIT_STATUS_OPTS = [{ value: "applied", label: "Applied" }, { value: "issued", label: "Issued" }, { value: "rejected", label: "Rejected" }, { value: "expired", label: "Expired" }, { value: "renewal_due", label: "Renewal due" }];

export function HandoverPacketView(): JSX.Element {
  const canGenerate = useCan("handover:generate");
  const canView = useCan("handover:view");
  const canSign = useCan("handover:sign");
  const [activeTab, setActiveTab] = useState<Tab>("punch");

  const { activeOrg } = useOrgSwitcher();
  const session = useSession();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");

  const loadProjects = useCallback(async () => {
    if (!activeOrg?.orgId) return;
    const client = await getClient();
    if (!client) return;
    const scope = memberProjectScope(session);
    let q = client.from("projects").select("id, name").eq("org_id", activeOrg.orgId);
    if (scope.mode === "member") {
      if (scope.projectIds.length === 0) { setProjects([]); return; }
      q = q.in("id", scope.projectIds);
    }
    const { data } = await q;
    const pList = data ?? [];
    setProjects(pList);
    if (pList.length) setSelProject(pList[0].id);
  }, [activeOrg?.orgId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Handover Packet</h1>
        {canGenerate && <span className="text-xs font-semibold text-accent bg-accent-tint px-2 py-1 rounded-full">Sprint 4</span>}
      </div>
      {!canView && <Alert variant="danger">You do not have permission to view the handover packet.</Alert>}
      {canView && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-fg-secondary">Project</label>
            <select value={selProject} onChange={e => setSelProject(e.target.value)} className="px-3 py-1.5 bg-bg-secondary border border-border rounded-lg text-sm text-fg-primary outline-none focus:border-accent">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <nav className="flex gap-1 border-b border-border">
            {(["punch", "submittals", "permits", "generate"] as Tab[]).map(t => (
              <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t ? "border-accent text-accent" : "border-transparent text-fg-secondary hover:text-fg-secondary"}`}>
                {t === "punch" ? "Punch List" : t === "submittals" ? "Submittals" : t === "permits" ? "Permits" : "Generate Packet"}
              </button>
            ))}
          </nav>
          {selProject && activeOrg && (
            <>
              {activeTab === "punch" && <PunchList projectId={selProject} />}
              {activeTab === "submittals" && <SubmittalsList projectId={selProject} />}
              {activeTab === "permits" && <PermitsList projectId={selProject} />}
              {activeTab === "generate" && canGenerate && <GenerateSection projectId={selProject} orgId={activeOrg.orgId} />}
              {activeTab === "generate" && !canGenerate && (
                <div className="p-8 text-center text-fg-secondary">
                  You do not have permission to generate handover packets. Contact your project manager.
                </div>
              )}
            </>
          )}
          {selProject && canSign && activeOrg && (
            <div className="mt-6 border-t pt-4">
              <h3 className="font-display text-lg font-bold text-fg-primary mb-4">Sign Handover Packet</h3>
              <SignHandoverSection projectId={selProject} orgId={activeOrg.orgId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PunchList({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const canEdit = useCan("punchlist:add");
  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loc, setLoc] = useState("");
  const [defect, setDefect] = useState("");
  const [trade, setTrade] = useState("");
  const [sev, setSev] = useState<PunchSeverity>("medium");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPunch(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!loc.trim() || !defect.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createPunch(c, { projectId, location: loc.trim(), defect: defect.trim(), trade: trade.trim() || undefined, severity: sev, reportedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, location: loc.trim(), defect: defect.trim(), trade: trade.trim() || null, severity: sev, assignedTo: null, status: "open" as PunchStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setLoc(""); setDefect(""); setTrade("");
  };

  const open = rows.filter(r => r.status === "open" || r.status === "in_progress").length;

  const columns: Column<PunchItem>[] = [
    {
      key: "detail", header: "Item", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate flex items-center gap-2"><Badge tone={sevTone(r.severity)}>{r.severity}</Badge>{r.location} &mdash; {r.defect}</div>
          <div className="text-[11px] text-fg-tertiary">{r.trade ?? "-"}</div>
        </div>
      ),
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: r => canEdit ? (
        <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as PunchStatus; void run(`s-${r.id}`, c => setPunchStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
      ) : <span className="text-xs text-fg-secondary">{r.status.replace("_", " ")}</span>,
    },
    ...(canEdit ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: PunchItem) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deletePunch(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <Icon name="trash" size={14} className="text-error" />
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">Punch List</h2>
        {rows.length > 0 && <span className="text-sm text-fg-secondary">{open} open</span>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Location</span><Input className="mt-1 w-32" placeholder="Unit 4B" value={loc} onChange={e => setLoc(e.target.value)} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Defect</span><Input className="mt-1" placeholder="e.g. Paint chipped" value={defect} onChange={e => setDefect(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Trade</span><Input className="mt-1 w-28" placeholder="finishing" value={trade} onChange={e => setTrade(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Severity</span><Select className="mt-1 w-auto" value={sev} onChange={e => setSev(e.target.value as PunchSeverity)} options={SEV} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !loc.trim() || !defect.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No punch items." />
    </div>
  );
}

function SubmittalsList({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const canEdit = useCan("project:create");
  const [rows, setRows] = useState<Submittal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [no, setNo] = useState("");
  const [type, setType] = useState<SubmittalType>("shop_drawing");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listSubmittals(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!no.trim() || !title.trim() || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createSubmittal(c, { projectId, no: no.trim(), type, title: title.trim(), description: desc.trim() || undefined }), {
      apply: () => setRows(prev => [{ id: tmpId, no: no.trim(), type, title: title.trim(), description: desc.trim() || null, status: "pending" as SubmittalStatus, submittedBy: null, submittedAt: null, reviewerRole: null, reviewedBy: null, reviewedAt: null, comments: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setNo(""); setTitle(""); setDesc("");
  };

  const columns: Column<Submittal>[] = [
    {
      key: "detail", header: "Submittal", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{r.no} &mdash; {r.title}</div>
          <div className="text-[11px] text-fg-tertiary">{r.type.replace("_", " ")}{r.description ? ` · ${r.description}` : ""}</div>
        </div>
      ),
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: r => canEdit ? (
        <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as SubmittalStatus; void run(`s-${r.id}`, c => setSubmittalStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={SUBMITTAL_STATUS_OPTS} />
      ) : <Badge tone="neutral">{r.status.replace("_", " ")}</Badge>,
    },
    ...(canEdit ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: Submittal) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteSubmittal(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <Icon name="trash" size={14} className="text-error" />
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Submittals</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">No.</span><Input className="mt-1 w-24" placeholder="S-001" value={no} onChange={e => setNo(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span><Select className="mt-1 w-auto" value={type} onChange={e => setType(e.target.value as SubmittalType)} options={SUBMITTAL_TYPE_OPTS} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span><Input className="mt-1" placeholder="Drawing revision" value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Description</span><Input className="mt-1" placeholder="Optional notes" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !no.trim() || !title.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No submittals." />
    </div>
  );
}

function PermitsList({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const canEdit = useCan("compliance:view");
  const [rows, setRows] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<PermitKind>("environment");
  const [refNo, setRefNo] = useState("");
  const [authority, setAuthority] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listPermits(client, projectId);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createPermit(c, { projectId, kind, issuingAuthority: authority.trim() || undefined, refNo: refNo.trim() || undefined }), {
      apply: () => setRows(prev => [{ id: tmpId, kind, issuingAuthority: authority.trim() || null, refNo: refNo.trim() || null, appliedAt: null, issuedAt: null, validUntil: null, status: "applied" as PermitStatus, cost: null, notes: null, appliedBy: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setRefNo(""); setAuthority("");
  };

  const columns: Column<Permit>[] = [
    {
      key: "detail", header: "Permit", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{r.kind}{r.refNo ? ` &mdash; ${r.refNo}` : ""}</div>
          <div className="text-[11px] text-fg-tertiary">{r.issuingAuthority ?? "-"}{r.validUntil ? ` · Valid until ${r.validUntil}` : ""}</div>
        </div>
      ),
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: r => canEdit ? (
        <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as PermitStatus; void run(`s-${r.id}`, c => setPermitStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={PERMIT_STATUS_OPTS} />
      ) : <Badge tone="neutral">{r.status.replace("_", " ")}</Badge>,
    },
    ...(canEdit ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: Permit) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deletePermit(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <Icon name="trash" size={14} className="text-error" />
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Permits</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Kind</span><Select className="mt-1 w-auto" value={kind} onChange={e => setKind(e.target.value as PermitKind)} options={PERMIT_KIND_OPTS} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Ref no.</span><Input className="mt-1" placeholder="e.g. ENV-001" value={refNo} onChange={e => setRefNo(e.target.value)} /></div>
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Authority</span><Input className="mt-1" placeholder="e.g. EPA" value={authority} onChange={e => setAuthority(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Add permit"}</Button>
        </Card>
      )}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No permits tracked." />
    </div>
  );
}

function GenerateSection({ projectId, orgId }: { projectId: string; orgId: string }): JSX.Element {
  const [manifest, setManifest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setError(null); setManifest("");
    try {
      const client = await getClient();
      if (!client) { setError("Backend not configured."); return; }
      const [{ data: submittals }, { data: permits }] = await Promise.all([
        client.from("submittals").select("id, no, type, title, description").eq("project_id", projectId),
        client.from("permits").select("id, kind, issuing_authority, ref_no, status").eq("project_id", projectId),
      ]);
      const { data: proj } = await client.from("projects").select("id,name,slug,started_at,completed_at,address").eq("id", projectId).single();
      const { data: org } = await client.from("orgs").select("id,name").eq("id", orgId).single();
      const result = await buildHandoverManifest({
        project: { id: proj?.id, name: proj?.name, slug: proj?.slug, started_at: proj?.started_at, completed_at: proj?.completed_at, address: proj?.address },
        org: { id: org?.id, name: org?.name },
        drawings: (submittals ?? []).map(s => ({ id: s.id, title: s.title, drawing_no: s.no })),
        photos: [], payments: [], ra_bills: [],
        compliance: (permits ?? []).map(p => ({ id: p.id, kind: p.kind, ack_no: p.ref_no, state: p.status, filed_at: null })),
      });
      setManifest(serializeManifest(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
    setLoading(false);
  };

    return (
      <div className="space-y-4">
        <h2 className="font-display text-lg font-bold text-fg-primary">Generate Handover Packet</h2>
        <p className="text-sm text-fg-secondary">Bundle all submittals and permits into a single handover manifest. The manifest is hashed and a merkle root is computed for the blockchain anchor.</p>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button onClick={() => void generate()} disabled={loading}>{loading ? <Spinner size={14} /> : "Generate Packet"}</Button>
        {manifest && (
          <Card className="p-4">
            <h3 className="font-display text-sm font-bold text-fg-primary mb-2">Manifest Output</h3>
            <pre className="text-xs font-mono text-fg-secondary whitespace-pre-wrap max-h-64 overflow-auto bg-bg-secondary rounded-lg p-3">{manifest}</pre>
          </Card>
        )}
      </div>
    );
}

function SignHandoverSection({ projectId, orgId }: { projectId: string; orgId: string }): JSX.Element {
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  const sign = async () => {
    if (!signature.trim()) {
      setError("Signature is required.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const client = await getClient();
      if (!client) { setError("Backend not configured."); return; }
      // Sign the handover packet (implementation depends on your API/endpoint)
      const { error: signError } = await client
        .from("handover_signatures")
        .insert({
          project_id: projectId,
          org_id: orgId,
          signed_by: session?.user.id,
          signature: signature,
          signed_at: new Date().toISOString(),
        });
      if (signError) throw signError;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign handover packet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4">
      <h3 className="font-display text-sm font-bold text-fg-primary mb-2">Sign Handover Packet</h3>
      <p className="text-xs text-fg-secondary mb-4">Please provide your signature to finalize the handover packet. This signature will be recorded and included in the final handover packet.
      </p>
      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
      <Textarea
        placeholder="Type your signature here..."
        value={signature}
        onChange={e => setSignature(e.target.value)}
        rows={4}
        className="mb-4"
      />
      <Button onClick={() => void sign()} disabled={loading || !signature.trim()} leftIcon={<Icon name="check" size={16} />}>{loading ? <Spinner size={14} /> : "Sign Handover Packet"}</Button>
      <p className="text-xs text-fg-tertiary mt-3">By signing, you acknowledge that you have reviewed all punch list items, submittals, and permits, and the project is ready for handover.</p>
    </Card>
  );
}
