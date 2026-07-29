// SiteTrack Pro — Org Templates (/org/templates). Org-shared project / BOQ /
// checklist templates. DB-wired (templates table, migration 78 bridge).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listTemplates, createTemplate, deleteTemplate, TEMPLATE_KINDS, type Template, type TemplateKind } from "@/app/orgConfigQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const KIND_OPTS = TEMPLATE_KINDS.map(k => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }));
const kindTone = (k: TemplateKind): "info" | "success" | "warning" => (k === "project" ? "info" : k === "boq" ? "success" : "warning");

export function OrgTemplatesView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("org:templates:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Template management requires org admin." />;
  return <Inner orgId={activeOrg.orgId} createdBy={session.user.id} />;
}

function Inner({ orgId, createdBy }: { orgId: string; createdBy: string }): JSX.Element {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<TemplateKind>("project"); const [name, setName] = useState(""); const [desc, setDesc] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listTemplates(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!name.trim()) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createTemplate(c, { orgId, kind, name: name.trim(), description: desc.trim() || undefined, createdBy }), {
      apply: () => setRows(prev => [{ id: tmpId, kind, name: name.trim(), description: desc.trim() || null, createdBy }, ...prev] as Template[]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setName(""); setDesc("");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Templates</h1>
      <p className="text-sm text-fg-secondary -mt-2">Reusable project, BOQ &amp; checklist starting points shared across your org.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Card className="p-3 flex gap-2 flex-wrap items-end">
        <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Kind</span><Select className="mt-1 w-32" value={kind} onChange={e => setKind(e.target.value as TemplateKind)} options={KIND_OPTS} /></div>
        <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Name</span><Input className="mt-1" placeholder="e.g. G+3 residential" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Description</span><Input className="mt-1" placeholder="optional" value={desc} onChange={e => setDesc(e.target.value)} /></div>
        <Button onClick={() => void add()} disabled={busy === "add" || !name.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
      </Card>
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No templates yet.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2"><Badge tone={kindTone(r.kind)}>{r.kind}</Badge>
                <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.name}</div>{r.description && <div className="text-[11px] text-fg-tertiary truncate">{r.description}</div>}</div></div>
              <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteTemplate(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-error" /></Button>
            </Card>))}</div>}
    </div>
  );
}
