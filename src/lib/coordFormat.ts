/// <reference types="vitest" />

// ---------------------------------------------------------------------------
// Coordinate Formatting — DMS conversion, compass, distance, compact display
// Extends the raw coordinate utils with human-readable display utilities.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Degree-to-DMS conversion
// Returns { degrees, minutes, seconds, hemisphere }
// ---------------------------------------------------------------------------
function toDms(deg: number, hemisphere: string): {
  degrees: number;
  minutes: number;
  seconds: number;
  hemisphere: string;
} {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 100) / 100; // 2 decimal places

  return { degrees: d, minutes: m, seconds: s, hemisphere };
}

// ---------------------------------------------------------------------------
// Public API: format a latitude as DMS string
// ---------------------------------------------------------------------------
export function formatLatDms(lat: number): string {
  const { degrees, minutes, seconds, hemisphere } = toDms(lat, lat >= 0 ? "N" : "S");
  if (seconds === 0) {
    return `${degrees}°${minutes}' ${hemisphere}`;
  }
  return `${degrees}°${minutes}'${seconds.toFixed(2)}" ${hemisphere}`;
}

// ---------------------------------------------------------------------------
// Public API: format a longitude as DMS string
// ---------------------------------------------------------------------------
export function formatLonDms(lon: number): string {
  const { degrees, minutes, seconds, hemisphere } = toDms(lon, lon >= 0 ? "E" : "W");
  if (seconds === 0) {
    return `${degrees}°${minutes}' ${hemisphere}`;
  }
  return `${degrees}°${minutes}'${seconds.toFixed(2)}" ${hemisphere}`;
}

// ---------------------------------------------------------------------------
// Public API: format both lat/lon as DMS pair
// ---------------------------------------------------------------------------
export function formatCoordDms(lat: number, lon: number): string {
  return `${formatLatDms(lat)}, ${formatLonDms(lon)}`;
}

// ---------------------------------------------------------------------------
// Compass direction from azimuth (0=N, 90=E, 180=S, 270=W)
// Returns N, NE, E, SE, S, SW, W, NW or cardinal abbreviation
// ---------------------------------------------------------------------------
export function compassDirection(azimuth: number): string {
  // Normalize to 0–360
  const a = ((azimuth % 360) + 360) % 360;

  // 8-point compass with 22.5° sectors
  const sectors: [number, string][] = [
    [0, "N"],
    [22.5, "NNE"],
    [45, "NE"],
    [67.5, "ENE"],
    [90, "E"],
    [112.5, "ESE"],
    [135, "SE"],
    [157.5, "SSE"],
    [180, "S"],
    [202.5, "SSW"],
    [225, "SW"],
    [247.5, "WSW"],
    [270, "W"],
    [292.5, "WNW"],
    [315, "NW"],
    [337.5, "NNW"],
  ];

  // Find the sector containing 'a'
  let dir = "N";
  for (const [bound, name] of sectors) {
    if (a < bound) {
      dir = name;
      break;
    }
    dir = name;
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Public API: format an azimuth as compass direction
// ---------------------------------------------------------------------------
export function formatAzimuth(azimuth: number): string {
  return compassDirection(azimuth);
}

// ---------------------------------------------------------------------------
// Distance formatting
// Formats a distance in metres with appropriate unit (m / km) and 2-decimal precision
// ---------------------------------------------------------------------------
export function formatDistanceMetres(metres: number): string {
  if (metres < 0) {
    return `${Math.abs(metres)}m`;
  }
  if (metres < 1000) {
    return `${metres.toFixed(1)}m`;
  }
  return `${(metres / 1000).toFixed(2)}km`;
}

// ---------------------------------------------------------------------------
// Public API: format a distance with a human-readable label
// ---------------------------------------------------------------------------
export function formatDistanceLabel(metres: number): string {
  const unit = formatDistanceMetres(metres);
  return `${metres} metres ${unit}`;
}

// ---------------------------------------------------------------------------
// Compact coordinate display: "17.345, 78.123" → "17.35, 78.12" (5 sig figs)
// ---------------------------------------------------------------------------
export function formatCoordCompact(lat: number, lon: number): string {
  const latStr = lat.toFixed(5);
  const lonStr = lon.toFixed(5);
  return `${latStr}, ${lonStr}`;
}

// ---------------------------------------------------------------------------
// Degree-to-radian and radian-to-degree (shared with math utils)
// ---------------------------------------------------------------------------
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API symmetry with toRadians (re-exported below)
function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Mercator projection (lite): X and Y from lat/lon
// Used for lightweight screen-space positioning without a full CRS.
// ---------------------------------------------------------------------------
export function mercatorX(lon: number): number {
  return toRadians(lon);
}

export function mercatorY(lat: number): number {
  // Mercator: y = ln(tan(π/4 + φ/2))
  // Clamp lat to avoid tan(±π/2) overflow
  const phi = Math.max(Math.min(lat, 89.9), -89.9);
  return Math.log(Math.tan((Math.PI / 4) + (toRadians(phi) / 2)));
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------
export type { toRadians, toDegrees };

// ---------------------------------------------------------------------------
// Debug / vitest support
// ---------------------------------------------------------------------------
// use a module-level flag instead of import.meta.vitest which isn't supported
// by the project's TypeScript configuration.
const __DEBUG__ = false;

if (__DEBUG__) {
  // no-op; keep tree-shakeable
}