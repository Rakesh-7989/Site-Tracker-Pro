import { useQuery } from "@tanstack/react-query";
import { listRaBills, raNetPayable } from "./financeQueries";
import { useT } from "@/i18n";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonPage } from "@/components/ui/Skeleton";

const STATUS_TONE: Record<string, "success" | "info" | "warning" | "error" | "neutral"> = {
  submitted: "neutral",
  approved: "info",
  paid: "success",
  rejected: "error",
};

export function RaBillsTab({ projectId }: { projectId: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["rabills", projectId],
    queryFn: () => listRaBills(projectId),
  });

  if (q.isLoading) return <SkeletonPage rows={3} />;
  if (q.isError) return <Alert variant="error">{String(q.error)}</Alert>;

  const rows = q.data ?? [];
  const totalNet = rows.reduce(
    (sum, b) => sum + raNetPayable(b.billAmount, b.retentionPct),
    0,
  );

  return (
    <Card title={`${t("detail.raBills")} (${rows.length}) · net ₹${totalNet.toLocaleString("en-IN")}`} padding="none">
      {rows.length === 0 ? (
        <EmptyState
          title="No RA bills yet"
          message="Running-account bills raised against this project appear here."
        />
      ) : (
        <ul className="divide-y divide-[var(--st-border)]">
          {rows.map((b) => {
            const net = raNetPayable(b.billAmount, b.retentionPct);
            return (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg-primary">
                    {b.no}
                    {b.subcontractor ? ` · ${b.subcontractor}` : ""}
                  </div>
                  <div className="text-xs text-fg-tertiary truncate">
                    {b.scope ?? "—"} · bill ₹{b.billAmount.toLocaleString("en-IN")}
                    {b.cumulative != null ? ` · cum ₹${b.cumulative.toLocaleString("en-IN")}` : ""}
                    {b.billDate ? ` · ${b.billDate}` : ""}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-fg-primary">
                    ₹{Math.max(0, net - b.paidAmount).toLocaleString("en-IN")}
                    <span className="ml-1 text-xs font-normal text-fg-tertiary">{t("detail.due")}</span>
                  </span>
                  <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
