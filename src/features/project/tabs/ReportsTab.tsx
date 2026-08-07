// SiteTrack Pro — Consultancy reports tab (v4 Phase C).
// Site visit / recommendation / milestone-review audit reports for
// consultant/design projects (migration 163). create/edit/publish/delete →
// audit:manage (plan gated by PlanFeature "audit_reports" at the tab level).

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select, Textarea } from "@/components/ui/forms";
import {
  listReports, upsertReport, setReportStatus, deleteReport,
  REP_KIND_LABEL, REP_STATUS_LABEL,
  type ConsultancyReport, type ReportKind, type ReportStatus,
} from "@/app/consultancyAuditQueries";

const KIND_OPTS = [
  { value: "site_visit", label: "Site visit" },
  { value: "recommendation", label: "Recommendation" },
  { value: "milestone_review", label: "Milestone review" },
] as const;

const statusTone = (s: ReportStatus): "neutral" | "success" | "warning" =>
  s === "published" ? "success" : s === "archived" ? "warning" : "neutral";

export function ReportsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const can = useCan("audit:manage", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<ConsultancyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listReports(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Consultancy reports</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {can && <NewReportCard projectId={projectId} busy={busy} run={run} onDone={() => setOpenId(null)} />}

      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No reports yet.</div>
        : <div className="space-y-2">{rows.map(r => (
            <ReportCard key={r.id} r={r} can={can} busy={busy} run={run} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
          ))}</div>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NewReportCard({ projectId, busy, run, onDone }: { projectId: string; busy: string | null; run: (k: string, fn: (c: any) => Promise<any>, opts: { apply: () => void; rollback: () => void }) => Promise<void>; onDone: () => void }): JSX.Element {
  const [kind, setKind] = useState<ReportKind>("site_visit");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");

  const add = () => {
    if (!title.trim()) return;
    void run("add", c => upsertReport(c, { projectId, kind, title: title.trim(), summary: summary.trim() || null, content: content.trim() || null }), {
      apply: () => { setTitle(""); setSummary(""); setContent(""); onDone(); },
      rollback: () => { setTitle(title); },
    });
  };

  return (
    <Card className="p-3 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">New report</div>
      <div className="flex gap-2 flex-wrap">
        <Select className="w-auto" value={kind} onChange={e => setKind(e.target.value as ReportKind)} options={KIND_OPTS as unknown as { value: string; label: string }[]} />
        <Input className="flex-1 min-w-[200px]" placeholder="Report title" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <Textarea className="w-full" rows={2} placeholder="Summary (one-liner)" value={summary} onChange={e => setSummary(e.target.value)} />
      <Textarea className="w-full" rows={3} placeholder="Findings / recommendations" value={content} onChange={e => setContent(e.target.value)} />
      <div className="flex justify-end">
        <Button onClick={add} disabled={busy === "add"}>{busy === "add" ? <Spinner size={14} /> : "Save draft"}</Button>
      </div>
    </Card>
  );
}

interface Props {
  r: ConsultancyReport;
  can: boolean;
  busy: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (k: string, fn: (c: any) => Promise<any>, opts: { apply: () => void; rollback: () => void }) => Promise<void>;
  open: boolean;
  onToggle: () => void;
}

function ReportCard({ r, can, busy, run, open, onToggle }: Props): JSX.Element {
  const [summary, setSummary] = useState(r.summary ?? "");
  const [content, setContent] = useState(r.content ?? "");

  const save = () => {
    void run(`save-${r.id}`, c => upsertReport(c, { id: r.id, projectId: r.projectId, kind: r.kind, title: r.title, summary: summary.trim() || null, content: content.trim() || null, status: r.status }), {
      apply: () => undefined,
      rollback: () => { setSummary(r.summary ?? ""); setContent(r.content ?? ""); },
    });
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onToggle} className="text-left min-w-0">
          <div className="text-sm font-semibold text-fg-primary truncate">{r.title}</div>
          <div className="text-[11px] text-fg-tertiary">{REP_KIND_LABEL[r.kind]}{r.createdAt ? ` · ${r.createdAt.slice(0, 10)}` : ""}</div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge tone={statusTone(r.status)}>{REP_STATUS_LABEL[r.status]}</Badge>
          {can && r.status === "draft" && (
            <Button size="sm" onClick={() => void run(`pub-${r.id}`, c => setReportStatus(c, r.id, "published"), { apply: () => undefined, rollback: () => undefined })} disabled={busy === `pub-${r.id}`}>Publish</Button>
          )}
          {can && r.status === "published" && (
            <Button size="sm" variant="ghost" onClick={() => void run(`arc-${r.id}`, c => setReportStatus(c, r.id, "archived"), { apply: () => undefined, rollback: () => undefined })} disabled={busy === `arc-${r.id}`}>Archive</Button>
          )}
          {can && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteReport(c, r.id), { apply: () => undefined, rollback: () => undefined })}><Icon name="trash" size={14} className="text-error" /></Button>}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 border-t border-border pt-3">
          {r.summary && <div className="text-sm text-fg-secondary">{r.summary}</div>}
          {r.content && <div className="text-sm whitespace-pre-wrap text-fg-primary">{r.content}</div>}
          {can && (
            <>
              <Textarea className="w-full" rows={2} placeholder="Summary" value={summary} onChange={e => setSummary(e.target.value)} />
              <Textarea className="w-full" rows={4} placeholder="Findings / recommendations" value={content} onChange={e => setContent(e.target.value)} />
              <div className="flex justify-end">
                <Button size="sm" onClick={save} disabled={busy === `save-${r.id}`}>{busy === `save-${r.id}` ? <Spinner size={14} /> : "Save"}</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}