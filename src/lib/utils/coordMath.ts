/// <reference types="vitest" />

// ---------------------------------------------------------------------------
// Coordinate Mathematics — degrees/radians conversions, mercator projection-lite
// Dependency-free pure math utilities (no DOM, no external proj dependency).
// Intended for screen-space positioning, lightweight geo calculations,
// and as building blocks for higher-level spatial features.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Degree <-> Radian conversions
// ---------------------------------------------------------------------------
export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Mercator projection (lite)
// Project lat/lon → screen X, Y in a Web-Mercator fashion, suitable for
// canvas/SVG positioning without a full CRS. Results are in "radians of
// longitude" and "log-tan radians of latitude" units; callers scale/pixel-map
// as needed.
// ---------------------------------------------------------------------------
export function mercatorX(lon: number): number {
  return toRadians(lon);
}

export function mercatorY(lat: number): number {
  // y = ln(tan(π/4 + φ/2)), φ in radians
  // Clamp to avoid tan(±π/2) overflow
  const phi = Math.max(Math.min(lat, 89.9), -89.9);
  return Math.log(Math.tan((Math.PI / 4) + (toRadians(phi) / 2)));
}

// ---------------------------------------------------------------------------
// Inverse mercator: screen Y → lat (approximate)
// Useful when you have pixel Y and want to recover latitude.
// ---------------------------------------------------------------------------
export function inverseMercatorY(y: number): number {
  // y = ln(tan(π/4 + φ/2)) → tanh(y) = tan(π/4 + φ/2)
  // φ = 2 * atan(e^y) - π/4
  const val = Math.exp(y);
  return toDegrees(2 * Math.atan(val) - Math.PI / 4);
}

// ---------------------------------------------------------------------------
// Web-Mercator bbox from lat/lon pair (returns min/max X, Y in radians)
// Useful for initializing a map viewport or screen-space rect.
// ---------------------------------------------------------------------------
export function mercatorBbox(lat: number, lon: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  // Web mercator treats the world as a square; the bbox is degenerate for a
  // single point but we return a small offset rect for viewport init.
  const halfDeg = 0.1; // ~11km at equator, enough for a "zoom to point" rect
  return {
    minX: toRadians(lon - halfDeg),
    minY: mercatorY(lat - halfDeg),
    maxX: toRadians(lon + halfDeg),
    maxY: mercatorY(lat + halfDeg),
  };
}

// ---------------------------------------------------------------------------
// Distance in metres using a flat-Earth approximation (sufficient for short
// distances < 50km, much cheaper than Haversine).
// ---------------------------------------------------------------------------
export function flatEarthDistanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const φ1 = (lat1 * Math.PI) / 180;

  const a = Math.sqrt(
    Δφ * Δφ +
    Math.cos(φ1) * Math.cos(φ1) * Δλ * Δλ
  );
  return R * a;
}

// ---------------------------------------------------------------------------
// Debug / vitest support
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
const __DEBUG__ = false;

if (__DEBUG__) {
  // no-op; keep tree-shakeable
}