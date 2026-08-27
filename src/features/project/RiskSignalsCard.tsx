// SiteTrack Pro — deterministic project "Risk signals" card (v4 Phase D).
// Prefers the nightly server snapshot (project_risk_signals — migrations
// 225/226) when fresh; otherwise feeds milestones, expenses-vs-budget, open
// issues and RFI lag into computeRiskSignals() on the fly. Renders the score
// + signal list. Pure math (no external AI); shown on Overview for members.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { Card, Badge, Spinner, Icon, ProgressBar } from "@/components/ui/atoms";
import {
  computeRiskSignals, getProjectRiskSnapshot, isSnapshotFresh,
  type StoredRiskSnapshot, type RiskSignal, type RiskLevel,
} from "@/app/queries/riskQueries";
import { listMilestones } from "@/app/queries/milestoneQueries";
import { listIssues } from "@/app/queries/issueQueries";
import { listExpenses } from "@/app/queries/financeQueries";
import { listRfis } from "@/app/queries/designQueries";
import { localDateISO } from "@/lib/utils/dateLocal";
import type { ProjectDetail } from "@/app/queries/queries";

const LEVEL_TONE: Record<RiskLevel, "neutral" | "info" | "success" | "warning" | "danger"> = {
  low: "success", medium: "warning", high: "danger", critical: "danger",
};

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

export function RiskSignalsCard({ project }: { project: ProjectDetail }): JSX.Element {
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
  if (result.score === 0) {
    return (
      <Card padding="lg" title={<div className="flex items-center gap-2">
        <Icon name="check" size={15} className="text-success" />
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Risk signals</h3>
      </div>} action={<Badge tone="success">Low</Badge>}>
        <div className="text-sm text-fg-secondary">No active risk signals detected.</div>
      </Card>
    );
  }

  return (
    <Card padding="lg" title={<div className="flex items-center gap-2">
      <Icon name="alert" size={15} className="text-warning" />
      <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Risk signals</h3>
      <Badge tone={LEVEL_TONE[result.level]}>{result.level}</Badge>
    </div>} action={<div className="flex items-center gap-2">
      <ProgressBar value={result.score} color={result.level === "critical" ? "red" : result.level === "high" ? "red" : "orange"} className="w-24" />
      <span className="text-sm font-bold text-fg-primary">{result.score}/100</span>
    </div>}>

      <div className="text-xs text-fg-secondary">
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

      <ul className="mt-3 space-y-1.5">
        {result.signals.map(s => <SignalRow key={s.code} s={s} />)}
      </ul>
    </Card>
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