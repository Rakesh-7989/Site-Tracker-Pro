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

const LANG_OPTIONS = [
  { value: "te", label: "Telugu" },
  { value: "hi", label: "Hindi" },
  { value: "en", label: "English" },
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
          <div className="text-sm text-fg-secondary">Access denied. You can view DPR history at the main DPR history page.</div>
        </Card>
      );
    }
    return (
      <Card className="max-w-lg mx-auto p-4 md:p-8 text-center">
        <Icon name="clipboard" size={24} className="mx-auto text-fg-tertiary mb-2" />
        <div className="text-sm text-fg-secondary mb-4">
          Your role can view daily progress reports but cannot submit them.
        </div>
        <Button
          onClick={() => window.location.assign('/dpr/history')}
          leftIcon={<Icon name="doc" size={16} />}
        >
          View DPR history
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
        <div className="text-sm text-fg-secondary">Your role can't submit daily progress reports.</div>
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
            {submitState.queued ? "DPR queued — will send" : done ? "DPR submitted" : "DPR send failed"}
          </h2>
          <p className="text-sm text-fg-secondary mt-1">
            {submitState.error ?? (submitState.queued ? "Saved offline. We'll send it to the promoter as soon as you're back online." : "The promoter will receive the WhatsApp digest.")}
          </p>
          <Button className="mt-4" variant="secondary" size="md" onClick={resetAll}>
            Compose another
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-fg-primary">Daily Progress Report</h1>
          <p className="text-sm text-fg-secondary mt-0.5">Speak your update, add a site photo, send to the promoter.</p>
        </div>
        <Link to="/dpr/history" className="text-xs font-semibold text-accent hover:text-accent-2 whitespace-nowrap">View history</Link>
      </div>

      {/* Offline queue banner */}
      {offlineQueued > 0 && (
        <div className="flex items-center gap-2 text-xs font-semibold rounded-lg bg-accent-tint border border-accent text-accent px-3 py-2">
          <Icon name="send" size={14} />
          <span>{offlineQueued} DPR{offlineQueued === 1 ? "" : "s"} queued — {offlineDraining ? "sending…" : "will send when you're back online"}</span>
        </div>
      )}

      {/* Language + promoter */}
      <Card className="p-5 space-y-4">
        <FormField label="Report language" htmlFor="dpr-lang">
          <Select id="dpr-lang" value={draft.language} options={LANG_OPTIONS}
            onChange={e => dispatch({ type: "set-language", language: e.target.value as DprLanguage })} />
        </FormField>
        <FormField label="Promoter WhatsApp number" htmlFor="dpr-promoter"
          hint="+91XXXXXXXXXX — this is who receives the daily digest.">
          <Input id="dpr-promoter" type="tel" inputMode="tel" value={promoterPhone}
            placeholder="+91 98765 43210"
            invalid={promoterPhone.trim().length > 0 && normalizeE164(promoterPhone) == null}
            onChange={e => setPromoterPhone(e.target.value)} />
        </FormField>
      </Card>

      {/* Voice */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">1 · Voice note</h3>
          {draft.voice.status === "done" && quality !== null && (
            <Badge tone={quality ? "success" : "warning"}>
              {Math.round((draft.voice.confidence ?? 0) * 100)}% {quality ? "good" : "low"}
            </Badge>
          )}
        </div>
        {draft.voice.status === "idle" && (
          <VoiceNoteRecorder
            onRecorded={onRecorded}
            onTranscribe={onTranscribe}
            transcribing={transcribing}
          />
        )}
        {draft.voice.status === "transcribing" && (
          <div className="flex items-center gap-2 text-sm text-fg-secondary"><Spinner size={16} /> Transcribing…</div>
        )}
        {draft.voice.status === "done" && (
          <FormField label={`Transcript (${draft.voice.provider})`} htmlFor="dpr-transcript">
            <Textarea id="dpr-transcript" value={draft.voice.transcript ?? ""} readOnly rows={3} />
          </FormField>
        )}
        {draft.voice.status === "error" && <Alert variant="danger" icon={<Icon name="alert" size={14} />}>{draft.voice.error}</Alert>}
      </Card>

      {/* Photo */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">2 · Site photo</h3>
          {draft.photo.status === "added" && draft.photo.withinHyderabad === true && <Badge tone="success">Hyderabad ✓</Badge>}
          {draft.photo.status === "added" && draft.photo.withinHyderabad === false && <Badge tone="warning">Outside Hyderabad</Badge>}
        </div>
        <PhotoGeotagCapture onCapture={onPhotoCapture} />
      </Card>

      {/* Preview + submit */}
      {preview && (
        <Card className="p-5 space-y-3">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary">3 · Promoter will receive</h3>
          <div className="rounded-xl bg-success-tint border border-default p-3 text-sm text-fg-primary whitespace-pre-line leading-relaxed">{preview}</div>
          <div className="space-y-1.5">
            {checklist.map(c => (
              <div key={c.label} className={`flex items-center gap-2 text-xs ${c.done ? "text-success" : "text-fg-tertiary"}`}>
                <Icon name={c.done ? "check" : "clipboard"} size={13} /> {c.label}
              </div>
            ))}
          </div>
          <Button fullWidth size="lg" onClick={() => void onSubmit()} disabled={submitting || normalizeE164(promoterPhone) == null}
            leftIcon={submitting ? <Spinner size={16} /> : <Icon name="send" size={16} />}>
            {submitting ? "Sending…" : "Send to promoter"}
          </Button>
          {promoterPhone.trim().length > 0 && normalizeE164(promoterPhone) == null && (
            <p className="text-xs text-error text-center">Enter a valid +91XXXXXXXXXX number.</p>
          )}
        </Card>
      )}
    </div>
  );
}
