// SiteTrack Pro - "Shared with us" strip (cross-org collaboration C1, partner view).
// Lists projects shared WITH the active org and lets its admins redeem an
// invite code. Non-admins see shared projects but redemption is refused by
// the server (only the partner-org admin can accept).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTypedClient } from "@/lib/supabase/db";
import {
  listSharedPartnerProjects,
  acceptProjectPartnerInvite,
  PARTNER_SCOPE_LABEL,
  type SharedPartnerProject,
} from "@/app/queries/partnerQueries";
import { Card, Button, Badge, Alert } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";

export function SharedProjectsCard(): JSX.Element | null {
  const [shared, setShared] = useState<SharedPartnerProject[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedProjectId, setAcceptedProjectId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const client = await getTypedClient();
      if (!client) return;
      setShared(await listSharedPartnerProjects(client));
    } catch {
      setShared([]); // silent: the strip is optional chrome
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true); setError(null);
    try {
      const client = await getTypedClient();
      if (!client) { setError("Backend not configured."); return; }
      const res = await acceptProjectPartnerInvite(client, code.trim());
      if (!res.ok) { setError(res.error); return; }
      setAcceptedProjectId(res.projectId);
      setCode("");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  // Never render for signed-out/local shells; hide entirely once loaded empty
  // AND there is nothing being typed/redeemed — keeps the page calm.
  if (shared !== null && shared.length === 0 && !code && !error && !acceptedProjectId) return null;

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-base font-bold text-fg-primary">Shared with us</h2>
        <div className="flex items-center gap-2">
          <Input
            fit
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Paste invite code"
            aria-label="Partner invite code"
            className="w-56 font-mono text-xs"
            onKeyDown={e => { if (e.key === "Enter") void redeem(); }}
          />
          <Button size="sm" loading={busy} disabled={!code.trim()} onClick={() => void redeem()}>
            Redeem
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError(null)}>{error}</Alert>}

      {acceptedProjectId && (
        <Alert variant="success">
          Invite accepted — <Link to={`/projects/${acceptedProjectId}`} className="text-accent underline">open the project</Link>.
        </Alert>
      )}

      {shared && shared.length > 0 && (
        <ul className="divide-y divide-[color:var(--st-border)]">
          {shared.map(s => (
            <li key={s.projectId} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
              <Link to={`/projects/${s.projectId}`} className="min-w-0">
                <span className="font-medium text-fg-primary text-sm truncate block">{s.projectName}</span>
                {s.hostOrgName && <span className="text-xs text-fg-tertiary">Hosted by {s.hostOrgName}</span>}
              </Link>
              <Badge tone="info" className="shrink-0 capitalize">{PARTNER_SCOPE_LABEL[s.scope].split(" ")[0]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
