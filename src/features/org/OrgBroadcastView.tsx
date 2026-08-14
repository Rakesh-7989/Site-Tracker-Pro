// SiteTrack Pro — Org Broadcast (/org/broadcast). "Broadcast" a typed
// notification to all active org members via the `send_org_notification` RPC.

import { useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { NOTIFICATION_TITLES, type NotificationType } from "@/app/notificationTemplates";
import { sendOrgNotification } from "@/app/orgBroadcastQueries";

const TYPE_OPTS = (Object.keys(NOTIFICATION_TITLES) as NotificationType[]).map(t => ({ value: t, label: NOTIFICATION_TITLES[t] }));

export function OrgBroadcastView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("org:notifications:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Org broadcast requires the notifications manage capability." />;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const [type, setType] = useState<NotificationType>("welcome");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent_count: number; failed_count: number } | null>(null);

  const send = async () => {
    setSending(true); setError(null); setResult(null);
    const res = await sendOrgNotification(orgId, type, {});
    if (!res.success) setError(res.error || "Failed to send notification");
    else setResult({ sent_count: res.sent_count, failed_count: res.failed_count });
    setSending(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Org broadcast</h1>
      <p className="text-sm text-fg-secondary -mt-2">Send a typed notification to every active member of this org.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {result && <Alert variant="success">Sent to {result.sent_count} member{result.sent_count === 1 ? "" : "s"} ({result.failed_count} failed).</Alert>}

      <Card className="p-4 space-y-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notification type</span>
          <Select fit className="mt-1 w-64" value={type} onChange={e => setType(e.target.value as NotificationType)} options={TYPE_OPTS} />
        </div>
        <Button onClick={() => void send()} disabled={sending}>
          {sending ? <Spinner size={14} /> : <Icon name="bell" size={14} />} Send org broadcast
        </Button>
      </Card>
    </div>
  );
}
