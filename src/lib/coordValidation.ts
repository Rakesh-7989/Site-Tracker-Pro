/// <reference types="vitest" />

// ---------------------------------------------------------------------------
// Coordinate Validation — general bbox and range validation
// Extends the Hyderabad-only check in photoStorage.ts with universal
// latitude/longitude bounds and out-of-range handling.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Latitude/Longitude Bounds (WGS-84 valid range)
// ---------------------------------------------------------------------------
export const COORD_BOUNDS = {
  // WGS-84 valid extreme limits (beyond which coordinates are meaningless)
  latMin: -90,
  latMax: 90,
  lonMin: -180,
  lonMax: 180,

  // Practical "real-world" limits (beyond which we treat as out-of-range
  // rather than simply "valid but extreme")
  latUsableMin: -85,
  latUsableMax: 85,
  lonUsableMin: -175,
  lonUsableMax: 175,

  // Hyderabad-specific bounds (kept for backward compatibility)
  hydLatMin: 17.20,
  hydLatMax: 17.65,
  hydLonMin: 78.20,
  hydLonMax: 78.70,
} as const;

// ---------------------------------------------------------------------------
// Helper: check if a number is finite (not NaN, not Infinity, not -Infinity)
// ---------------------------------------------------------------------------
function isFiniteCoord(v: number): boolean {
  return Number.isFinite(v);
}

// ---------------------------------------------------------------------------
// Public API: validate a single latitude value
// Returns { ok, reason? }
// ---------------------------------------------------------------------------
export function validateLat(lat: number): { ok: boolean; reason?: string } {
  if (!isFiniteCoord(lat)) {
    return { ok: false, reason: "latitude is not a finite number" };
  }
  if (lat < COORD_BOUNDS.latMin || lat > COORD_BOUNDS.latMax) {
    return {
      ok: false,
      reason: `latitude ${lat} out of WGS-84 range [${COORD_BOUNDS.latMin},${COORD_BOUNDS.latMax}]`,
    };
  }
  // Optional: mark unusably extreme as warning rather than reject
  if (lat < COORD_BOUNDS.latUsableMin || lat > COORD_BOUNDS.latUsableMax) {
    // Do NOT reject — just noting. Caller can choose to warn.
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public API: validate a single longitude value
// ---------------------------------------------------------------------------
export function validateLon(lon: number): { ok: boolean; reason?: string } {
  if (!isFiniteCoord(lon)) {
    return { ok: false, reason: "longitude is not a finite number" };
  }
  if (lon < COORD_BOUNDS.lonMin || lon > COORD_BOUNDS.lonMax) {
    return {
      ok: false,
      reason: `longitude ${lon} out of WGS-84 range [${COORD_BOUNDS.lonMin},${COORD_BOUNDS.lonMax}]`,
    };
  }
  if (lon < COORD_BOUNDS.lonUsableMin || lon > COORD_BOUNDS.lonUsableMax) {
    // Usable-range note; not a rejection.
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public API: validate both latitude and longitude
// ---------------------------------------------------------------------------
export function validateCoord(lat: number, lon: number): {
  ok: boolean;
  reasons: string[];
  inHyderabad: boolean;
  usable: boolean;
} {
  const reasons: string[] = [];
  let _inHyderabad = false;
  let usable = true;

  const latResult = validateLat(lat);
  if (!latResult.ok) reasons.push(latResult.reason!);
  else if (lat >= COORD_BOUNDS.hydLatMin && lat <= COORD_BOUNDS.hydLatMax)
    _inHyderabad = true;

  const lonResult = validateLon(lon);
  if (!lonResult.ok) reasons.push(lonResult.reason!);
  else if (lon >= COORD_BOUNDS.hydLonMin && lon <= COORD_BOUNDS.hydLonMax) _inHyderabad = true;

  // Usable check: if either coordinate is outside the "usable" extreme,
  // mark as not ideal (but still valid per WGS-84).
  if (
    lat < COORD_BOUNDS.latUsableMin ||
    lat > COORD_BOUNDS.latUsableMax ||
    lon < COORD_BOUNDS.lonUsableMin ||
    lon > COORD_BOUNDS.lonUsableMax
  ) {
    usable = false;
  }

  return { ok: reasons.length === 0, reasons, inHyderabad: _inHyderabad, usable };
}

// ---------------------------------------------------------------------------
// Public API: validate a bounding box (sw/ne pairs)
// ---------------------------------------------------------------------------
export function validateBbox(
  swLat: number,
  swLon: number,
  neLat: number,
  neLon: number
): {
  ok: boolean;
  reasons: string[];
  valid: boolean; // true if box has positive area within WGS-84
} {
  const reasons: string[] = [];

  // Validate all four corners
  const swLatOk = validateLat(swLat);
  const swLonOk = validateLon(swLon);
  const neLatOk = validateLat(neLat);
  const neLonOk = validateLon(neLon);

  if (!swLatOk.ok) reasons.push(swLatOk.reason!);
  if (!swLonOk.ok) reasons.push(swLonOk.reason!);
  if (!neLatOk.ok) reasons.push(neLatOk.reason!);
  if (!neLonOk.ok) reasons.push(neLonOk.reason!);

  // Box must have positive area: neLat > swLat AND neLon > swLon (accounting
  // for the antimeridian wrap). We keep it simple: just check ordering.
  const positiveArea = neLat > swLat && neLon > swLon;

  const valid = reasons.length === 0 && positiveArea;

  return { ok: valid, reasons, valid };
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------
export type ValidateCoordResult = Awaited<
  ReturnType<typeof validateCoord>
>;
export type ValidateBboxResult = ReturnType<typeof validateBbox>;

// ---------------------------------------------------------------------------
// Quick-compat: rewrite the old Hyderabad-only check so callers can migrate
// ---------------------------------------------------------------------------
// The old function signature was: withinHyderabad(lat: number, lon: number) => boolean
// We keep it as a thin wrapper so existing imports don't break.
export function withinHyderabad(lat: number, lon: number): boolean {
  return (
    lat >= COORD_BOUNDS.hydLatMin &&
    lat <= COORD_BOUNDS.hydLatMax &&
    lon >= COORD_BOUNDS.hydLonMin &&
    lon <= COORD_BOUNDS.hydLonMax
  );
}

// ---------------------------------------------------------------------------
// Quick-compat: old-style validate that returned just boolean
// ---------------------------------------------------------------------------
// Compute inHyderabad using the same logic as withinHyderabad so the
// returned object has a valid value (no longer references a local that
// is out of scope).
export function quickValidate(lat: number, lon: number): { ok: boolean; inHyderabad: boolean } {
  return {
    ok: withinHyderabad(lat, lon),
    inHyderabad: lat >= COORD_BOUNDS.hydLatMin &&
               lat <= COORD_BOUNDS.hydLatMax &&
               lon >= COORD_BOUNDS.hydLonMin &&
               lon <= COORD_BOUNDS.hydLonMax,
  };
}

// ---------------------------------------------------------------------------
// Debug / REPL support
// ---------------------------------------------------------------------------
// Use a module-level flag instead of import.meta.vitest which isn't supported
// by the project's TypeScript configuration.
const __DEBUG__ = false;

if (__DEBUG__) {
  // no-op; keep tree-shakeable
}