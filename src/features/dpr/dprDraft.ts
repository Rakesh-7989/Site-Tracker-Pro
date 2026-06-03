// SiteTrack Pro — DPR draft state machine (Phase 7, pure + testable).
//
// Models the Sprint 2 Daily Progress Report compose flow without any
// React: language → voice transcript → photo → ready-to-send. The
// DPRComposer renders this; tests drive it directly.

export type DprLanguage = "te" | "hi" | "en";

export interface VoiceState {
  status: "idle" | "transcribing" | "done" | "error";
  transcript: string | null;
  confidence: number | null;     // 0..1
  provider: string | null;
  error: string | null;
}

export interface PhotoState {
  status: "none" | "added";
  fileName: string | null;
  lat: number | null;
  lon: number | null;
  withinHyderabad: boolean | null;   // null = no geo
}

export interface DprDraft {
  language: DprLanguage;
  voice: VoiceState;
  photo: PhotoState;
}

export const EMPTY_DRAFT: DprDraft = {
  language: "te",
  voice: { status: "idle", transcript: null, confidence: null, provider: null, error: null },
  photo: { status: "none", fileName: null, lat: null, lon: null, withinHyderabad: null },
};

// ── Actions ─────────────────────────────────────────────────────────────────
export type DprAction =
  | { type: "set-language"; language: DprLanguage }
  | { type: "voice-start" }
  | { type: "voice-done"; transcript: string; confidence: number; provider: string }
  | { type: "voice-error"; error: string }
  | { type: "photo-add"; fileName: string; lat?: number; lon?: number; withinHyderabad?: boolean }
  | { type: "photo-clear" }
  | { type: "reset" };

export function dprReducer(state: DprDraft, action: DprAction): DprDraft {
  switch (action.type) {
    case "set-language":
      return { ...state, language: action.language };
    case "voice-start":
      return { ...state, voice: { status: "transcribing", transcript: null, confidence: null, provider: null, error: null } };
    case "voice-done":
      return {
        ...state,
        voice: { status: "done", transcript: action.transcript, confidence: action.confidence, provider: action.provider, error: null },
      };
    case "voice-error":
      return { ...state, voice: { ...state.voice, status: "error", error: action.error } };
    case "photo-add":
      return {
        ...state,
        photo: {
          status: "added",
          fileName: action.fileName,
          lat: action.lat ?? null,
          lon: action.lon ?? null,
          withinHyderabad: action.withinHyderabad ?? null,
        },
      };
    case "photo-clear":
      return { ...state, photo: { ...EMPTY_DRAFT.photo } };
    case "reset":
      return { ...EMPTY_DRAFT, language: state.language };
    default:
      return state;
  }
}

// ── Derived ─────────────────────────────────────────────────────────────────

/** A DPR is submittable once it has a non-empty transcript. */
export function canSubmit(draft: DprDraft): boolean {
  return draft.voice.status === "done" && Boolean(draft.voice.transcript && draft.voice.transcript.trim().length > 0);
}

/** The Sprint 2 accuracy bar — confidence >= 0.85 (matches voiceTranscribe.meetsAccuracyBar). */
export function meetsQualityBar(draft: DprDraft, threshold = 0.85): boolean | null {
  if (draft.voice.status !== "done" || draft.voice.confidence == null) return null;
  return draft.voice.confidence >= threshold;
}

/** Human-readable completeness for the compose checklist. */
export function draftChecklist(draft: DprDraft): Array<{ label: string; done: boolean }> {
  return [
    { label: "Voice note transcribed", done: draft.voice.status === "done" },
    { label: "Site photo added", done: draft.photo.status === "added" },
    { label: "Geotag verified (Hyderabad)", done: draft.photo.withinHyderabad === true },
  ];
}
