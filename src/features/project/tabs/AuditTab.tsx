// SiteTrack Pro — Consultancy inspection/audit tab (v4 Phase C).
// Checklist-driven site visits / design reviews / quality audits for
// consultant/design projects (migration 163). Each checklist carries result
// line items (pass/fail/na); a verdict rolls them up. create/edit/delete →
// audit:manage (plan gated by PlanFeature "audit_reports" at the tab level).

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, Icon, ProgressBar } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import {
  listChecklists, upsertChecklist, setChecklistStatus, deleteChecklist,
  listResults, upsertResult, deleteResult,
  checklistVerdict, CL_STATUS_NEXT, CL_KIND_LABEL, CL_STATUS_LABEL,
  type InspectionChecklist, type ChecklistKind, type ChecklistStatus,
  type InspectionResult, type ResultMark,
} from "@/app/consultancyAuditQueries";

const KIND_OPTS = [
  { value: "site_visit", label: "Site visit" },
  { value: "design_review", label: "Design review" },
  { value: "quality_audit", label: "Quality audit" },
  { value: "other", label: "Other" },
] as const;

const MARK_OPTS = [
  { value: "na", label: "N/A" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
] as const;

const markTone = (m: ResultMark): "neutral" | "success" | "danger" =>
  m === "pass" ? "success" : m === "fail" ? "danger" : "neutral";

const statusTone = (s: ChecklistStatus): "neutral" | "info" | "success" | "danger" =>
  s === "passed" ? "success" : s === "failed" ? "danger" : s === "in_progress" ? "info" : "neutral";

export function AuditTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const can = useCan("audit:manage", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<InspectionChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ChecklistKind>("site_visit");
  const [title, setTitle] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listChecklists(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  const add = () => {
    if (!title.trim()) return;
    void run("add", c => upsertChecklist(c, { projectId, kind, title: title.trim() }), {
      apply: () => setRows(prev => [{ id: "tmp", projectId, kind, title: title.trim(), status: "draft", createdByName: null, createdAt: "" }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== "tmp" || x.title !== title.trim())),
    });
    setTitle("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Inspections & audits</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      {can && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Kind</span>
            <Select className="mt-1 w-auto" value={kind} onChange={e => setKind(e.target.value as ChecklistKind)} options={KIND_OPTS as unknown as { value: string; label: string }[]} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Title</span>
            <Input className="mt-1" placeholder="e.g. Interior fit-out site visit · Floor 2" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <Button onClick={add} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Add checklist"}</Button>
        </Card>
      )}

      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No checklists yet.</div>
        : <div className="space-y-2">{rows.map(cl => (
            <ChecklistCard key={cl.id} cl={cl} can={can} busy={busy} run={run} open={openId === cl.id} onToggle={() => setOpenId(openId === cl.id ? null : cl.id)} />
          ))}</div>}
    </div>
  );
}

interface Props {
  cl: InspectionChecklist;
  can: boolean;
  busy: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (k: string, fn: (c: any) => Promise<any>, opts: { apply: () => void; rollback: () => void }) => Promise<void>;
  open: boolean;
  onToggle: () => void;
}

function ChecklistCard({ cl, can, busy, run, open, onToggle }: Props): JSX.Element {
  const [rows, setRows] = useState<InspectionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const client = await getClient(); if (!client) { setLoading(false); return; }
    const res = await listResults(client, cl.id); if (res.ok) setRows(res.data); setLoading(false);
  }, [cl.id]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const verdict = useMemo(() => checklistVerdict(rows), [rows]);

  const add = () => {
    if (!item.trim()) return;
    void run(`res-${cl.id}`, c => upsertResult(c, { checklistId: cl.id, item: item.trim() }), {
      apply: () => { setRows(prev => [...prev, { id: "tmp", checklistId: cl.id, item: item.trim(), result: "na", note: null, sortOrder: prev.length }]); setItem(""); },
      rollback: () => setRows(prev => prev.filter(x => x.id !== "tmp")),
    });
  };

  const mark = (r: InspectionResult, m: ResultMark) => {
    void run(`m-${r.id}`, c => upsertResult(c, { id: r.id, checklistId: cl.id, item: r.item, result: m, note: r.note, sortOrder: r.sortOrder }), {
      apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, result: m } : x)),
      rollback: () => setRows(prev => prev.map(x => x.id === r.id ? r : x)),
    });
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onToggle} className="text-left">
            <div className="text-sm font-semibold text-fg-primary">{cl.title}</div>
            <div className="text-[11px] text-fg-tertiary">{CL_KIND_LABEL[cl.kind]}{cl.createdAt ? ` · ${cl.createdAt.slice(0, 10)}` : ""}</div>
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge tone={statusTone(cl.status)}>{CL_STATUS_LABEL[cl.status]}</Badge>
          {can && cl.status !== "passed" && cl.status !== "failed" && (
            <Button size="sm" variant="ghost" onClick={() => void run(`adv-${cl.id}`, c => setChecklistStatus(c, cl.id, CL_STATUS_NEXT[cl.status]), {
              apply: () => undefined, rollback: () => undefined,
            })} disabled={busy === `adv-${cl.id}`}>Next</Button>
          )}
          {can && <Button size="sm" variant="ghost" onClick={() => void run(`d-${cl.id}`, c => deleteChecklist(c, cl.id), { apply: () => undefined, rollback: () => undefined })}><Icon name="trash" size={14} className="text-error" /></Button>}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-fg-tertiary">Results{loading ? "…" : ""}</div>
            {rows.length > 0 && (
              <div className="flex items-center gap-2">
                <ProgressBar value={verdict.passPct} className="w-24" />
                <span className="text-xs font-semibold text-fg-secondary">{verdict.passPct}% · {verdict.failed} fail</span>
              </div>
            )}
          </div>

          {rows.length === 0 && !loading && <div className="text-xs text-fg-tertiary">No results recorded.</div>}
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-fg-primary">{r.item}</span>
              {can ? (
                <Select className="w-auto text-xs" value={r.result} onChange={e => mark(r, e.target.value as ResultMark)} options={MARK_OPTS as unknown as { value: string; label: string }[]} />
              ) : (
                <Badge tone={markTone(r.result)}>{r.result.toUpperCase()}</Badge>
              )}
              {can && <Button size="sm" variant="ghost" onClick={() => void run(`dr-${r.id}`, c => deleteResult(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={13} className="text-error" /></Button>}
            </div>
          ))}

          {can && (
            <div className="flex gap-2">
              <Input className="flex-1" placeholder="Add check item…" value={item} onChange={e => setItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
              <Button size="sm" onClick={add}>{busy === `res-${cl.id}` ? <Spinner size={14} /> : "Add"}</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}