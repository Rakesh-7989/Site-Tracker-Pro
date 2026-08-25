import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSharePayload, validateShareLink } from "./shareLinkQueries";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/forms";
import { SkeletonPage } from "@/components/ui/Skeleton";

const REASON_COPY: Record<string, string> = {
  invalid: "This link is not valid.",
  revoked: "This link has been revoked by the company.",
  expired: "This link has expired.",
  exhausted: "This link has reached its view limit.",
};

export function ShareLinkPage() {
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [credsBusy, setCredsBusy] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ projectName: string; sections: number } | null>(null);

  const q = useQuery({
    queryKey: ["share-link", token],
    queryFn: () => validateShareLink(token),
    enabled: !!token,
    retry: false,
  });

  async function submitCreds(e: FormEvent) {
    e.preventDefault();
    setCredsBusy(true);
    setCredsError(null);
    const res = await fetchSharePayload(token, password || undefined, otp || undefined);
    setCredsBusy(false);
    if (res.ok) setSummary(res.summary);
    else setCredsError(res.error);
  }

  return (
    <main className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-lg flex flex-col gap-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-fg-primary">Shared Project</h1>
          <p className="text-xs text-fg-tertiary">SiteTrack Pro client access</p>
        </div>

        {q.isLoading && <SkeletonPage rows={3} />}
        {q.isError && <Alert variant="error">{String(q.error)}</Alert>}

        {q.data && !q.data.valid && (
          <Alert variant={q.data.reason === "revoked" ? "error" : "warning"}>
            {REASON_COPY[q.data.reason] ?? "This link cannot be opened."}
          </Alert>
        )}

        {q.data?.valid && !summary && (
          <Card title={q.data.label ?? "Project report"} padding="md">
            <form onSubmit={submitCreds} className="flex flex-col gap-3">
              {q.data.requiresPassword && (
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              )}
              {q.data.requiresOtp && (
                <Input
                  label="One-time code"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              )}
              {!q.data.requiresPassword && !q.data.requiresOtp && (
                <p className="text-sm text-fg-secondary">
                  Open the shared project progress report.
                </p>
              )}
              {credsError && <Alert variant="error">{credsError}</Alert>}
              <Button type="submit" loading={credsBusy}>
                Open report
              </Button>
            </form>
          </Card>
        )}

        {q.data?.valid && summary && (
          <Card title={summary.projectName || q.data.label || "Project"} padding="md">
            <div className="flex items-center justify-between text-sm text-fg-secondary">
              <span>Progress report unlocked</span>
              <Badge tone="success">verified</Badge>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
