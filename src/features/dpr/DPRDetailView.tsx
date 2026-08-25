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
import { BuildNowBadge } from "@/features/dpr/BuildNowBadge";
import { useT } from "@/i18n/I18nProvider";
import { getClient } from "@/lib/supabase";
import { getDprMessage, listDprDeliveryLog, getBuildnowAnchor, type DprMessageRow, type DprDeliveryLogRow } from "@/app/dprQueries";
import { loadProjectHierarchy, hierarchyPath } from "@/app/spaceQueries";
import { invokeSendDpr } from "@/app/dprSubmit";
import { downloadDprPdf, getDprPdfBlob, dprWhatsAppShareEnabled, waShareLink } from "@/app/dprPdf";
import { isNativeMobile } from "@/lib/platform";
import { nativeShareFile } from "@/lib/native-capabilities";

export const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function outcomeVisual(outcome: DprDeliveryLogRow["outcome"]): string {
  if (outcome === "success") return "text-success";
  if (outcome === "failed") return "text-error";
  return "text-fg-secondary";
}

export function DPRDetailView(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("dpr:view");
  const t = useT();

  const [row, setRow] = useState<DprMessageRow | null>(null);
  const [log, setLog] = useState<DprDeliveryLogRow[]>([]);
  const [buildnowMeta, setBuildnowMeta] = useState<{ approval_status?: string; fetched_at?: string | number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [retryOk, setRetryOk] = useState(false);
  const [locationPath, setLocationPath] = useState<string[]>([]);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client || !activeOrg) { setError(t("dpr.history.backendUnconfigured")); setLoading(false); return; }
    const res = await getDprMessage(client, activeOrg.orgId, id);
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setRow(res.data);
    setBuildnowMeta(null);
    setLocationPath([]);
    if (res.data) {
      const lg = await listDprDeliveryLog(client, res.data.id);
      if (lg.ok) setLog(lg.data);
      if (res.data.projectId) {
        const bn = await getBuildnowAnchor(client, res.data.projectId);
        if (bn.ok) setBuildnowMeta(bn.data);
      }
      if (res.data.projectId && res.data.locationId) {
        const h = await loadProjectHierarchy(client, res.data.projectId);
        if (h.ok) {
          const path = hierarchyPath(h.data, res.data.locationId).map(p => p.name);
          if (path.length) {
            setLocationPath(path);
            res.data.locationLabel = path.join(" / ");
          }
        }
      }
    }
    setLoading(false);
  }, [id, activeOrg, t]);

  useEffect(() => { void reload(); }, [reload]);

const onRetry = useCallback(async () => {
    if (!row) return;
    const client = await getClient();
    if (!client) return;
    setRetrying(true); setRetryMsg(null); setRetryOk(false);
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
    setRetryOk(res.ok);
    setRetryMsg(res.ok ? (res.error || t("dpr.detail.sendOk", { status: res.status ?? "sent" })) : res.error ?? t("dpr.detail.sendFailed"));
    setRetrying(false);
    await reload();
}, [row, reload, t]);

  if (!session) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (!activeOrg) return <Alert variant="warning">{t("dpr.history.noOrg")}</Alert>;
  if (!canView) return <Alert variant="warning">{t("dpr.history.noPermission")}</Alert>;

  if (loading) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;

  if (!row) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 p-4 md:p-6">
        <Link to="/dpr/history" className="text-xs font-semibold text-accent hover:text-accent-2">{t("dpr.detail.backToHistory")}</Link>
        <Alert variant="danger">{error ?? t("dpr.detail.notFound")}</Alert>
      </div>
    );
  }

  const lang = (row.language as "en" | "te" | "hi") ?? "en";

  const whatsappShareData = {
    phone: row.promoterPhone,
    title: `DPR ${fmtDateTime(row.createdAt)} — ${row.transcript?.slice(0, 120) ?? "Site update"}`,
  };

  // Native share sheet: hands the REAL PDF to WhatsApp/Drive/mail etc.
  const [sharing, setSharing] = useState(false);
  const onNativeShare = useCallback(() => {
    void (async () => {
      setSharing(true);
      try {
        const blob = getDprPdfBlob(row, activeOrg.orgName);
        await nativeShareFile({ fileName: `dpr-${row.id.slice(0, 8)}.pdf`, blob, title: "SiteTrack Pro DPR" });
      } finally {
        setSharing(false);
      }
    })();
  }, [row, activeOrg.orgName]);

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/dpr/history" className="text-xs font-semibold text-accent hover:text-accent-2">{t("dpr.detail.backToHistory")}</Link>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void downloadDprPdf(row, activeOrg.orgName)} leftIcon={<Icon name="download" size={12} />}>
            {t("dpr.detail.downloadPdf")}
          </Button>
          {isNativeMobile() && (
            <Button size="sm" variant="ghost" onClick={onNativeShare} disabled={sharing} leftIcon={<Icon name="share" size={12} />}>
              Share PDF
            </Button>
          )}
          { dprWhatsAppShareEnabled({ VITE_DPR_PDF_WHATSAPP: import.meta.env.VITE_DPR_PDF_WHATSAPP as string | undefined, DEV: import.meta.env.DEV }) && (
            <a href={waShareLink(whatsappShareData.phone, whatsappShareData.title)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-success hover:opacity-80">
              <Icon name="whatsapp" size={13} />{t("dpr.detail.shareWhatsApp")}
            </a>
          )}

          
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Transcript */}
      <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.detail.siteUpdate")}</h3>}>
        <div className="space-y-2">
        {row.transcript ? (
          <p className="text-sm text-fg-primary whitespace-pre-line leading-relaxed">{row.transcript}</p>
        ) : (
          <p className="text-sm text-fg-tertiary">{t("dpr.detail.noTranscript")}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-fg-tertiary flex-wrap pt-1">
          <span>{fmtDateTime(row.createdAt)}</span>
          {row.supervisorName && <span>{row.supervisorName}</span>}
          <span>{t("dpr.history.toPhone", { phone: row.promoterPhone })}</span>
          {locationPath.length > 0 && (
            <span className="inline-flex items-center gap-1 text-fg-secondary">
              <Icon name="map" size={12} />
              {locationPath.join(" / ")}
            </span>
          )}
          {row.metaMessageId && <span className="font-mono">Meta {row.metaMessageId.slice(0, 12)}…</span>}
        </div>
        </div>
      </Card>

      {/* Photo */}
      {row.photoUrl && (
        <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.detail.sitePhoto")}</h3>}>
          <div className="space-y-2">
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
          </div>
        </Card>
      )}

      {/* Voice */}
      {row.voiceUrl && (
        <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.detail.voiceNote")}</h3>}>
          <div className="space-y-2">
          <audio src={row.voiceUrl} controls className="w-full" />
          {row.voiceSha256 && <p className="text-[10px] font-mono text-fg-tertiary break-all">sha256:{row.voiceSha256}</p>}
          </div>
        </Card>
      )}

      {/* BuildNow anchor */}
      {(row.buildnowAnchorUrl || row.buildnowAnchorHash) && (
        <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.detail.buildnowAnchor")}</h3>}>
          <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BuildNowBadge metadata={buildnowMeta ?? undefined} lang={lang} size="sm" showLink={false} />
            {row.buildnowSyncedAt && <span className="text-[11px] text-fg-tertiary">{t("dpr.detail.syncedAt", { time: fmtDateTime(row.buildnowSyncedAt) })}</span>}
          </div>
          {row.buildnowAnchorHash && <p className="text-[10px] font-mono text-fg-tertiary break-all">{row.buildnowAnchorHash}</p>}
          </div>
        </Card>
      )}

      {/* Delivery log + retry */}
      <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.detail.deliveryAttempts")}</h3>} action={row.status === "failed" && (
        <Button size="sm" onClick={() => void onRetry()} loading={retrying} leftIcon={<Icon name="refresh" size={12} />}>
          {t("dpr.detail.retrySend")}
        </Button>
      )}>
        <div className="space-y-3">
        {retryMsg && <Alert variant={retryOk ? "success" : "danger"}>{retryMsg}</Alert>}
        {log.length === 0 ? (
          <p className="text-xs text-fg-tertiary">{t("dpr.detail.noAttempts")}</p>
        ) : (
          <ol className="space-y-1.5">
            {log.map(a => (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <Icon name="refresh" size={12} className={`mt-0.5 ${outcomeVisual(a.outcome)}`} />
                <span className="min-w-0 flex-1">
                  <span className={`font-semibold ${outcomeVisual(a.outcome)}`}>{t("dpr.detail.attemptRow", { number: a.attemptNumber, outcome: a.outcome })}</span>
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
        </div>
      </Card>
    </div>
  );
}