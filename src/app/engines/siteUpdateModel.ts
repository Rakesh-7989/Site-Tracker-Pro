/* SiteTrack Pro — Site Update Data Model (v5 Phase 1).
 * Minimal viable inputs from site engineer mobile update.
 * Derived intelligence outputs computed by intelligenceEngine.ts.
 * All fields designed for offline-first mobile capture.
 */

import {
  computeIntelligence,
  type DelayRiskInputs,
  type CostRiskInputs,
  type ProductivityInputs,
} from "./intelligenceEngine";

/** Core update record — what gets stored per 3-tap submission. */
export interface SiteUpdate {
  /** Unique identifier */
  id: string;
  /** Site identifier (e.g. "STP-IND-001") */
  siteId: string;
  /** Project identifier (e.g. "PROJ-2024-01") */
  projectId: string;
  /** Engineer who submitted (UUID or email) */
  engineerId: string;
  /** Date of update (ISO) */
  date: string;
  /** Progress percentage 0-100 */
  progressPercent: number;
  /** Photos captured (uri paths + metadata) */
  photos: PhotoMetadata[];
  /** Labour attendance snapshot */
  labour: LabourSnapshot;
  /** Material stock level snapshot */
  materials: MaterialStock;
  /** Issue tag + note */
  issues: IssueRecord[];
  /** Sync status for offline-first */
  syncStatus: "synced" | "pending" | "error";
  /** When sync was last attempted */
  syncAttemptedAt: string | null;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/** Photo metadata captured on site. */
export interface PhotoMetadata {
  /** Local file URI (after capture) */
  uri: string;
  /** ISO timestamp when photo was taken */
  timestamp: string;
  /** Geotag — optional, may be null if GPS not available */
  geotag: { lat: number; lon: number } | null;
}

/** Labour attendance snapshot — what engineer taps in 3-tap flow. */
export interface LabourSnapshot {
  /** Days present (out of 22 work days/month) */
  present: number;
  /** Days arrived late */
  late: number;
  /** Half-day occurrences */
  halfDay: number;
  /** Overtime hours logged */
  overtimeHours: number;
}

/** Material stock level snapshot. */
export interface MaterialStock {
  /** Units issued today */
  issued: number;
  /** Units received today */
  received: number;
  /** Opening stock at start of day */
  openingStock: number;
  /** Closing stock at end of day */
  closingStock: number;
}

/** Issue tag + optional note. */
export interface IssueRecord {
  /** Code from checklist: SAFETY | QUALITY | MATERIAL | DELAY | NONE */
  code: "SAFETY" | "QUALITY" | "MATERIAL" | "DELAY" | "NONE";
  /** Optional 40-char note */
  note: string | null;
}

/** Derived intelligence outputs — computed by intelligenceEngine. */
export interface DerivedIntelligence {
  /** Delay risk 0-100 */
  delayRisk: number;
  /** Cost overrun risk 0-100 */
  costOverrunRisk: number;
  /** Productivity score 0-100 */
  productivityScore: number;
  /** Efficiency % */
  efficiencyPct: number;
  /** Needs intervention flag */
  needsIntervention: boolean;
}

/** Map a SiteUpdate + intelligence into DerivedIntelligence. */
export function deriveIntelligence(
  update: SiteUpdate,
): DerivedIntelligence {
  // Build delay risk inputs from update data
  const delayInputs: DelayRiskInputs = {
    cumulativeProgress: update.progressPercent,
    midPointPassed: /* computed from project timeline */ false,
    stagnantDays: /* computed from last update delta */ 0,
    labourEfficiency: /* computed from labour */ 85, // placeholder
    materialVariance: /* computed from materials */ 0, // placeholder
    photosPerWeek: /* computed from photos count */ 2, // placeholder
  };

  // Build cost risk inputs from update data
  const costInputs: CostRiskInputs = {
    spentAllocated: /* computed from project budget */ 0.4, // placeholder
    monthsElapsed: /* project months */ 4, // placeholder
    consumptionRate: /* actual vs planned */ 1.0, // placeholder
    wastagePct: /* material wastage */ 0, // placeholder
    overtimeTrend: /* overtime change */ 0, // placeholder
    logGaps: /* days without update */ 0, // placeholder
  };

  // Build productivity inputs from update data
  const productivityInputs: ProductivityInputs = {
    presentDays: update.labour.present,
    lateDays: update.labour.late,
    halfDayCount: update.labour.halfDay,
    overtimeHours: update.labour.overtimeHours,
    milestoneProgress: /* computed from project milestones */ 65, // placeholder
  };

  // Compute all intelligence
  const bundle = computeIntelligence(
    delayInputs,
    costInputs,
    productivityInputs,
  );

  return {
    delayRisk: bundle.delayRisk.delayRisk,
    costOverrunRisk: bundle.costRisk.costOverrunRisk,
    productivityScore: bundle.productivity.productivityScore,
    efficiencyPct: bundle.productivity.efficiencyPct,
    needsIntervention: bundle.productivity.needsIntervention,
  };
}

/** Pre-defined checklist codes for issue tagging. */
export const ISSUE_CODES = [
  "NONE",
  "SAFETY",
  "QUALITY",
  "MATERIAL",
  "DELAY",
] as const;

/** Issue code display labels (bilingual). */
export const ISSUE_CODE_LABELS: Record<
  "NONE" | "SAFETY" | "QUALITY" | "MATERIAL" | "DELAY",
  { en: string; hi: string }
> = {
  NONE: { en: "None", hi: "कोई नहीं" },
  SAFETY: { en: "Safety", hi: "सुरक्षा" },
  QUALITY: { en: "Quality", hi: "गुणवत्ता" },
  MATERIAL: { en: "Material", hi: "मटेरियल" },
  DELAY: { en: "Delay", hi: "देरी" },
};

/** Default site update — used as template for new updates. */
export const DEFAULT_SITE_UPDATE: SiteUpdate = {
  id: "",
  siteId: "",
  projectId: "",
  engineerId: "",
  date: new Date().toISOString().slice(0, 10),
  progressPercent: 0,
  photos: [],
  labour: { present: 0, late: 0, halfDay: 0, overtimeHours: 0 },
  materials: { issued: 0, received: 0, openingStock: 0, closingStock: 0 },
  issues: [{ code: "NONE", note: null }],
  syncStatus: "pending",
  syncAttemptedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};