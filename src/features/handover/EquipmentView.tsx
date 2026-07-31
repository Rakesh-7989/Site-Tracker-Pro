import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listEquipment, createEquipment, deleteEquipment, type Equipment, type EquipmentOwnership } from "@/app/siteOpsQueries";
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";

const OWN_OPTS = [{ value: "owned", label: "Owned" }, { value: "rental", label: "Rental" }, { value: "hire", label: "Hire" }];
const statusTone = (s: string): "success" | "warning" | "danger" | "neutral" => (s === "on_site" ? "success" : s === "idle" ? "warning" : s === "demobilised" ? "neutral" : "danger");

export function EquipmentView(): JSX.Element {
  const canView = useCan("material:add");
  const canEdit = useCan("material:add");
  const { activeOrg } = useOrgSwitcher();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selProject, setSelProject] = useState("");
  const [rows, setRows] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [assetNo, setAssetNo] = useState("");
  const [eqType, setEqType] = useState("");
  const [ownership, setOwnership] = useState<EquipmentOwnership>("rental");
  const [rate, setRate] = useState("");

  const loadProjects = useCallback(async () => {
    if (!activeOrg?.orgId) return;
    const client = await getClient();
    if (!client) return;
    const { data } = await client.from("projects").select("id, name").eq("org_id", activeOrg.orgId);
    const pList = data ?? [];
    setProjects(pList);
    if (pList.length) setSelProject(pList[0].id);
  }, [activeOrg?.orgId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const reload = useCallback(async () => {
    if (!selProject) { setRows([]); setLoading(false); return; }
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listEquipment(client, selProject);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [selProject]);

  useEffect(() => { void reload(); }, [reload]);

  const { session } = useAuth();
  const { busy, run } = useAction(reload, setError);

  const add = async () => {
    if (!name.trim() || !session || !selProject) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createEquipment(c, {
      projectId: selProject, name: name.trim(), assetNo: assetNo.trim() || undefined, type: eqType.trim() || undefined,
      ownership, ratePerDay: rate.trim() ? parseFloat(rate) : undefined,
    }), {
      apply: () => setRows(prev => [{ id: tmpId, name: name.trim(), assetNo: assetNo.trim() || null, type: eqType.trim() || null, ownership, ratePerDay: rate.trim() ? parseFloat(rate) : null, onSiteFrom: null, onSiteTo: null, status: "on_site" as any, lastMaintenance: null, nextMaintenance: null, operatorName: null, notes: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setName(""); setAssetNo(""); setEqType(""); setRate("");
  };

  const columns: Column<Equipment>[] = [
    {
      key: "detail", header: "Equipment", className: "flex-1 min-w-0",
      sortable: true,
      render: r => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate flex items-center gap-2"><Badge tone={statusTone(r.status)}>{r.status.replace("_", " ")}</Badge>{r.name}{r.assetNo ? ` (${r.assetNo})` : ""}</div>
          <div className="text-[11px] text-fg-tertiary">{[r.type, r.ownership, r.ratePerDay ? `₹${r.ratePerDay}/day` : ""].filter(Boolean).join(" · ")}{r.operatorName ? ` · Op: ${r.operatorName}` : ""}</div>
        </div>
      ),
    },
    ...(canEdit ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: Equipment) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteEquipment(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <Icon name="trash" size={14} className="text-error" />
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Equipment Register</h1>
      {!canView && <Alert variant="danger">You do not have permission to view equipment.</Alert>}
      {canView && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-fg-secondary">Project</label>
            <select value={selProject} onChange={e => setSelProject(e.target.value)} className="px-3 py-1.5 bg-bg-secondary border border-border rounded-lg text-sm text-fg-primary outline-none focus:border-accent">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
          {canEdit && selProject && (
            <Card className="p-3 flex gap-2 flex-wrap items-end">
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Name</span><Input className="mt-1 w-40" placeholder="Excavator 200" value={name} onChange={e => setName(e.target.value)} /></div>
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Asset no.</span><Input className="mt-1 w-28" placeholder="AST-001" value={assetNo} onChange={e => setAssetNo(e.target.value)} /></div>
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Type</span><Input className="mt-1 w-28" placeholder="excavator" value={eqType} onChange={e => setEqType(e.target.value)} /></div>
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Ownership</span><Select className="mt-1 w-auto" value={ownership} onChange={e => setOwnership(e.target.value as EquipmentOwnership)} options={OWN_OPTS} /></div>
              <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Rate/day</span><Input className="mt-1 w-28" type="number" placeholder="5000" value={rate} onChange={e => setRate(e.target.value)} /></div>
              <Button onClick={() => void add()} disabled={busy === "add" || !name.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
            </Card>
          )}
          <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No equipment registered." />
        </>
      )}
    </div>
  );
}
