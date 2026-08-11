// SiteTrack Pro — v4 Phase C: consultancy reports tab.
// Draft → published → archived lifecycle with period + content.

import { useState, useEffect, useCallback } from "react";
import {
  Card, Button, Input, Textarea, Select, FormField, Badge, Alert, Spinner, AccessDenied,
} from "@/components/ui";
import { useT } from "@/i18n/I18nProvider";
import { useCan } from "@/auth";
import { useAction } from "@/hooks/useAction";
import {
  listReports, upsertReport, setReportStatus, deleteReport,
  type ConsultancyReport, type ReportKind, type ReportStatus,
} from "@/app/consultancyAuditQueries";
import { getClient } from "@/lib/supabase";

const STATUS_TONE: Record<ReportStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral", published: "success", archived: "neutral",
};
const KIND_LABEL: Record<ReportKind, string> = {
  site_visit: "Site Visit", recommendation: "Recommendation", milestone_review: "Milestone Review",
};

export function ReportsTab({ projectId }: { projectId: string }) {
  const t = useT();
  const canManage = useCan("audit:manage", { projectId });

  if (!canManage) return <AccessDenied />;

  const [rows, setRows] = useState<ConsultancyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ConsultancyReport | null>(null);
  const [form, setForm] = useState({
    kind: "site_visit" as ReportKind, title: "", summary: "", content: "", status: "draft" as ReportStatus,
    periodFrom: "", periodTo: "",
  });

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("audit.backendError")); setLoading(false); return; }
    const res = await listReports(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const { run } = useAction(reload, setError);

  const submit = async () => {
    if (!form.title.trim()) return;
    await run(editing ? "edit" : "add", (c: any) => upsertReport(c, {
      id: editing?.id ?? null, projectId, kind: form.kind, title: form.title.trim(),
      summary: form.summary.trim() || null, content: form.content.trim() || null,
      status: form.status, periodFrom: form.periodFrom || null, periodTo: form.periodTo || null,
    }));
    setCreating(false); setEditing(null); setForm({ kind: "site_visit", title: "", summary: "", content: "", status: "draft", periodFrom: "", periodTo: "" });
  };

  const toggle = async (r: ConsultancyReport) => {
    const next: ReportStatus | null = r.status === "draft" ? "published" : r.status === "published" ? "archived" : null;
    if (!next) return;
    await run(`s-${r.id}`, (c: any) => setReportStatus(c, r.id, next));
  };

  const remove = async (id: string) => {
    if (!confirm(t("audit.deleteReport"))) return;
    await run(`d-${id}`, (c: any) => deleteReport(c, id));
  };

  if (loading) return <Spinner size={22} />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(null); setForm({ kind: "site_visit", title: "", summary: "", content: "", status: "draft", periodFrom: "", periodTo: "" }); setCreating(true); }}>
            {t("audit.newReport")}
          </Button>
        </div>
      )}

      {rows.length === 0 && !creating ? (
        <Card className="p-8 text-center">
          <div className="text-4xl mb-2">📄</div>
          <h3 className="font-display text-lg font-bold text-fg-primary">{t("audit.emptyReportTitle")}</h3>
          <p className="text-fg-secondary text-sm mt-1">{t("audit.emptyReportDesc")}</p>
        </Card>
      ) : (
        rows.map(r => (
          <Card key={r.id} className="overflow-hidden">
            <div className="p-4 border-b border-default flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-fg-primary truncate">{r.title}</span>
                  <Badge tone="neutral">{KIND_LABEL[r.kind]}</Badge>
                  <Badge tone={STATUS_TONE[r.status]}>{t(`audit.reportStatus.${r.status}`)}</Badge>
                </div>
                <div className="text-[11px] text-fg-tertiary mt-1 flex flex-wrap gap-4">
                  {r.periodFrom && <span>{t("audit.periodFrom", { date: r.periodFrom })}</span>}
                  {r.periodTo && <span>{t("audit.periodTo", { date: r.periodTo })}</span>}
                  <span>{t("audit.createdBy", { name: r.createdBy ?? "—" })}</span>
                </div>
                {r.summary && <div className="text-sm text-fg-secondary mt-2 line-clamp-2">{r.summary}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canManage && r.status !== "archived" && (
                  <Button size="sm" onClick={() => void toggle(r)}>
                    {t("audit.advance", { next: t(`audit.reportStatus.${r.status === "draft" ? "published" : "archived"}`) })}
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setForm({ kind: r.kind, title: r.title, summary: r.summary ?? "", content: r.content ?? "", status: r.status, periodFrom: r.periodFrom ?? "", periodTo: r.periodTo ?? "" }); setCreating(true); }}>
                    {t("audit.edit")}
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="danger" onClick={() => void remove(r.id)}>{t("audit.delete")}</Button>
                )}
              </div>
            </div>
            {r.content && (
              <div className="p-4 bg-elevated border-t border-default text-sm text-fg-primary whitespace-pre-wrap">
                {r.content}
              </div>
            )}
          </Card>
        ))
      )}

      {creating && (
        <Card padding="md" className="border-accent" title={<h4 className="font-display text-base font-bold text-fg-primary">{editing ? t("audit.editReport") : t("audit.newReport")}</h4>}>
          <div className="space-y-3">
            <FormField label={t("audit.fieldKind")} htmlFor="rp-kind">
              <Select value={form.kind} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm(f => ({ ...f, kind: e.target.value as ReportKind }))}
                options={["site_visit", "recommendation", "milestone_review"].map(k => ({ value: k, label: KIND_LABEL[k as ReportKind] }))} />
            </FormField>
            <FormField label={t("audit.fieldTitle")} htmlFor="rp-title">
              <Input value={form.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("audit.titlePlaceholder")} />
            </FormField>
            <FormField label={t("audit.fieldSummary")} htmlFor="rp-summary">
              <Textarea rows={2} value={form.summary} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, summary: e.target.value }))} placeholder={t("audit.summaryPlaceholder")} />
            </FormField>
            <FormField label={t("audit.fieldContent")} htmlFor="rp-content">
              <Textarea rows={6} value={form.content} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, content: e.target.value }))} placeholder={t("audit.contentPlaceholder")} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("audit.fieldPeriodFrom")} htmlFor="rp-from">
                <Input type="date" value={form.periodFrom} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, periodFrom: e.target.value }))} />
              </FormField>
              <FormField label={t("audit.fieldPeriodTo")} htmlFor="rp-to">
                <Input type="date" value={form.periodTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, periodTo: e.target.value }))} />
              </FormField>
            </div>
            <FormField label={t("audit.fieldStatus")} htmlFor="rp-status">
              <Select value={form.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm(f => ({ ...f, status: e.target.value as ReportStatus }))}
                options={["draft", "published", "archived"].map(s => ({ value: s, label: t(`audit.reportStatus.${s}`) }))} />
            </FormField>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>{t("audit.cancel")}</Button>
            <Button onClick={submit} disabled={!form.title.trim()}>{t("audit.save")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}