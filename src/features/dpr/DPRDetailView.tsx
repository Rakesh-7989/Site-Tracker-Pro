// SiteTrack Pro — Sprint 2 DPR detail view (/dpr/:id).
//
// Full read on a single Daily Progress Report: transcript, site photo,
// voice clip, geotag, BuildNow anchor state, delivery attempt log and a
// retry action that re-invokes the whatsapp_dpr_send EF (idempotent via
// client_token).

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { Card, Spinner, Alert, Icon, Button } from "@/components/ui/atoms";
import { getDprMessage, listDprDeliveryLog, getBuildnowAnchor, type DprMessageRow, type DprDeliveryLogRow } from "@/app/dprQueries";
import { invokeSendDpr } from "@/app/dprSubmit";
import { getClient } from "@/lib/supabase";
import { DPRStatusBadge } from "./DPRStatusBadge";
import { BuildNowBadge } from "./BuildNowBadge";

const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

function outcomeVisual(outcome: DprDeliveryLogRow["outcome"]): string {
  if (outcome === "success") return "text-success";
  if (outcome === "failed") return "text-error";
  return "text-fg-secondary";
}

export function DPRDetailView(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("dpr:view");

  const [row, setRow] = useState<DprMessageRow | null>(null);
  const [log, setLog] = useState<DprDeliveryLogRow[]>([]);
  const [buildnowMeta, setBuildnowMeta] = useState<{ approval_status?: string; fetched_at?: string | number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client || !activeOrg) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getDprMessage(client, activeOrg.orgId, id);
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setRow(res.data);
    setBuildnowMeta(null);
    if (res.data) {
      const lg = await listDprDeliveryLog(client, res.data.id);
      if (lg.ok) setLog(lg.data);
      if (res.data.projectId) {
        const bn = await getBuildnowAnchor(client, res.data.projectId);
        if (bn.ok) setBuildnowMeta(bn.data);
      }
    }
    setLoading(false);
  }, [id, activeOrg]);

  useEffect(() => { void reload(); }, [reload]);

  const onRetry = useCallback(async () => {
    if (!row) return;
    const client = await getClient();
    if (!client) return;
    setRetrying(true); setRetryMsg(null);
    const payload = {
      client_token: row.clientToken,
      org_id: row.orgId,
      project_id: row.projectId ?? undefined,
      promoter_phone_e164: row.promoterPhone,
      language: (row.language ?? "te") as "te" | "hi" | "en",
      voice_audio_url: row.voiceUrl ?? undefined,
      voice_audio_sha256: row.voiceSha256 ?? undefined,
      transcript_text: row.transcript ?? undefined,
      photo_url: row.photoUrl ?? undefined,
      photo_taken_at: row.photoTakenAt ?? undefined,
      photo_lat: row.lat ?? undefined,
      photo_lon: row.lon ?? undefined,
      buildnow_anchor_url: row.buildnowAnchorUrl ?? undefined,
      buildnow_anchor_hash: row.buildnowAnchorHash ?? undefined,
    };
    const res = await invokeSendDpr(client, payload);
    setRetryMsg(res.ok ? (res.error || `Send ok (${res.status ?? "sent"}).`) : res.error ?? "Send failed.");
    setRetrying(false);
    await reload();
  }, [row, reload]);

  if (!session) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canView) return <Alert variant="warning">Your role can't view DPR history.</Alert>;

  if (loading) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;

  if (!row) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 p-4 md:p-6">
        <Link to="/dpr/history" className="text-xs font-semibold text-accent hover:text-accent-2">← Back to history</Link>
        <Alert variant="danger">{error ?? "DPR not found."}</Alert>
      </div>
    );
  }

  const lang = (row.language as "en" | "te" | "hi") ?? "en";

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/dpr/history" className="text-xs font-semibold text-accent hover:text-accent-2">← Back to history</Link>
        <div className="flex items-center gap-2">
          <DPRStatusBadge status={row.status} lang={lang} size="sm" attempts={row.attempts} />
          {row.language && <span className="text-[11px] font-mono text-fg-tertiary">{row.language.toUpperCase()}</span>}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Transcript */}
      <Card className="p-5 space-y-2">
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Site update</h3>
        {row.transcript ? (
          <p className="text-sm text-fg-primary whitespace-pre-line leading-relaxed">{row.transcript}</p>
        ) : (
          <p className="text-sm text-fg-tertiary">No transcript recorded.</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-fg-tertiary flex-wrap pt-1">
          <span>{fmtDateTime(row.createdAt)}</span>
          {row.supervisorName && <span>{row.supervisorName}</span>}
          <span>to {row.promoterPhone}</span>
          {row.metaMessageId && <span className="font-mono">Meta {row.metaMessageId.slice(0, 12)}…</span>}
        </div>
      </Card>

      {/* Photo */}
      {row.photoUrl && (
        <Card className="p-5 space-y-2">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Site photo</h3>
          <a href={row.photoUrl} target="_blank" rel="noopener noreferrer" className="block">
            <img src={row.photoUrl} alt="Site photo" className="rounded-xl max-h-72 w-full object-cover border border-default bg-secondary" />
          </a>
          {row.lat != null && row.lon != null && (
            <div className="flex items-center gap-2 text-[11px] text-fg-tertiary">
              <Icon name="map" size={12} />
              <span className="font-mono">{row.lat.toFixed(6)}, {row.lon.toFixed(6)}</span>
              {row.photoAccuracyMetres != null && <span>±{row.photoAccuracyMetres}m</span>}
            </div>
          )}
        </Card>
      )}

      {/* Voice */}
      {row.voiceUrl && (
        <Card className="p-5 space-y-2">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Voice note</h3>
          <audio src={row.voiceUrl} controls className="w-full" />
          {row.voiceSha256 && <p className="text-[10px] font-mono text-fg-tertiary break-all">sha256:{row.voiceSha256}</p>}
        </Card>
      )}

      {/* BuildNow anchor */}
      {(row.buildnowAnchorUrl || row.buildnowAnchorHash) && (
        <Card className="p-5 space-y-2">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">BuildNow anchor</h3>
          <div className="flex items-center gap-2">
            <BuildNowBadge metadata={buildnowMeta ?? undefined} lang={lang} size="sm" showLink={false} />
            {row.buildnowSyncedAt && <span className="text-[11px] text-fg-tertiary">synced {fmtDateTime(row.buildnowSyncedAt)}</span>}
          </div>
          {row.buildnowAnchorHash && <p className="text-[10px] font-mono text-fg-tertiary break-all">{row.buildnowAnchorHash}</p>}
        </Card>
      )}

      {/* Delivery log + retry */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">Delivery attempts</h3>
          {row.status === "failed" && (
            <Button size="sm" onClick={() => void onRetry()} disabled={retrying} leftIcon={retrying ? <Spinner size={12} /> : <Icon name="refresh" size={12} />}>
              Retry send
            </Button>
          )}
        </div>
        {retryMsg && <Alert variant={retryMsg.startsWith("Send ok") ? "success" : "danger"}>{retryMsg}</Alert>}
        {log.length === 0 ? (
          <p className="text-xs text-fg-tertiary">No delivery attempts logged yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {log.map(a => (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <Icon name="refresh" size={12} className={`mt-0.5 ${outcomeVisual(a.outcome)}`} />
                <span className="min-w-0 flex-1">
                  <span className={`font-semibold ${outcomeVisual(a.outcome)}`}>Attempt {a.attemptNumber} · {a.outcome}</span>
                  {a.attemptedAt && <span className="text-fg-tertiary"> · {fmtDateTime(a.attemptedAt)}</span>}
                  {a.durationMs != null && <span className="text-fg-tertiary"> · {a.durationMs}ms</span>}
                  {(a.errorDetail || a.errorCode) && (
                    <span className="block text-fg-tertiary truncate mt-0.5">{a.errorDetail ?? a.errorCode}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}