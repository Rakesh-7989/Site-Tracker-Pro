import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useOrgSwitcher } from "@/auth";
import { Spinner, Alert, Icon } from "@/components/ui/atoms";
import { listProjectsForOrg, type ProjectSummary } from "@/app/queries";
import {
  listBlocks, listFloors, listUnits,
  createBlock, createFloor, createUnit,
  deleteBlock, deleteFloor, deleteUnit,
} from "@/app/hierarchyQueries";
import { buildProjectTree, countHierarchy, rollUpProgress, unitCode } from "@/lib/hierarchy";

import { can } from "@/lib/permissions";

async function getClient() {
  const mod = await import("../../lib/supabase.js");
  return await (mod as any).getSupabaseClient();
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = String(item[key]);
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

export function HierarchyView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const nav = useNavigate();
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner orgId={activeOrg.orgId} user={session.user} nav={nav} />;
}

function Inner({ orgId, user, nav }: { orgId: string; user: any; nav: (path: string) => void }): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [blocks, setBlocks] = useState<Record<string, any[]>>({});
  const [floors, setFloors] = useState<Record<string, any[]>>({});
  const [units, setUnits] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selProject, setSelProject] = useState<string>("");

  const fetchHierarchy = useCallback(async (client: any, projectId: string) => {
    const [bRes, fRes, uRes] = await Promise.all([
      listBlocks(client, projectId),
      listFloors(client, projectId),
      listUnits(client, projectId),
    ]);
    if (bRes.ok) setBlocks({ [projectId]: bRes.data });
    if (fRes.ok) setFloors(groupBy(fRes.data, "blockId"));
    if (uRes.ok) setUnits(groupBy(uRes.data, "floorId"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const client = await getClient();
      if (!client) { setLoading(false); return; }
      const res = await listProjectsForOrg(client, orgId);
      if (cancelled) return;
      if (res.ok) {
        setProjects(res.data);
        if (res.data.length > 0) {
          const firstPid = res.data[0].id;
          setSelProject(firstPid);
          await fetchHierarchy(client, firstPid);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, fetchHierarchy]);

  useEffect(() => {
    if (!selProject) return;
    let cancelled = false;
    void (async () => {
      const client = await getClient();
      if (!client || cancelled) return;
      await fetchHierarchy(client, selProject);
    })();
    return () => { cancelled = true; };
  }, [selProject, fetchHierarchy]);

  const refresh = useCallback(async () => {
    if (!selProject) return;
    const client = await getClient();
    if (!client) return;
    await fetchHierarchy(client, selProject);
  }, [selProject, fetchHierarchy]);

  const toggleNode = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const proj = projects.find(p => p.id === selProject);
  const tree = proj ? buildProjectTree(proj.id, blocks, floors, units) : [];
  const counts = proj ? countHierarchy(proj.id, blocks, floors, units) : { blocks: 0, floors: 0, units: 0 };
  const progress = proj ? rollUpProgress(proj.id, blocks, floors, units) : { project: 0, blocks: {} as Record<string, number>, floors: {} as Record<string, number> };

  const addBlock = async () => {
    const name = window.prompt("Block name (e.g. Block A, Tower 1):"); if (!name) return;
    const code = window.prompt("Short code (2 chars, e.g. BA):", name.split(" ").map((x: string) => x[0]).join("").slice(0, 2).toUpperCase()) || "";
    const client = await getClient();
    if (!client) return;
    const res = await createBlock(client, { projectId: selProject, name, code: code.toUpperCase() });
    if (res.ok) await refresh();
    else alert(res.error);
  };
  const addFloor = async (blockId: string) => {
    const n = window.prompt("Floor number (e.g. 1, 2, B1 for basement):"); if (!n) return;
    const client = await getClient();
    if (!client) return;
    const res = await createFloor(client, { blockId, projectId: selProject, number: n });
    if (res.ok) await refresh();
    else alert(res.error);
  };
  const addUnit = async (floorId: string, blockId: string) => {
    const name = window.prompt("Unit name (e.g. 101, A, Shop-1):"); if (!name) return;
    const type = window.prompt("Unit type (2BHK / 3BHK / Shop / Office / etc.):", "2BHK") || "";
    const client = await getClient();
    if (!client) return;
    const res = await createUnit(client, { floorId, blockId, projectId: selProject, name, type });
    if (res.ok) await refresh();
    else alert(res.error);
  };
  const del = async (level: string, id: string) => {
    if (!window.confirm(`Delete this ${level}? This also removes its children.`)) return;
    const client = await getClient();
    if (!client) return;
    let res;
    if (level === "block") res = await deleteBlock(client, id);
    else if (level === "floor") res = await deleteFloor(client, id);
    else res = await deleteUnit(client, id);
    if (res.ok) await refresh();
    else alert(res.error);
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;

  if (projects.length === 0) return (
    <div className="p-10">
      <div className="bg-white rounded-2xl p-12 text-center" style={{ border: "1px dashed var(--st-line)" }}>
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Icon name="folder" size={24} className="text-amber-700" /></div>
        <div className="font-display text-xl font-semibold text-ink-900 tracking-editorial mb-2">No projects to organise yet</div>
        <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-5">Create a project first, then come back here to add blocks, floors and units. Useful for high-rises, townships and gated communities.</p>
        {can(user, "createProject") && <button onClick={() => nav("/projects/new")} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all"><Icon name="plus" size={14} />Create your first project</button>}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{ borderBottom: "1px solid var(--st-line)" }}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Structure</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Project Hierarchy</h1>
          <p className="text-ink-500 text-sm mt-2">Block → Floor → Unit — useful for residential towers, townships, gated communities.</p>
        </div>
        <select value={selProject || ""} onChange={e => setSelProject(e.target.value)} className="px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {proj && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Project progress</div><div className="font-display text-2xl font-bold text-ink-900">{progress.project}%</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Blocks</div><div className="font-display text-2xl font-bold text-ink-900">{counts.blocks}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Floors</div><div className="font-display text-2xl font-bold text-ink-900">{counts.floors}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Units</div><div className="font-display text-2xl font-bold text-ink-900">{counts.units}</div></div>
      </div>}
      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">{proj?.name || "—"} structure</h2>
          {can(user, "createProject") && <button onClick={addBlock} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-gold text-white font-bold rounded-xl text-xs tracking-wide"><Icon name="plus" size={12} />Add block</button>}
        </div>
        {tree.length === 0 && <div className="text-center py-10 text-ink-500"><Icon name="building" size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No blocks yet. Add the first one to start.</p></div>}
        <div className="space-y-2">
          {tree.map((b: any) => {
            const bExp = expanded[b.id] !== false;
            return (<div key={b.id} className="rounded-xl" style={{ border: "1px solid var(--st-line)" }}>
              <div className="flex items-center gap-3 p-3 bg-cream-200/40">
                <button onClick={() => toggleNode(b.id)} className="text-ink-500 w-5 text-center">{bExp ? "▾" : "▸"}</button>
                <div className="flex-1">
                  <div className="font-display font-semibold text-ink-900 tracking-editorial">{b.name} <span className="text-[10px] font-mono text-amber-700 ml-1">{b.code}</span></div>
                  <div className="text-[11px] text-ink-500">{(floors[b.id] || []).length} floors · {(progress.blocks as Record<string, number>)[b.id] || 0}% complete</div>
                </div>
                {can(user, "createProject") && <>
                  <button onClick={() => addFloor(b.id)} className="text-[11px] font-bold text-amber-700 hover:text-amber-900">+ Floor</button>
                  <button onClick={() => del("block", b.id)} className="text-ink-400 hover:text-red-500"><Icon name="trash" size={14} /></button>
                </>}
              </div>
              {bExp && <div className="px-3 pb-3 space-y-1">{(b.floors || []).map((f: any) => {
                const fExp = expanded[f.id] !== false;
                return (<div key={f.id} className="ml-6 rounded-lg" style={{ border: "1px solid var(--st-line)" }}>
                  <div className="flex items-center gap-3 p-2 bg-white">
                    <button onClick={() => toggleNode(f.id)} className="text-ink-500 w-5 text-center">{fExp ? "▾" : "▸"}</button>
                    <div className="flex-1"><div className="text-sm font-semibold text-ink-800">Floor {f.number}</div><div className="text-[10px] text-ink-500">{(units[f.id] || []).length} units · {(progress.floors as Record<string, number>)[f.id] || 0}% complete</div></div>
                    {can(user, "createProject") && <>
                      <button onClick={() => addUnit(f.id, b.id)} className="text-[10px] font-bold text-amber-700 hover:text-amber-900">+ Unit</button>
                      <button onClick={() => del("floor", f.id)} className="text-ink-400 hover:text-red-500"><Icon name="trash" size={12} /></button>
                    </>}
                  </div>
                  {fExp && (f.units || []).length > 0 && <div className="px-2 pb-2"><div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-1">{(f.units || []).map((u: any) => (<div key={u.id} className="rounded-md px-2 py-1.5 bg-cream-200/40 flex items-center justify-between" style={{ border: "1px solid var(--st-line)" }}>
                    <div className="min-w-0"><div className="text-[11px] font-bold text-ink-800 truncate">{unitCode(u, f, b)}</div><div className="text-[9px] text-ink-500 truncate">{u.type}</div></div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${u.progress >= 100 ? "bg-emerald-50 text-emerald-700" : u.progress >= 50 ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-ink-600"}`}>{u.progress}%</span>
                      {can(user, "createProject") && <button onClick={() => del("unit", u.id)} className="text-ink-300 hover:text-red-500"><Icon name="x" size={11} /></button>}
                    </div>
                  </div>))}</div></div>}
                </div>);
              })}</div>}
            </div>);
          })}
        </div>
      </div>
    </div>
  );
}
