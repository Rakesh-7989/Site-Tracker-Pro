import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase";
import { useT } from "@/i18n";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/forms";

export function ClientAccessTab({ projectId }: { projectId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await getClient().rpc("create_share_link", {
        p_project_id: projectId,
        ...(label.trim() ? { p_label: label.trim() } : {}),
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const row = Array.isArray(data) ? data[0] : data;
      const token = (row as { token?: string } | undefined)?.token;
      if (!token) throw new Error("no-token-returned");
      setLinkUrl(`${window.location.origin}/share-link/${token}`);
      setCopied(false);
      void qc.invalidateQueries({ queryKey: ["share-link"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("detail.clientLinkTitle")} padding="md">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary">
          Generate a secure link your client can open without an account. Optional
          password/OTP enforcement and expiry controls land with the full portal.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label={t("detail.label")}
            placeholder="Weekly review — week 12"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-72"
          />
          <Button loading={busy} onClick={() => void mint()}>
            {t("detail.genLink")}
          </Button>
        </div>
        {error && <Alert variant="error">{error}</Alert>}
        {linkUrl && (
          <div className="rounded-[var(--st-radius-md)] bg-elevated px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <code className="text-sm text-fg-primary break-all">{linkUrl}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(linkUrl).then(() => setCopied(true));
              }}
            >
              {copied ? t("common.copied") : t("common.copy")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
