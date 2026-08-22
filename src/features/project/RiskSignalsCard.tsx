// SiteTrack Pro — deterministic project "Risk signals" card (v4 Phase D).
// Feeds milestones, expenses-vs-budget, open issues and RFI lag into
// computeRiskSignals() and renders the score + signal list. Pure math (no
// external AI); shown on the Overview tab for every project member.

import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { Card, Badge, Spinner, Icon, ProgressBar } from "@/components/ui/atoms";
import { computeRiskSignals, type RiskSignal, type RiskLevel } from "@/app/riskQueries";
import { listMilestones } from "@/app/milestoneQueries";
import { listIssues } from "@/app/issueQueries";
import { listExpenses } from "@/app/financeQueries";
import { listRfis } from "@/app/designQueries";
import { localDateISO } from "@/lib/dateLocal";
import type { ProjectDetail } from "@/app/queries";

const LEVEL_TONE: Record<RiskLevel, "neutral" | "info" | "success" | "warning" | "danger"> = {
  low: "success", medium: "warning", high: "danger", critical: "danger",
};

export function RiskSignalsCard({ project }: { project: ProjectDetail }): JSX.Element {
  const [result, setResult] = useState<ReturnType<typeof computeRiskSignals> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const client = await getClient();
    if (!client) { setLoading(false); return; }
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
    setResult(computeRiskSignals({
      milestones: milestones.ok ? milestones.data : undefined,
      budget: allocated > 0 ? { allocated, spent } : undefined,
      openIssues: issues.ok ? issues.data : undefined,
      rfis: rfis.ok ? rfis.data : undefined,
    }, today));
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