// SiteTrack Pro — DPR draft state machine + preview tests (Phase 7).

import { describe, it, expect } from "vitest";
import {
  EMPTY_DRAFT,
  dprReducer,
  canSubmit,
  meetsQualityBar,
  draftChecklist,
} from "@/features/dpr/dprDraft";
import { previewDigest } from "@/features/dpr/digestPreview";
import { dashboardForRole } from "@/features/dashboards/dashboardForRole";

describe("dprReducer", () => {
  it("sets language", () => {
    const s = dprReducer(EMPTY_DRAFT, { type: "set-language", language: "hi" });
    expect(s.language).toBe("hi");
  });

  it("voice lifecycle: start → done", () => {
    let s = dprReducer(EMPTY_DRAFT, { type: "voice-start" });
    expect(s.voice.status).toBe("transcribing");
    s = dprReducer(s, { type: "voice-done", transcript: "slab pour ayindi", confidence: 0.92, provider: "mock" });
    expect(s.voice.status).toBe("done");
    expect(s.voice.transcript).toBe("slab pour ayindi");
    expect(s.voice.confidence).toBe(0.92);
  });

  it("voice error", () => {
    const s = dprReducer({ ...EMPTY_DRAFT, voice: { ...EMPTY_DRAFT.voice, status: "transcribing" } }, { type: "voice-error", error: "boom" });
    expect(s.voice.status).toBe("error");
    expect(s.voice.error).toBe("boom");
  });

  it("photo add with geo", () => {
    const s = dprReducer(EMPTY_DRAFT, { type: "photo-add", fileName: "site.jpg", lat: 17.41, lon: 78.43, withinHyderabad: true });
    expect(s.photo.status).toBe("added");
    expect(s.photo.withinHyderabad).toBe(true);
  });

  it("reset keeps language", () => {
    let s = dprReducer(EMPTY_DRAFT, { type: "set-language", language: "en" });
    s = dprReducer(s, { type: "voice-done", transcript: "x", confidence: 0.9, provider: "mock" });
    s = dprReducer(s, { type: "reset" });
    expect(s.language).toBe("en");
    expect(s.voice.status).toBe("idle");
  });
});

describe("canSubmit", () => {
  it("false until a non-empty transcript exists", () => {
    expect(canSubmit(EMPTY_DRAFT)).toBe(false);
    const done = dprReducer(EMPTY_DRAFT, { type: "voice-done", transcript: "  ", confidence: 0.9, provider: "mock" });
    expect(canSubmit(done)).toBe(false);   // whitespace-only
    const real = dprReducer(EMPTY_DRAFT, { type: "voice-done", transcript: "slab done", confidence: 0.9, provider: "mock" });
    expect(canSubmit(real)).toBe(true);
  });
});

describe("meetsQualityBar", () => {
  it("null before transcription", () => {
    expect(meetsQualityBar(EMPTY_DRAFT)).toBeNull();
  });
  it("true at/above 0.85, false below", () => {
    const good = dprReducer(EMPTY_DRAFT, { type: "voice-done", transcript: "x", confidence: 0.9, provider: "mock" });
    expect(meetsQualityBar(good)).toBe(true);
    const low = dprReducer(EMPTY_DRAFT, { type: "voice-done", transcript: "x", confidence: 0.7, provider: "mock" });
    expect(meetsQualityBar(low)).toBe(false);
  });
});

describe("draftChecklist", () => {
  it("reflects voice + photo + geo state", () => {
    let s = dprReducer(EMPTY_DRAFT, { type: "voice-done", transcript: "x", confidence: 0.9, provider: "mock" });
    s = dprReducer(s, { type: "photo-add", fileName: "p.jpg", lat: 17.41, lon: 78.43, withinHyderabad: true });
    const checks = draftChecklist(s);
    expect(checks.every(c => c.done)).toBe(true);
  });
});

describe("previewDigest", () => {
  it("renders a Telugu preview with transcript + photo line", () => {
    const text = previewDigest({
      projectName: "Vasavi Vista", date: "2026-06-15", language: "te",
      transcript: "slab pour ayindi", promoterName: "Sharma garu",
      hasPhoto: true, geoVerified: true,
    });
    expect(text).toContain("Namaskaram, Sharma garu");
    expect(text).toContain("Vasavi Vista");
    expect(text).toContain("slab pour ayindi");
    expect(text).toMatch(/Hyderabad/);
  });

  it("english variant omits photo line when no photo", () => {
    const text = previewDigest({
      projectName: "X", date: "2026-06-15", language: "en",
      transcript: "done", hasPhoto: false, geoVerified: false,
    });
    expect(text).toContain("Good morning");
    expect(text).not.toContain("📷");
  });
});

describe("dashboardForRole", () => {
  it("maps the special roles", () => {
    expect(dashboardForRole("promoter")).toBe("promoter");
    expect(dashboardForRole("site_engineer")).toBe("field");   // absorbed site_supervisor
    expect(dashboardForRole("client")).toBe("client");
  });
  it("everything else → default", () => {
    expect(dashboardForRole("pm")).toBe("default");
    expect(dashboardForRole("architect")).toBe("default");
    expect(dashboardForRole("superadmin")).toBe("default");
  });
});
