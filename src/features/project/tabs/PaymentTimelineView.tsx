// SiteTrack Pro — Payment Timeline View (V6 Phase 1.4).
// Renders a chronological timeline of payment events for an invoice or RA bill.

import { Icon, Badge } from "@/components/ui/atoms";
import { type PaymentTimelineEvent } from "@/app/receiptQueries";

const KIND_LABEL: Record<string, string> = {
  payment_received: "Payment Received",
  status_changed: "Status Changed",
  payment_method_updated: "Method Updated",
  reference_updated: "Reference Updated",
};

const KIND_ICON: Record<string, "download" | "refresh" | "send" | "arrow"> = {
  payment_received: "download",
  status_changed: "refresh",
  payment_method_updated: "send",
  reference_updated: "arrow",
};

const KIND_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  payment_received: "success",
  status_changed: "info",
  payment_method_updated: "warning",
  reference_updated: "neutral",
};

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface PaymentTimelineViewProps {
  timeline: PaymentTimelineEvent[];
}

export function PaymentTimelineView({ timeline }: PaymentTimelineViewProps) {
  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-fg-tertiary">
        <Icon name="activity" size={24} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">No timeline events yet.</p>
        <p className="text-xs text-fg-tertiary mt-1">Payments and status changes will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {timeline.map(e => (
        <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-elevated border border-default">
          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: `var(--color-${KIND_TONE[e.kind]}-bg)`, color: `var(--color-${KIND_TONE[e.kind]})` }}>
            <Icon name={KIND_ICON[e.kind]} size={12} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-fg-primary">{KIND_LABEL[e.kind]}</span>
              <Badge tone={KIND_TONE[e.kind] as "info" | "success" | "warning" | "neutral"}>{e.kind.replace("_", " ")}</Badge>
            </div>
            <div className="text-xs text-fg-secondary mt-1">{e.description}</div>
            <div className="flex flex-wrap gap-3 text-[10px] text-fg-tertiary mt-1">
              {e.amount != null && <span>₹{Number(e.amount).toLocaleString("en-IN")}</span>}
              {e.method && <span>{e.method}</span>}
              {e.reference && <span>{e.reference}</span>}
              {e.oldStatus && e.newStatus && <span>{e.oldStatus} → {e.newStatus}</span>}
              {e.createdByName && <span>by {e.createdByName}</span>}
              <span>{fmtDateTime(e.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}