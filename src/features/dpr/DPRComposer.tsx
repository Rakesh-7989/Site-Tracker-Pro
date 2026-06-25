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
import { FormField, Select, Textarea } from "@/components/ui/forms";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { HYDERABAD_BBOX } from "../../lib/photoStorage.js";
import {
  dprReducer, EMPTY_DRAFT, canSubmit, meetsQualityBar, draftChecklist,
  type DprLanguage,
} from "./dprDraft";
import { previewDigest } from "./digestPreview";
import { VoiceNoteRecorder, type VoiceRecordingResult } from "./VoiceNoteRecorder";

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

function withinHyderabad(lat: number, lon: number): boolean {
  return lat >= HYDERABAD_BBOX.latMin && lat <= HYDERABAD_BBOX.latMax
    && lon >= HYDERABAD_BBOX.lonMin && lon <= HYDERABAD_BBOX.lonMax;
}

export function DPRComposer(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canSubmitDpr = useCan("dpr:submit");
  const [draft, dispatch] = useReducer(dprReducer, EMPTY_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  // ── Voice: transcribe via the real lib ──
  const onRecorded = useCallback((result: VoiceRecordingResult) => {
    setRecordedBlob(result.blob);
  }, []);

  const onTranscribe = useCallback(async () => {
    if (!recordedBlob) return;
    dispatch({ type: "voice-start" });
    setTranscribing(true);
    try {
      const mod = await import("../../lib/voiceTranscribe.js");
      const res = await (mod as any).transcribe(recordedBlob, { lang: draft.language, provider: "mock", transport: "mock" });
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

  // ── Photo: pick a file, then verify location via device GPS ──
  const onPhoto = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    dispatch({ type: "photo-add", fileName: file.name });
    // Verify geo via device geolocation (on-site = site coords).
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setGeoBusy(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          setGeoBusy(false);
          const { latitude, longitude } = pos.coords;
          dispatch({ type: "photo-add", fileName: file.name, lat: latitude, lon: longitude, withinHyderabad: withinHyderabad(latitude, longitude) });
        },
        () => { setGeoBusy(false); /* permission denied → photo stays geo-unknown */ },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, []);

  const onSubmit = useCallback(() => {
    // Real send wires to whatsapp_dpr_send EF once WhatsApp is keyed. For
    // now we mark submitted so the demo shows the full round trip.
    setSubmitted(true);
  }, []);

  if (!session) return <></>;

  if (!canSubmitDpr) {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center">
        <Icon name="lock" size={24} className="mx-auto text-ink-400 mb-2" />
        <div className="text-sm text-ink-600">Your role can't submit daily progress reports.</div>
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

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto">
        <Card className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-3"><Icon name="check" size={24} /></div>
          <h2 className="font-display text-lg font-bold text-ink-900">DPR submitted</h2>
          <p className="text-sm text-ink-500 mt-1">The promoter will receive the WhatsApp digest at 7am.</p>
          <Button className="mt-4" variant="secondary" size="md" onClick={() => { setSubmitted(false); dispatch({ type: "reset" }); }}>
            Compose another
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink-900">Daily Progress Report</h1>
          <p className="text-sm text-ink-500 mt-0.5">Speak your update, add a site photo, send to the promoter.</p>
        </div>
        <Link to="/dpr/history" className="text-xs font-semibold text-safety-600 hover:text-safety-700 whitespace-nowrap">View history</Link>
      </div>

      {/* Language */}
      <Card className="p-5">
        <FormField label="Report language" htmlFor="dpr-lang">
          <Select id="dpr-lang" value={draft.language} options={LANG_OPTIONS}
            onChange={e => dispatch({ type: "set-language", language: e.target.value as DprLanguage })} />
        </FormField>
      </Card>

      {/* Voice */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400">1 · Voice note</h3>
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
          <div className="flex items-center gap-2 text-sm text-ink-500"><Spinner size={16} /> Transcribing…</div>
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
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400">2 · Site photo</h3>
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto}
          className="block w-full text-sm text-ink-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cream-200 file:text-ink-700 file:text-sm file:font-semibold" />
        {draft.photo.status === "added" && (
          <div className="text-xs text-ink-500 flex items-center gap-2 flex-wrap">
            <Icon name="image" size={13} /> {draft.photo.fileName}
            {geoBusy && <span className="inline-flex items-center gap-1"><Spinner size={11} /> verifying location…</span>}
            {draft.photo.withinHyderabad === true && <Badge tone="success">Hyderabad ✓</Badge>}
            {draft.photo.withinHyderabad === false && <Badge tone="warning">Outside Hyderabad</Badge>}
          </div>
        )}
      </Card>

      {/* Preview + submit */}
      {preview && (
        <Card className="p-5 space-y-3">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400">3 · Promoter will receive</h3>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-ink-800 whitespace-pre-line leading-relaxed">{preview}</div>
          <div className="space-y-1.5">
            {checklist.map(c => (
              <div key={c.label} className={`flex items-center gap-2 text-xs ${c.done ? "text-emerald-700" : "text-ink-400"}`}>
                <Icon name={c.done ? "check" : "clipboard"} size={13} /> {c.label}
              </div>
            ))}
          </div>
          <Button fullWidth size="lg" onClick={onSubmit} leftIcon={<Icon name="send" size={16} />}>Send to promoter</Button>
        </Card>
      )}
    </div>
  );
}
