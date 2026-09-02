// SiteTrack Pro — C4: partner coordination card (cross-org agent surface).
// Shows deterministic desync signals for a project that has partner firms
// (via project_partner_orgs). Pure scorer in partnerCoordination.ts, data
// fetched here. Only renders when there is something to coordinate.

import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui/atoms";
import { getClient } from "@/lib/supabase/supabase";
import { listApprovalDrawings } from "@/app/queries/approvalQueries";
import { listTasks } from "@/app/queries/taskQueries";
import { listIssues } from "@/app/queries/issueQueries";
import { listFfeEntries } from "@/app/queries/ffeQueries";
import { listUpdates } from "@/app/queries/updateQueries";
import { computePartnerCoordination, coordinationLevel, type CoordinationSignal, type CoordinationInput } from "@/app/engines/partnerCoordination";
import { usePartnerScope } from "@/features/project/PartnerScopeContext";
import { useT } from "@/i18n/I18nProvider";

const TONE: Record<CoordinationSignal["severity"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const LEVEL_KEYS: Record<"low" | "medium" | "high" | "critical", string> = {
  low: "partner.levelLow",
  medium: "partner.levelMedium",
  high: "partner.levelHigh",
  critical: "partner.levelCritical",
};

export function partnerLevelKey(level: string): string {
  return LEVEL_KEYS[level as keyof typeof LEVEL_KEYS] ?? level;
}

export interface SignalParts {
  titleKey: string;
  detailKey: string;
  args: Record<string, number>;
}

export function sigParts(s: CoordinationSignal, input: CoordinationInput): SignalParts {
  switch (s.code) {
    case "design-blocking":
      return {
        titleKey: "partner.sigDesignBlockingTitle",
        detailKey: "partner.sigDesignBlockingDetail",
        args: { drawings: input.pendingDrawings, tasks: input.openTasks, issues: input.openIssues },
      };
    case "site-pileup":
      return {
        titleKey: "partner.sigSitePileupTitle",
        detailKey: "partner.sigSitePileupDetail",
        args: { tasks: input.openTasks, issues: input.openIssues },
      };
    case "idle-partner":
      return {
        titleKey: "partner.sigIdleTitle",
        detailKey: "partner.sigIdleDetail",
        args: {
          days: input.daysSinceLastUpdate ?? 0,
          items: input.pendingDrawings + input.openTasks + input.openIssues,
        },
      };
    case "review-lag":
      return s.variant === "ffe"
        ? { titleKey: "partner.sigFfeTitle", detailKey: "partner.sigFfeDetail", args: { ffe: input.pendingFfe ?? 0 } }
        : { titleKey: "partner.sigReviewLagTitle", detailKey: "partner.sigReviewLagDetail", args: { drawings: input.pendingDrawings } };
  }
}

export function PartnerRiskCard({ projectId }: { projectId: string }): JSX.Element | null {
  const partnerScope = usePartnerScope();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<CoordinationSignal[]>([]);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState<CoordinationInput>({ pendingDrawings: 0, openTasks: 0, openIssues: 0, pendingFfe: 0, daysSinceLastUpdate: null });

  useEffect(() => {
    if (!partnerScope) { setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const client = await getClient();
      if (!client || cancelled) { setLoading(false); return; }
      const [draw, tasks, issues, ffe, updates] = await Promise.all([
        listApprovalDrawings(client, projectId),
        listTasks(client, projectId),
        listIssues(client, projectId),
        listFfeEntries(client, projectId).catch(() => ({ ok: false } as const)),
        listUpdates(client, projectId).catch(() => ({ ok: false } as const)),
      ]);
      if (cancelled) return;
      const pendingDrawings = draw.ok ? draw.data.filter(d => d.approvalStatus === "pending").length : 0;
      const openTasks = tasks.ok ? tasks.data.filter(t => t.status !== "completed").length : 0;
      const openIssues = issues.ok ? issues.data.filter(i => i.status === "open").length : 0;
      const pendingFfe = ffe && (ffe as { ok: boolean; data?: unknown[] }).ok ? ((ffe as { data: Array<{ status: string }> }).data.filter(f => f.status !== "installed" && f.status !== "cancelled").length) : 0;
      let daysSinceLastUpdate: number | null = null;
      if (updates && (updates as { ok: boolean; data?: Array<{ updateDate: string | null }> }).ok) {
        const ups = (updates as { data: Array<{ updateDate: string | null }> }).data;
        if (ups.length > 0) {
          const last = ups.reduce((a, b) => {
            const da = a.updateDate ? new Date(a.updateDate).getTime() : 0;
            const db = b.updateDate ? new Date(b.updateDate).getTime() : 0;
            return db > da ? b : a;
          });
          if (last.updateDate) {
            const diff = Date.now() - new Date(last.updateDate).getTime();
            daysSinceLastUpdate = Math.floor(diff / 86_400_000);
          }
        } else {
          daysSinceLastUpdate = 999;
        }
      }
      const next: CoordinationInput = { pendingDrawings, openTasks, openIssues, pendingFfe, daysSinceLastUpdate };
      const res = computePartnerCoordination(next);
      setScore(res.score);
      setSignals(res.signals);
      setInput(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, partnerScope]);

  if (!partnerScope) return null;
  if (loading) return <Card padding="md"><div className="text-xs text-fg-tertiary">{t("partner.coordinationLoading")}</div></Card>;
  if (signals.length === 0) return <></>;

  const level = coordinationLevel(score);
  const levelTone: Record<string, "success" | "warning" | "danger" | "neutral"> = { low: "neutral", medium: "warning", high: "danger", critical: "danger" };

  return (
    <Card padding="md" className="border-l-4 border-l-warning">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("partner.coordinationTitle")}</h3>
        <Badge tone={levelTone[level]}>{t(partnerLevelKey(level))} · {score}</Badge>
      </div>
      <div className="mt-2 space-y-2">
        {signals.map(s => {
          const parts = sigParts(s, input);
          return (
            <div key={s.code} className="flex items-start gap-2 rounded-lg bg-bg-secondary border border-border p-2.5">
              <Badge tone={TONE[s.severity]} className="mt-0.5">{t(partnerLevelKey(s.severity))}</Badge>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg-primary">{t(parts.titleKey, parts.args)}</p>
                <p className="text-[11px] text-fg-secondary mt-0.5">{t(parts.detailKey, parts.args)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-fg-tertiary mt-2">{t("partner.lanePrivacy")}</p>
    </Card>
  );
}
