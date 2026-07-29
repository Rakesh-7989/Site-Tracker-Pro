import { useState } from "react";
import { Card, Button, Spinner, Alert } from "@/components/ui/atoms";
import { getClient } from "@/lib/supabase";
import { requestProjectAccess } from "@/app/projectMemberQueries";

export interface RequestProjectAccessProps {
  projectId: string;
  projectName: string;
}

export function RequestProjectAccess({ projectId, projectName }: RequestProjectAccessProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    setBusy(true);
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const res = await requestProjectAccess(client, projectId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
  };

  return (
    <div className="grid place-items-center py-20">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {done ? (
          <>
            <div className="w-12 h-12 rounded-full bg-safety-100 flex items-center justify-center mx-auto">
              <span className="text-safety-600 text-xl font-bold">✓</span>
            </div>
            <h2 className="font-display text-lg font-bold text-ink-900">Request sent</h2>
            <p className="text-sm text-ink-600">
              Your request to access <strong>{projectName}</strong> has been sent to the org admin.
              You will be notified when it is approved.
            </p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-cream-200 flex items-center justify-center mx-auto">
              <span className="text-ink-500 text-xl font-bold">?</span>
            </div>
            <h2 className="font-display text-lg font-bold text-ink-900">Access required</h2>
            <p className="text-sm text-ink-600">
              You are not a member of <strong>{projectName}</strong>. Ask the org admin to add you, or send a request.
            </p>
            {error && <Alert variant="danger">{error}</Alert>}
            <Button onClick={() => void handleRequest()} disabled={busy} className="w-full">
              {busy ? <Spinner size={14} /> : null}
              Request access
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
