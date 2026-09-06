// SiteTrack Pro — deterministic "Project health" card (R4 — response plan row 4).
// Prefers the nightly server snapshot (project_risk_signals — migrations
// 225/226) when fresh; otherwise feeds milestones, expenses-vs-budget, open
// issues and RFI lag into computeRiskSignals() on the fly. Presents the same
// signals through a health framing: a headline score (100 − risk), per-dimension
// sub-scores (schedule / cost / issues / documentation) and a deterministic
// "N things need attention" list. Pure math (no external AI); shown on Overview.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { Card, Badge, Spinner, Icon, ProgressBar } from "@/components/ui/atoms";
import {
  computeRiskSignals, getProjectRiskSnapshot, isSnapshotFresh,
  healthScore, healthSubscores, topActionableSignals,
  HEALTH_DIMENSIONS, HEALTH_DIMENSION_LABEL,
  type StoredRiskSnapshot, type RiskSignal, type RiskLevel,
} from "@/app/queries/riskQueries";
import { listMilestones } from "@/app/queries/milestoneQueries";
import { listIssues } from "@/app/queries/issueQueries";
import { listExpenses } from "@/app/queries/financeQueries";
import { listRfis } from "@/app/queries/designQueries";
import { localDateISO } from "@/lib/utils/dateLocal";
import type { ProjectDetail } from "@/app/queries/queries";

/** Risk level → health label + badge tone. */
const LEVEL_HEALTH: Record<RiskLevel, { label: string; tone: "success" | "warning" | "danger" }> = {
  low: { label: "Healthy", tone: "success" },
  medium: { label: "Watching", tone: "warning" },
  high: { label: "At risk", tone: "danger" },
  critical: { label: "Critical", tone: "danger" },
};

const HEADLINE_TONE = (value: number): "emerald" | "orange" | "red" =>
  value >= 80 ? "emerald" : value >= 50 ? "orange" : "red";

const SUBSCORE_TONE = (value: number): "emerald" | "orange" | "red" =>
  HEADLINE_TONE(value);

type CardResult = ReturnType<typeof computeRiskSignals>;

/** Adapt a persisted nightly row into the client-computed render shape.
 *  Cost forecast isn't persisted server-side → zeroed (line hides itself). */
function snapshotToResult(snap: StoredRiskSnapshot): CardResult {
  return {
    score: snap.score,
    level: snap.level,
    signals: snap.signals as RiskSignal[],
    delayProbability: snap.delayProbability,
    delayDays: snap.delayDays,
    costForecast: { projected: 0, variance: 0, confidence: 0 },
    burnAccelerating: snap.burnAccelerating,
    stockOutDays: 0,
    stockOutCritical: false,
  };
}

export function ProjectHealthCard({ project }: { project: ProjectDetail }): JSX.Element {
  const [loaded, setLoaded] = useState<{ res: CardResult; fromStore: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const client = await getClient();
    if (!client) { setLoading(false); return; }
    const snap = await getProjectRiskSnapshot(client, project.id);
    if (snap.ok && snap.data && isSnapshotFresh(snap.data)) {
      setLoaded({ res: snapshotToResult(snap.data), fromStore: true });
      setLoading(false);
      return;
    }
    const today = localDateISO();
    const [milestones, issues, expenses, rfis, budgetRow] = await Promise.all([
      listMilestones(client, project.id),
      listIssues(client, project.id),
      listExpenses(client, project.id),
      listRfis(client, project.id),
      client.from("projects").select("budget").eq("id", project.id).maybeSingle(),
    ]);
    const allocated = budgetRow?.data && typeof budgetRow.data.budget === "number"
      ? Number(budgetRow.data.budget)
      : 0;
    const spent = expenses.ok ? expenses.data.reduce((sum, e) => sum + e.amount, 0) : 0;
    setLoaded({
      res: computeRiskSignals({
        milestones: milestones.ok ? milestones.data : undefined,
        budget: allocated > 0 ? { allocated, spent } : undefined,
        openIssues: issues.ok ? issues.data : undefined,
        rfis: rfis.ok ? rfis.data : undefined,
      }, today),
      fromStore: false,
    });
    setLoading(false);
  }, [project.id]);
  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Card className="p-5">
        <div className="grid place-items-center py-2"><Spinner size={18} /></div>
      </Card>
    );
  }
  const result = loaded?.res ?? null;
  const fromStore = loaded?.fromStore ?? false;
  if (!result) return <></>;
  return <ProjectHealthBody result={result} fromStore={fromStore} />;
}

/** Pure card body (no hooks) — unit-testable without auth/org context. */
export function ProjectHealthBody({ result, fromStore }: { result: CardResult; fromStore: boolean }): JSX.Element {
  const score = healthScore(result.score);
  const subscores = healthSubscores(result.signals);
  const top = topActionableSignals(result.signals);
  const health = LEVEL_HEALTH[result.level];
  const attentionLabel = top.length === 0
    ? "Nothing needs attention"
    : top.length === 1
      ? "1 thing needs attention"
      : `${top.length} things need attention`;

  return (
    <div data-testid="project-health-card">
      <Card padding="lg" title={<div className="flex items-center gap-2">
      <Icon
        name={score >= 80 ? "check" : "alert"}
        size={15}
        className={score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-error"}
      />
      <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Project health</h3>
      <Badge tone={health.tone}>{health.label}</Badge>
    </div>}>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black leading-none tabular-nums text-fg-primary" data-testid="health-score">{score}</span>
        <span className="text-xs font-semibold text-fg-tertiary">/ 100 health</span>
      </div>
      <ProgressBar value={score} color={HEADLINE_TONE(score)} className="mt-2" ariaLabel="Project health score" />

      <div className="text-xs text-fg-secondary mt-2">
        {Math.round(result.delayProbability * 100)}% estimated delay probability
        {result.delayDays > 0 ? ` · ~${result.delayDays} day${result.delayDays === 1 ? "" : "s"} late` : ""}
        {fromStore ? " · nightly snapshot" : ""}
      </div>

      {result.costForecast.projected > 0 && (
        <div className="text-xs text-fg-secondary mt-1">
          ₹{result.costForecast.projected.toLocaleString("en-IN")} projected remaining cost ({Math.round(result.costForecast.confidence * 100)}% confidence)
          {result.burnAccelerating && " · burn accelerating"}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {HEALTH_DIMENSIONS.map(dim => {
          const value = subscores[dim];
          return (
            <div key={dim} className="rounded-lg bg-bg-secondary px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-fg-primary">{HEALTH_DIMENSION_LABEL[dim]}</span>
                <span className="text-xs font-bold text-fg-primary tabular-nums" data-testid={`subscore-${dim}`}>{value}/100</span>
              </div>
              <ProgressBar value={value} color={SUBSCORE_TONE(value)} className="mt-1.5" ariaLabel={`${HEALTH_DIMENSION_LABEL[dim]} health`} />
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary" data-testid="attention-label">
          {attentionLabel}
        </div>
        {top.length > 0 && (
          <ul className="mt-1.5 space-y-1.5">
            {top.map(s => <SignalRow key={s.code} s={s} />)}
          </ul>
        )}
      </div>
      </Card>
    </div>
  );
}

function SignalRow({ s }: { s: RiskSignal }): JSX.Element {
  const tone: "warning" | "danger" | "neutral" =
    s.severity === "high" ? "danger" : s.severity === "medium" ? "warning" : "neutral";
  return (
    <li className="flex items-start gap-2 text-sm">
      <Badge tone={tone} className="mt-0.5 flex-shrink-0 capitalize">{s.severity}</Badge>
      <div className="min-w-0">
        <div className="font-semibold text-fg-primary">{s.title}</div>
        <div className="text-xs text-fg-tertiary">{s.detail}</div>
      </div>
    </li>
  );
}