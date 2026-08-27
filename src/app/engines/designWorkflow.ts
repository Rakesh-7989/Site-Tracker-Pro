// SiteTrack Pro — architecture design-workflow stage model (v4 Phase E, Opt 1).
// Pure/deterministic: derives the design lifecycle stage from the existing
// `drawings` register (migration 149/150). No external AI, no schema change in
// this layer — the stage is *computed* from drawing type/title/status/revision
// signals so the workflow can be gated (stepper E2) and unit-tested.
//
// Stage ladder (options 1 + 2 agreement from docs/planning/V4_INDUSTRY_PLATFORM_PLAN):
//   requirements → concept → floorplan → elevation → 3d → client_review → approved

export type DesignStageId =
  | "requirements"
  | "concept"
  | "floorplan"
  | "elevation"
  | "3d"
  | "client_review"
  | "approved";

/** Canonical ordered stage list (index = progression). */
export const DESIGN_STAGES: readonly DesignStageId[] = [
  "requirements",
  "concept",
  "floorplan",
  "elevation",
  "3d",
  "client_review",
  "approved",
] as const;

/** Minimal drawing shape the stage model needs (superset-free; nullable-safe). */
export interface DesignWorkflowDrawing {
  id: string;
  title: string;
  type: string;
  revision?: string | null;
  status?: string | null;
  releaseDate?: string | null;
  /** Per-drawing persisted stage (Opt3) — preferred over title/type inference. */
  designStage?: DesignStageId | null;
}

/** Nth index of a stage in DESIGN_STAGES (0-based). Unknown → 0. */
export function designStageIndex(s: DesignStageId): number {
  return DESIGN_STAGES.indexOf(s);
}

/** The stage immediately after `s` (clamped at the tail). */
export function nextStage(s: DesignStageId): DesignStageId {
  const i = designStageIndex(s);
  return DESIGN_STAGES[Math.min(i + 1, DESIGN_STAGES.length - 1)];
}

/** The stage immediately before `s` (clamped at the head). */
export function prevStage(s: DesignStageId): DesignStageId {
  const i = designStageIndex(s);
  return DESIGN_STAGES[Math.max(i - 1, 0)];
}

// ── Stage derivation signal (drawings → stage) ───────────────────────────────

/** Drawing `type` values that anchor a workflow stage (fallback when title silent). */
const TYPE_TO_STAGE: Record<string, DesignStageId> = {
  architectural: "concept",
  structural: "elevation",
  mep: "3d",
  interior: "3d",
};

/** Title keyword anchors (checked first, more specific wins order). */
const TITLE_ANCHORS: ReadonlyArray<{ re: RegExp; stage: DesignStageId }> = [
  { re: /\b(concept|schematic|option)\b/i, stage: "concept" },
  { re: /\b(floor|plan|layout|block)\b/i, stage: "floorplan" },
  { re: /\b(elevation|facade|section)\b/i, stage: "elevation" },
  { re: /\b(3d|3 d|model|render|perspect)\b/i, stage: "3d" },
];

/** A drawing is "released" = it has escaped the internal pipeline (revision established). */
export function isDrawingReleased(d: DesignWorkflowDrawing): boolean {
  return d.status === "current";
}

/**
 * Derive the design-workflow stage a set of drawings has reached.
 * - Any released (current) drawing lifts the floor to `concept`.
 * - The farthest type/title anchor lifts it further up to `3d`.
 * - `approved` requires a released drawing whose title/type signals approval
 *   (issuance board) — i.e. a released drawing that is *not* "in progress".
 */
export function computeDesignStage(drawings: DesignWorkflowDrawing[]): DesignStageId {
  const list = drawings ?? [];
  const released = list.filter(isDrawingReleased);
  if (released.length === 0) return "requirements";

  let reached: DesignStageId = "requirements";
  for (const d of released) {
    const stage = drawingStage(d);
    if (designStageIndex(stage) > designStageIndex(reached)) reached = stage;
    else if (designStageIndex(reached) === 0) reached = "concept";
  }
  return reached;
}

/** Per-drawing stage anchor: persisted designStage wins, else title keyword, else type, else concept. */
export function drawingStage(d: DesignWorkflowDrawing): DesignStageId {
  if (d.designStage && DESIGN_STAGES.includes(d.designStage)) return d.designStage;
  const title = String(d.title ?? "");
  for (const a of TITLE_ANCHORS) {
    if (a.re.test(title)) return a.stage;
  }
  const byType = TYPE_TO_STAGE[String(d.type ?? "").toLowerCase()];
  return byType ?? "concept";
}

/**
 * Heuristic approval check: true when at least one released drawing carries an
 * "issued for approval"/"approved" marker (title keyword) — the signal E2 uses
 * to surface the "Approve design" action.
 */
export function isApprovedSignal(drawings: DesignWorkflowDrawing[]): boolean {
  return (drawings ?? []).some(d => /approv|issued|ifa|ifc|final|reviewed/i.test(String(d.title ?? "")));
}

// ── Stage-derived labels (pure; used by the stepper E2/E3) ───────────────────

/** Short progress description for each stage (no i18n here — display layer maps keys). */
export const DESIGN_STAGE_LABEL: Record<DesignStageId, string> = {
  requirements: "Requirements",
  concept: "Concept",
  floorplan: "Floor plan",
  elevation: "Elevation",
  "3d": "3D",
  client_review: "Client review",
  approved: "Approved",
};

/** Whether a stage has been *reached* given the current model input. */
export function isStageReached(drawings: DesignWorkflowDrawing[], stage: DesignStageId): boolean {
  return designStageIndex(computeDesignStage(drawings)) >= designStageIndex(stage);
}