// SiteTrack Pro — v4 Phase C: consultancy audit/inspection tab.
// Checklists → per-item results (pass/fail/na) → auto progress rollup.

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Button, Input, FormField, Badge, Alert, Spinner, AccessDenied, SchemaForm,
} from "@/components/ui";
import { useT } from "@/i18n/I18nProvider";
import { useCan } from "@/auth";
import { useAction } from "@/hooks/useAction";
import {
  listChecklists, upsertChecklist, setChecklistStatus, deleteChecklist,
  listResults, upsertResult, setResultVerdict, deleteResult,
  checklistProgress, CHECKLIST_STATUS_NEXT,
  checklistFormSchema,
  type InspectionChecklist, type ChecklistStatus, type ResultVerdict,
  type InspectionResult, type ChecklistKind,
  type ChecklistFormLabels, type ChecklistFormValues,
} from "@/app/consultancyAuditQueries";
import { getClient } from "@/lib/supabase";

const STATUS_TONE: Record<ChecklistStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral", in_progress: "info", passed: "success", failed: "danger", cancelled: "neutral",
};
const VERDICT_TONE: Record<ResultVerdict, "neutral" | "success" | "warning" | "danger"> = {
  pass: "success", fail: "danger", na: "neutral",
};
const KIND_LABEL: Record<string, string> = {
  site_visit: "Site Visit", design_review: "Design Review", quality_audit: "Quality Audit", other: "Other",
};

function ResultsPanel({ checklistId, canManage }: { checklistId: string; canManage: boolean }) {
  const t = useT();
  const [rows, setRows] = useState<InspectionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState("");
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("audit.backendError")); setLoading(false); return; }
    const res = await listResults(client, checklistId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [checklistId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const { run } = useAction(reload, setError);

  const add = async () => {
    if (!item.trim()) return;
    await run("add", c => upsertResult(c, { checklistId, item: item.trim(), note: note.trim() || null }));
    setItem(""); setNote("");
  };

  const toggle = async (r: InspectionResult) => {
    // Cycle: pass → fail → na → pass (only when managing)
    const order: ResultVerdict[] = ["pass", "fail", "na"];
    const currentIndex = order.indexOf(r.result as ResultVerdict);
    const nextIndex = (currentIndex + 1) % order.length;
    const next = order[nextIndex];
    await run(`v-${r.id}`, c => setResultVerdict(c, r.id, next));
  };

  const remove = async (id: string) => {
    if (!confirm(t("audit.deleteResult"))) return;
    await run(`d-${id}`, c => deleteResult(c, id));
  };

  const progress = useMemo(() => checklistProgress(rows), [rows]);

  if (loading) return <Spinner size={18} />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-fg-secondary">
        <span>Pass {progress.passed} · Fail {progress.failed} · N/A {progress.na} · {progress.pct}%</span>
        <Badge tone={STATUS_TONE[progress.overallStatus]} className="ml-2">{t(`audit.checklistStatus.${progress.overallStatus}`)}</Badge>
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <FormField label={t("audit.fieldItem")} htmlFor="res-item">
            <Input fit value={item} onChange={e => setItem(e.target.value)} placeholder={t("audit.itemPlaceholder")} className="w-48" />
          </FormField>
          <FormField label={t("audit.fieldNote")} htmlFor="res-note">
            <Input fit value={note} onChange={e => setNote(e.target.value)} placeholder={t("audit.notePlaceholder")} className="w-48" />
          </FormField>
          <Button size="sm" onClick={add}>{t("audit.addItem")}</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-xs text-fg-tertiary py-4">{t("audit.noResults")}</div>
      ) : (
        rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-fg-primary truncate">{r.item}</div>
              {r.note && <div className="text-[11px] text-fg-tertiary truncate">{r.note}</div>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="cursor-pointer" onClick={() => canManage && void toggle(r)}>
                <Badge tone={VERDICT_TONE[r.result as ResultVerdict]}>{t(`audit.verdict.${r.result}`)}</Badge>
              </span>
              {canManage && (
                <Button size="sm" variant="ghost" onClick={() => void remove(r.id)}>{t("audit.delete")}</Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function AuditTab({ projectId }: { projectId: string }) {
  const t = useT();
  const canManage = useCan("audit:manage", { projectId });

  if (!canManage) return <AccessDenied />;

  const [rows, setRows] = useState<InspectionChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InspectionChecklist | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("audit.backendError")); setLoading(false); return; }
    const res = await listChecklists(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const { run, busy } = useAction(reload, setError);

  const formLabels = useMemo<ChecklistFormLabels>(() => ({
    fieldKind: t("audit.fieldKind"),
    fieldTitle: t("audit.fieldTitle"),
    fieldStatus: t("audit.fieldStatus"),
    titlePlaceholder: t("audit.titlePlaceholder"),
    titleRequired: t("audit.titleRequired"),
    kindLabel: k => KIND_LABEL[k] ?? k,
    statusLabel: s => t(`audit.checklistStatus.${s}`),
  }), [t]);

  const schema = useMemo(
    () => checklistFormSchema(formLabels, editing !== null),
    [formLabels, editing],
  );

  const submit = async (values: ChecklistFormValues) => {
    await run(editing ? "edit" : "add", (c: any) => upsertChecklist(c, {
      id: editing?.id ?? null, projectId,
      kind: (values.kind as ChecklistKind) ?? "site_visit",
      title: String(values.title ?? "").trim(),
      status: (values.status as ChecklistStatus) ?? "draft",
    }));
    setCreating(false); setEditing(null);
  };

  const toggle = async (c: InspectionChecklist) => {
    const next = CHECKLIST_STATUS_NEXT[c.status]; if (!next) return;
    await run(`s-${c.id}`, (c2: any) => setChecklistStatus(c2, c.id, next));
  };

  const remove = async (id: string) => {
    if (!confirm(t("audit.deleteChecklist"))) return;
    await run(`d-${id}`, (c: any) => deleteChecklist(c, id));
  };

  if (loading) return <Spinner size={22} />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  const checklistTitle = editing ? t("audit.editChecklist") : t("audit.newChecklist");

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(null); setCreating(true); }}>
            {checklistTitle}
          </Button>
        </div>
      )}

      {rows.length === 0 && !creating ? (
        <Card className="p-8 text-center">
          <div className="text-4xl mb-2">📋</div>
          <h3 className="font-display text-lg font-bold text-fg-primary">{t("audit.emptyTitle")}</h3>
          <p className="text-fg-secondary text-sm mt-1">{t("audit.emptyDesc")}</p>
        </Card>
      ) : (
        rows.map(c => (
          <Card key={c.id} className="overflow-hidden">
            <div className="p-4 border-b border-default flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-fg-primary truncate">{c.title}</span>
                  <Badge tone="neutral">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                  <Badge tone={STATUS_TONE[c.status]}>{t(`audit.checklistStatus.${c.status}`)}</Badge>
                </div>
                <div className="text-[11px] text-fg-tertiary mt-1">{t("audit.createdBy", { name: c.createdBy ?? "—" })}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canManage && c.status !== "passed" && c.status !== "failed" && c.status !== "cancelled" && (
                  <Button size="sm" onClick={() => void toggle(c)}>
                    {t("audit.advance", { next: t(`audit.checklistStatus.${CHECKLIST_STATUS_NEXT[c.status]}`) })}
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setCreating(true); }}>
                    {t("audit.edit")}
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="danger" onClick={() => void remove(c.id)}>{t("audit.delete")}</Button>
                )}
              </div>
            </div>
            <ResultsPanel checklistId={c.id} canManage={canManage} />
          </Card>
        ))
      )}

      {creating && (
        <Card padding="md" className="border-accent" title={checklistTitle}>
          <SchemaForm
            key={editing?.id ?? "new"}
            schema={schema}
            initialValues={editing ? { kind: editing.kind, title: editing.title, status: editing.status } : undefined}
            submitLabel={t("audit.save")}
            cancelLabel={t("audit.cancel")}
            busy={busy !== null}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSubmit={submit}
          />
        </Card>
      )}
    </div>
  );
}