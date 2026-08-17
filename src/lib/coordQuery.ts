/// <reference types="vitest" />

// ---------------------------------------------------------------------------
// Spatial Query Utilities — distance calculation, point-in-polygon, bbox,
// nearest-point, and bounding-box generation.
// Extends coordValidation/coordFormat with practical spatial queries.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Haversine distance between two lat/lon points ( metres )
// Internal implementation; re-exported as distanceMetres below.
// ---------------------------------------------------------------------------
function haversineDistanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ---------------------------------------------------------------------------
// Public API: distance between two coordinates in metres
// ---------------------------------------------------------------------------
export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineDistanceMetres(lat1, lon1, lat2, lon2);
}

// ---------------------------------------------------------------------------
// Public API: distance between two coordinates, human-readable label
// ---------------------------------------------------------------------------
export function distanceLabel(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const d = distanceMetres(lat1, lon1, lat2, lon2);
  return formatDistanceMetres(d);
}

// ---------------------------------------------------------------------------
// Helper: format metres (reuses coordFormat — ensure it's imported or in-scope)
// We embed a minimal formatter here to avoid cross-module import cycles at
// the type-check stage. If coordFormat is available the caller can use it;
// otherwise this provides a simple inline definition.
// ---------------------------------------------------------------------------
function formatDistanceMetres(metres: number): string {
  if (metres < 0) {
    return `${Math.abs(metres)}m`;
  }
  if (metres < 1000) {
    return `${metres.toFixed(1)}m`;
  }
  return `${(metres / 1000).toFixed(2)}km`;
}

// ---------------------------------------------------------------------------
// Point-in-polygon: check if a coordinate is within the Hyderabad bbox
// Uses the same bounds from coordValidation for consistency.
// ---------------------------------------------------------------------------
export function isInHyderabad(lat: number, lon: number): boolean {
  return lat >= 17.20 && lat <= 17.65 && lon >= 78.20 && lon <= 78.70;
}

// ---------------------------------------------------------------------------
// Bounding box intersection check
// Returns true if two bounding boxes overlap (sw/ne pairs).
// ---------------------------------------------------------------------------
export function bboxIntersects(
  swLat1: number,
  swLon1: number,
  neLat1: number,
  neLon1: number,
  swLat2: number,
  swLon2: number,
  neLat2: number,
  neLon2: number
): boolean {
  // Boxes overlap if neither is completely to the left/right/above/below the other
  const overlapLat = Math.max(swLat1, swLat2) <= Math.min(neLat1, neLat2);
  const overlapLon = Math.max(swLon1, swLon2) <= Math.min(neLon1, neLon2);
  return overlapLat && overlapLon;
}

// ---------------------------------------------------------------------------
// Nearest point from a set of coordinates to a query point
// Returns { point, distanceMetres } or null
// ---------------------------------------------------------------------------
export function nearestPoint(
  queryLat: number,
  queryLon: number,
  candidates: Array<{ lat: number; lon: number }>
): { point: { lat: number; lon: number }; distanceMetres: number } | null {
  if (!candidates || candidates.length === 0) return null;

  let bestDist = Infinity;
  let bestLat = 0;
  let bestLon = 0;

  for (const c of candidates) {
    const d = haversineDistanceMetres(queryLat, queryLon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      bestLat = c.lat;
      bestLon = c.lon;
    }
  }
  return { point: { lat: bestLat, lon: bestLon }, distanceMetres: bestDist };
}

// ---------------------------------------------------------------------------
// Bounding box that encloses a set of points
// Returns { swLat, swLon, neLat, neLon } or null
// ---------------------------------------------------------------------------
export function boundingBoxFromPoints(
  points: Array<{ lat: number; lon: number }>
): { swLat: number; swLon: number; neLat: number; neLon: number } | null {
  if (!points || points.length === 0) return null;

  let swLat = Infinity;
  let swLon = Infinity;
  let neLat = -Infinity;
  let neLon = -Infinity;

  for (const p of points) {
    if (p.lat < swLat) swLat = p.lat;
    if (p.lat > neLat) neLat = p.lat;
    if (p.lon < swLon) swLon = p.lon;
    if (p.lon > neLon) neLon = p.lon;
  }

  return { swLat, swLon, neLat, neLon };
}

// ---------------------------------------------------------------------------
// Exported type only (no value-name clash)
// ---------------------------------------------------------------------------
export type { haversineDistanceMetres };

// ---------------------------------------------------------------------------
// Debug / vitest support
// ---------------------------------------------------------------------------
const __DEBUG__ = false;

if (__DEBUG__) {
  // no-op; keep tree-shakeable
}