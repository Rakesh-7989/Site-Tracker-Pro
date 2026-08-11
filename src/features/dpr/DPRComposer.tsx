// SiteTrack Pro — DPR Composer (Phase 7, Sprint 2 demo centerpiece).
//
// The Telugu voice → photo → WhatsApp-preview flow a site supervisor uses
// to file a Daily Progress Report. Wires the real voiceTranscribe lib
// (mock provider until Bhashini is keyed) + device geolocation +
// HYDERABAD_BBOX geo-verification + the previewDigest renderer.
//
// Gated on dpr:submit — only roles that can submit a DPR reach the
// compose surface (site_engineer, pm via project ctx).

import { useReducer, useState, useCallback } from "react";
import { Link } from "react-router-dom";

import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { Card, Button, Icon, Spinner, Alert, Badge } from "@/components/ui/atoms";
import { FormField, Select, Textarea, Input } from "@/components/ui/forms";
import { useT } from "@/i18n/I18nProvider";
import { normalizeE164, submitDpr, makeSupabaseDprRuntime, type DprSendStatus } from "@/app/dprSubmit";
import { getClient } from "@/lib/supabase";
import { isOnline } from "@/lib/offline";
import { useOfflineSync } from "@/lib/dprOfflineSync";
import {
  dprReducer, EMPTY_DRAFT, canSubmit, meetsQualityBar, draftChecklist,
  type DprLanguage,
} from "./dprDraft";
import { previewDigest } from "./digestPreview";
import { VoiceNoteRecorder, type VoiceRecordingResult } from "./VoiceNoteRecorder";
import { PhotoGeotagCapture, type PhotoGeotagResult } from "./PhotoGeotagCapture";
import { OfflineQueueBanner } from "./OfflineQueueBanner";

const LANG_OPTIONS: Array<{ value: DprLanguage; labelKey: string }> = [
  { value: "te", labelKey: "voice.language.te" },
  { value: "hi", labelKey: "voice.language.hi" },
  { value: "en", labelKey: "voice.language.en" },
];

const todayIso = (): string => {
  // Browser context — Date is available. Kept in a helper so tests of the
  // pure modules never depend on it.
  return new Date().toISOString().slice(0, 10);
};

export function DPRComposer(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canSubmitDpr = useCan("dpr:submit");
  const canViewDpr = useCan("dpr:view");
  const t = useT();
  const [draft, dispatch] = useReducer(dprReducer, EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<{ status: DprSendStatus; error?: string; queued: boolean } | null>(null);
  const [promoterPhone, setPromoterPhone] = useState("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [photo, setPhoto] = useState<PhotoGeotagResult | null>(null);
  const { queued: offlineQueued, draining: offlineDraining } = useOfflineSync();

  // If user can only view DPRs, redirect to read-only view
  if (canViewDpr && !canSubmitDpr) {
    // Check if redirect=true query param is present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('redirect') === 'true') {
      return (
        <Card className="max-w-lg mx-auto p-4 md:p-8 text-center">
          <Icon name="lock" size={24} className="mx-auto text-fg-tertiary mb-2" />
          <div className="text-sm text-fg-secondary">{t("dpr.composer.accessDeniedViewOnly")}</div>
        </Card>
      );
    }
    return (
      <Card className="max-w-lg mx-auto p-4 md:p-8 text-center">
        <Icon name="clipboard" size={24} className="mx-auto text-fg-tertiary mb-2" />
        <div className="text-sm text-fg-secondary mb-4">
          {t("dpr.composer.roleViewOnly")}
        </div>
        <Button
          onClick={() => window.location.assign('/dpr/history')}
          leftIcon={<Icon name="doc" size={16} />}
        >
          {t("dpr.composer.viewDprTitle")}
        </Button>
      </Card>
    );
  }

  // ── Voice: transcribe via the real lib (EF when backend present) ──
  const onRecorded = useCallback((result: VoiceRecordingResult) => {
    setRecordedBlob(result.blob);
  }, []);

  const onTranscribe = useCallback(async () => {
    if (!recordedBlob) return;
    dispatch({ type: "voice-start" });
    setTranscribing(true);
    try {
      const mod = await import("../../lib/voiceTranscribe");
      const client = await getClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = client
        ? await (mod as any).transcribe(recordedBlob, { lang: draft.language, provider: "auto", transport: "ef", efClient: client })
        : await (mod as any).transcribe(recordedBlob, { lang: draft.language, provider: "mock", transport: "mock" });
      if (res?.ok) {
        dispatch({ type: "voice-done", transcript: res.text, confidence: res.confidence ?? 0, provider: res.provider ?? "mock" });
      } else {
        dispatch({ type: "voice-error", error: res?.error ?? "Transcription failed." });
      }
    } catch (e) {
      dispatch({ type: "voice-error", error: e instanceof Error ? e.message : String(e) });
    }
    setTranscribing(false);
  }, [draft.language, recordedBlob]);

  // ── Photo: capture + geotag (EXIF first, device GPS fallback) ──
  const onPhotoCapture = useCallback((res: PhotoGeotagResult | null) => {
    setPhoto(res);
    if (res) {
      dispatch({
        type: "photo-add",
        fileName: res.fileName,
        lat: res.lat ?? undefined,
        lon: res.lon ?? undefined,
        withinHyderabad: res.withinHyderabad ?? undefined,
      });
    } else {
      dispatch({ type: "photo-clear" });
    }
  }, []);

  // ── Submit: upload media → enqueue → real WhatsApp EF send ──
  const onSubmit = useCallback(async () => {
    if (!canSubmit(draft) || !session || submitting) return;
    setSubmitting(true);
    setSubmitState(null);
    try {
      const client = await getClient();
      const runtime = client
        ? makeSupabaseDprRuntime(client, activeOrg?.orgId ?? "", { online: isOnline() })
        : { online: isOnline() };
      const res = await submitDpr(
        {
          orgId: activeOrg?.orgId ?? "",
          supervisorUserId: session.user?.id,
          promoterPhone,
          language: draft.language,
          transcript: draft.voice.transcript ?? undefined,
          confidence: draft.voice.confidence ?? undefined,
          provider: draft.voice.provider ?? undefined,
          photoLat: draft.photo.lat,
          photoLon: draft.photo.lon,
          photoTakenAt: photo?.takenAt ?? undefined,
        },
        { photo: photo?.blob ?? undefined, voice: recordedBlob ?? undefined },
        runtime,
      );
      setSubmitState({
        status: res.status ?? (res.queued ? "queued" : "failed"),
        error: res.error,
        queued: res.queued,
      });
    } catch (e) {
      setSubmitState({ status: "failed", error: e instanceof Error ? e.message : String(e), queued: false });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, draft, session, activeOrg, promoterPhone, photo, recordedBlob, submitting]);

  const resetAll = useCallback(() => {
    setSubmitting(false);
    setSubmitState(null);
    setPromoterPhone("");
    setPhoto(null);
    setRecordedBlob(null);
    dispatch({ type: "reset" });
  }, []);

  if (!session) return <></>;

  if (!canSubmitDpr) {
    return (
      <Card className="max-w-lg mx-auto p-4 md:p-8 text-center">
        <Icon name="lock" size={24} className="mx-auto text-fg-tertiary mb-2" />
        <div className="text-sm text-fg-secondary">{t("dpr.composer.roleCantSubmit")}</div>
      </Card>
    );
  }

  const quality = meetsQualityBar(draft);
  const checklist = draftChecklist(draft);
  const preview = canSubmit(draft)
    ? previewDigest({
        projectName: activeOrg?.orgName ?? "Project",
        date: todayIso(),
        language: draft.language,
        transcript: draft.voice.transcript ?? "",
        promoterName: undefined,
        hasPhoto: draft.photo.status === "added",
        geoVerified: draft.photo.withinHyderabad === true,
      })
    : null;

  if (submitState) {
    const done = submitState.status === "sent" || submitState.status === "delivered" || submitState.status === "read";
    return (
      <div className="max-w-lg mx-auto p-4 md:p-6">
        <Card className="p-4 md:p-8 text-center">
          <div className={`w-12 h-12 rounded-full grid place-items-center mx-auto mb-3 ${done ? "bg-success-tint text-success" : submitState.queued ? "bg-accent-tint text-accent" : "bg-error-tint text-error"}`}>
            <Icon name={done ? "check" : submitState.queued ? "send" : "alert"} size={24} />
          </div>
          <h2 className="font-display text-lg font-bold text-fg-primary">
            {submitState.queued ? t("dpr.composer.queuedTitle") : done ? t("dpr.composer.submittedTitle") : t("dpr.composer.failedTitle")}
          </h2>
          <p className="text-sm text-fg-secondary mt-1">
            {submitState.error ?? (submitState.queued ? t("dpr.composer.queuedBody") : t("dpr.composer.sentBody"))}
          </p>
          <Button className="mt-4" variant="secondary" size="md" onClick={resetAll}>
            {t("dpr.composer.composeAnother")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-fg-primary">{t("dpr.composer.title")}</h1>
          <p className="text-sm text-fg-secondary mt-0.5">{t("dpr.composer.subtitle")}</p>
        </div>
        <Link to="/dpr/history" className="text-xs font-semibold text-accent hover:text-accent-2 whitespace-nowrap">{t("dpr.composer.viewHistory")}</Link>
      </div>

      {/* Offline queue banner */}
      <OfflineQueueBanner queued={offlineQueued} draining={offlineDraining} />

      {/* Language + promoter */}
      <Card className="p-5 space-y-4">
        <FormField label={t("dpr.composer.reportLanguage")} htmlFor="dpr-lang">
          <Select id="dpr-lang" value={draft.language} options={LANG_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) }))}
            onChange={e => dispatch({ type: "set-language", language: e.target.value as DprLanguage })} />
        </FormField>
        <FormField label={t("dpr.composer.promoterPhoneLabel")} htmlFor="dpr-promoter"
          hint={t("dpr.composer.promoterHint")}>
          <Input id="dpr-promoter" type="tel" inputMode="tel" value={promoterPhone}
            placeholder="+91 98765 43210"
            invalid={promoterPhone.trim().length > 0 && normalizeE164(promoterPhone) == null}
            onChange={e => setPromoterPhone(e.target.value)} />
        </FormField>
      </Card>

      {/* Voice */}
      <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.composer.stepVoice")}</h3>} action={draft.voice.status === "done" && quality !== null && (
        <Badge tone={quality ? "success" : "warning"}>
          {Math.round((draft.voice.confidence ?? 0) * 100)}% {quality ? t("dpr.composer.qualityGood") : t("dpr.composer.qualityLow")}
        </Badge>
      )}>
        <div className="space-y-3">
        {draft.voice.status === "idle" && (
          <VoiceNoteRecorder
            onRecorded={onRecorded}
            onTranscribe={onTranscribe}
            transcribing={transcribing}
          />
        )}
        {draft.voice.status === "transcribing" && (
          <div className="flex items-center gap-2 text-sm text-fg-secondary"><Spinner size={16} /> {t("dpr.composer.transcribing")}</div>
        )}
        {draft.voice.status === "done" && (
          <FormField label={t("dpr.composer.transcriptLabel", { provider: draft.voice.provider ?? "mock" })} htmlFor="dpr-transcript">
            <Textarea id="dpr-transcript" value={draft.voice.transcript ?? ""} readOnly rows={3} />
          </FormField>
        )}
        {draft.voice.status === "error" && <Alert variant="danger" icon={<Icon name="alert" size={14} />}>{draft.voice.error}</Alert>}
        </div>
      </Card>

      {/* Photo */}
      <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.composer.stepPhoto")}</h3>} action={<div className="flex items-center gap-2">
        {draft.photo.status === "added" && draft.photo.withinHyderabad === true && <Badge tone="success">{t("dpr.composer.hyderabadVerified")}</Badge>}
        {draft.photo.status === "added" && draft.photo.withinHyderabad === false && <Badge tone="warning">{t("dpr.composer.outsideHyderabad")}</Badge>}
      </div>}>
        <PhotoGeotagCapture onCapture={onPhotoCapture} />
      </Card>

      {/* Preview + submit */}
      {preview && (
        <Card padding="lg" title={<h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">{t("dpr.composer.stepPreview")}</h3>}>
          <div className="space-y-3">
          <div className="rounded-xl bg-success-tint border border-default p-3 text-sm text-fg-primary whitespace-pre-line leading-relaxed">{preview}</div>
          <div className="space-y-1.5">
            {checklist.map(c => (
              <div key={c.label} className={`flex items-center gap-2 text-xs ${c.done ? "text-success" : "text-fg-tertiary"}`}>
                <Icon name={c.done ? "check" : "clipboard"} size={13} /> {c.label}
              </div>
            ))}
          </div>
          <Button fullWidth size="lg" onClick={() => void onSubmit()} loading={submitting} disabled={normalizeE164(promoterPhone) == null}
            leftIcon={<Icon name="send" size={16} />}>
            {submitting ? t("dpr.composer.sendingCta") : t("dpr.composer.sendCta")}
          </Button>
          {promoterPhone.trim().length > 0 && normalizeE164(promoterPhone) == null && (
            <p className="text-xs text-error text-center">{t("dpr.composer.enterValidNumber")}</p>
          )}
          </div>
        </Card>
      )}
    </div>
  );
}
