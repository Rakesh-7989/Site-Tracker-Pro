// SiteTrack Pro — optimistic-concurrency (versioned update) support.
//
// Migration 238 gives important records a trigger-forced monotonic `version`
// (+ `updated_at`). Query-layer writers pass the version they READ; the
// update adds `.eq("version", expectedVersion)` so a concurrent writer
// between read and write makes the statement match 0 rows — surfaced here as
// a typed conflict instead of a silent overwrite.
//
// Reference consumers: setTaskStatus / setIssueResolved / setMilestoneStatus
// (+ their tabs). Financial tables (invoices/ra_bills/payments) are guarded
// at the DB layer today (approval RPCs + no direct UPDATE policy); their
// server-side writes bump versions automatically for future native/mobile
// writers.

export interface VersionedUpdateOptions {
  /** Version observed at read time. When provided, the write is conditional. */
  expectedVersion?: number;
}

export const VERSION_CONFLICT_ERROR =
  "This record changed while you were away. Refresh and try again.";

export type VersionedOutcome =
  | { ok: true; data: { ok: true } }
  | { ok: false; error: string; conflict?: boolean };

/**
 * Interpret the result of an optional-guard `.update()` chain.
 * - builder error → plain failure
 * - guard active AND zero rows back → CONFLICT (stale expectedVersion or row
 *   gone); without a guard, zero rows keeps the legacy success semantics.
 */
export function versionedUpdateOutcome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: { data: any; error: { message?: string } | null },
  expectedVersion?: number,
): VersionedOutcome {
  if (res?.error) {
    return { ok: false, error: String(res.error.message ?? res.error), conflict: false };
  }
  if (expectedVersion != null && (!Array.isArray(res?.data) || res.data.length === 0)) {
    return { ok: false, error: VERSION_CONFLICT_ERROR, conflict: true };
  }
  return { ok: true, data: { ok: true } };
}
