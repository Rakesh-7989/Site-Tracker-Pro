import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import {
  acceptProjectPartnerInvite,
  listSharedPartnerProjects,
} from "./partnerQueries";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/forms";

export function SharedProjectsCard() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [orgId, setOrgId] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string; projectId?: string } | null>(
    null,
  );

  const memberships = session?.memberships ?? [];
  const activeOrgId = session?.activeOrgId ?? "";

  const q = useQuery({
    queryKey: ["shared-projects", activeOrgId],
    queryFn: () => listSharedPartnerProjects(getClient()),
    enabled: !!activeOrgId,
  });

  const accept = useMutation({
    mutationFn: () =>
      acceptProjectPartnerInvite(
        getClient(),
        code.trim(),
        orgId || (memberships.length === 1 ? memberships[0]?.orgId : null),
      ),
    onSuccess: (res) => {
      if (res.ok) {
        setResult({ ok: true, text: `Joined "${res.data.projectName}"`, projectId: res.data.projectId });
        setCode("");
        void qc.invalidateQueries({ queryKey: ["shared-projects"] });
      } else {
        setResult({ ok: false, text: res.error });
      }
    },
  });

  if (!activeOrgId) return null;

  const rows = q.data ?? [];

  return (
    <Card title="Shared with my firm" padding="md">
      <div className="flex flex-col gap-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            accept.mutate();
          }}
        >
          <Input
            label="Have an invite code?"
            placeholder="st-…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="w-64"
          />
          {memberships.length > 1 && (
            <select
              aria-label="Redeem for organization"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="h-10 rounded-[var(--st-radius-md)] border border-default bg-panel px-3 text-sm text-fg-primary focus-ring"
            >
              <option value="">Choose org…</option>
              {memberships.map((m) => (
                <option key={m.orgId} value={m.orgId}>
                  {m.orgName}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" loading={accept.isPending}>
            Redeem
          </Button>
        </form>

        {result && (
          <Alert variant={result.ok ? "success" : "error"}>
            {result.projectId ? (
              <Link to={`/projects/${result.projectId}`} className="underline">
                {result.text} — open project
              </Link>
            ) : (
              result.text
            )}
          </Alert>
        )}
        {accept.isError && !result && <Alert variant="error">{String(accept.error)}</Alert>}

        {q.isLoading ? (
          <p className="text-sm text-fg-tertiary">Checking shared projects…</p>
        ) : rows.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {rows.map((s) => (
              <li key={s.projectId} className="flex items-center justify-between gap-3">
                <Link
                  to={`/projects/${s.projectId}`}
                  className="text-sm font-medium text-accent underline-offset-2 hover:underline truncate"
                >
                  {s.projectName || "Shared project"}
                </Link>
                <Badge tone="info">{s.scope}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-fg-tertiary">
            No projects shared with your firm yet. Codes appear here after an invite.
          </p>
        )}
      </div>
    </Card>
  );
}
