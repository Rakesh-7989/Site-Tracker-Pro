// SiteTrack Pro — Sprint 2 (Session 30.9) Photo storage + EXIF + geotag.
//
// Pure-JS pipeline that the DPR composer (Sprint 2 Day 20-22 UI) will
// drive. Separates concerns so the UI is thin:
//
//   1. extractExif(blob)        → { dateTaken, gps, orientation } | null
//   2. validateGeotag({lat,lon}) → { ok, reason? }
//   3. generateThumbnail(blob, maxDim) → Promise<{ blob, width, height }>
//   4. computePhotoSha256(blob)  → hex string (matches voiceTranscribe.hashAudio
//      shape; used as Storage object key + dpr_messages dedup)
//   5. uploadPhoto(blob, opts)   → Promise<{ ok, url, sha256, exif }>
//
// All public functions are env-agnostic (browser + Deno + Node). The
// Storage upload step delegates to an injected adapter so tests don't
// touch Supabase — same pattern as voiceTranscribe.js + buildnowAnchor.js.
//
// See docs/SPRINT_2_ARCHITECTURE.md for where this slots in.

/** Hyderabad rough bounding box. Used to gut-check that a photo's GPS
 *  is from a Hyderabad site (catches a supervisor accidentally taking
 *  a photo at home in a different city). Wide enough to cover GHMC +
 *  HMDA outer ring. */
export const HYDERABAD_BBOX = {
  latMin: 17.20,  // Maheshwaram area, south
  latMax: 17.65,  // Bachupally area, north
  lonMin: 78.20,  // Shamshabad area, west
  lonMax: 78.70,  // Pocharam area, east
};

/** Maximum allowed photo size (bytes) BEFORE compression. Rs 8,000 Androids
 *  commonly produce 8-12 MB JPEGs; we cap at 5 MB and then compress to
 *  WebP before upload, reducing storage to ~1-2 MB per photo. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Target compressed photo quality (0-1). WebP at 0.80 gives ~80% size
 *  reduction vs original JPEG with negligible visual loss. */
export const COMPRESS_QUALITY = 0.80;

/** Default thumbnail max dimension — fits inside a WhatsApp message
 *  thumbnail without re-encoding loss. */
export const DEFAULT_THUMB_MAX_DIM = 640;

// ── EXIF extraction ─────────────────────────────────────────────────────────

/**
 * Parse the EXIF blob from a JPEG. Returns null if not a JPEG, no EXIF,
 * or any parse error (we never throw — caller decides what to do when
 * EXIF is missing).
 *
 * Implementation note: we ship our OWN small EXIF reader instead of
 * pulling exifr or piexifjs as deps. The DPR flow only needs three
 * fields: DateTimeOriginal, GPSLatitude, GPSLongitude. ~120 LoC vs
 * ~80 KB of dep weight.
 *
 * @param {Blob | ArrayBuffer | Uint8Array} input
 * @returns {Promise<{ dateTaken?: string, gps?: {lat: number, lon: number}, orientation?: number } | null>}
 */
export async function extractExif(input) {
  let bytes;
  try {
    if (input instanceof Uint8Array) bytes = input;
    else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
    else if (typeof Blob !== "undefined" && input instanceof Blob) {
      bytes = new Uint8Array(await input.arrayBuffer());
    } else {
      return null;
    }
  } catch {
    return null;
  }

  // Must start with JPEG SOI marker FF D8
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  // Walk segments looking for APP1 (FF E1) with "Exif\0\0" header
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2) return null;

    if (marker === 0xe1) {
      // APP1 — check for Exif header
      const header = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (header === "Exif" && bytes[i + 8] === 0 && bytes[i + 9] === 0) {
        return parseTiff(bytes, i + 10, segLen - 8);
      }
    }
    i += 2 + segLen;
    if (i >= bytes.length) break;
  }
  return null;
}

/** Minimal TIFF/EXIF IFD walker. Returns the 3 fields we care about. */
function parseTiff(bytes, base, len) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset + base, len);
    const byteOrder = view.getUint16(0);
    const little = byteOrder === 0x4949;
    if (!little && byteOrder !== 0x4d4d) return null;
    const u16 = (off) => view.getUint16(off, little);
    const u32 = (off) => view.getUint32(off, little);
    if (u16(2) !== 0x2a) return null;

    const ifd0Offset = u32(4);
    const result = { dateTaken: undefined, gps: undefined, orientation: undefined };

    // Walk IFD0 looking for ExifIFDPointer (0x8769), GPSInfoIFDPointer (0x8825), Orientation (0x0112)
    const numEntries = u16(ifd0Offset);
    let exifPtr = null, gpsPtr = null;
    for (let e = 0; e < numEntries; e++) {
      const entryOff = ifd0Offset + 2 + e * 12;
      const tag = u16(entryOff);
      if (tag === 0x8769) exifPtr = u32(entryOff + 8);
      else if (tag === 0x8825) gpsPtr = u32(entryOff + 8);
      else if (tag === 0x0112) result.orientation = u16(entryOff + 8);
    }

    if (exifPtr) {
      const n = u16(exifPtr);
      for (let e = 0; e < n; e++) {
        const entryOff = exifPtr + 2 + e * 12;
        const tag = u16(entryOff);
        // DateTimeOriginal (0x9003) — 20-byte ASCII
        if (tag === 0x9003) {
          const valOff = u32(entryOff + 8);
          const chars = [];
          for (let k = 0; k < 19; k++) chars.push(String.fromCharCode(bytes[base + valOff + k]));
          result.dateTaken = chars.join("");
        }
      }
    }

    if (gpsPtr) {
      const n = u16(gpsPtr);
      let latRef = "N", lonRef = "E", lat = null, lon = null;
      for (let e = 0; e < n; e++) {
        const entryOff = gpsPtr + 2 + e * 12;
        const tag = u16(entryOff);
        if (tag === 0x0001) latRef = String.fromCharCode(bytes[base + entryOff + 8]);
        else if (tag === 0x0003) lonRef = String.fromCharCode(bytes[base + entryOff + 8]);
        else if (tag === 0x0002 || tag === 0x0004) {
          // Three RATIONAL values = deg, min, sec (each = 8 bytes: num/den u32 + u32)
          const valOff = u32(entryOff + 8);
          const deg = u32(valOff) / u32(valOff + 4);
          const min = u32(valOff + 8) / u32(valOff + 12);
          const sec = u32(valOff + 16) / u32(valOff + 20);
          const decimal = deg + min / 60 + sec / 3600;
          if (tag === 0x0002) lat = decimal;
          else lon = decimal;
        }
      }
      if (lat != null && lon != null) {
        result.gps = {
          lat: latRef === "S" ? -lat : lat,
          lon: lonRef === "W" ? -lon : lon,
        };
      }
    }

    return result;
  } catch {
    return null;
  }
}

// ── Geotag validation ───────────────────────────────────────────────────────

/**
 * Sanity-check a GPS coordinate. Three layers:
 *   1. Numeric + in-range (-90..90 lat, -180..180 lon)
 *   2. Not 0,0 (the GPS dropout signature)
 *   3. Inside Hyderabad bbox (warning, not error — supervisor might
 *      legitimately be at a vendor's office or a project in Vijayawada).
 *
 * @param {{lat: number, lon: number}} gps
 * @returns {{ok: boolean, reason?: string, warning?: string}}
 */
export function validateGeotag(gps) {
  if (!gps || typeof gps.lat !== "number" || typeof gps.lon !== "number") {
    return { ok: false, reason: "Missing lat/lon" };
  }
  const { lat, lon } = gps;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return { ok: false, reason: "Non-numeric coordinates" };
  if (lat < -90 || lat > 90)   return { ok: false, reason: "Latitude out of range" };
  if (lon < -180 || lon > 180) return { ok: false, reason: "Longitude out of range" };
  if (lat === 0 && lon === 0)  return { ok: false, reason: "GPS dropout (0, 0)" };

  if (
    lat < HYDERABAD_BBOX.latMin || lat > HYDERABAD_BBOX.latMax ||
    lon < HYDERABAD_BBOX.lonMin || lon > HYDERABAD_BBOX.lonMax
  ) {
    return {
      ok: true,
      warning: `Geotag outside Hyderabad bbox (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    };
  }
  return { ok: true };
}

// ── Photo compression (JPEG → WebP) ──────────────────────────────────────────

/**
 * Compress a photo to a smaller WebP blob. This is the PRIMARY storage saver:
 * an 8-12 MB phone JPEG typically compresses to 1-2 MB WebP with negligible
 * visual loss, cutting storage consumption by ~80%.
 *
 * Falls back to the original blob when OffscreenCanvas is unavailable (Node/Deno).
 *
 * @param {Blob} blob       Original photo blob (JPEG preferred)
 * @param {number} [quality=COMPRESS_QUALITY]  WebP quality 0-1
 * @returns {Promise<Blob>} Compressed WebP blob (or original passthrough)
 */
export async function compressPhoto(blob, quality = COMPRESS_QUALITY) {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return blob;
  }
  try {
    const src = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(src.width, src.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0);
    const out = await canvas.convertToBlob({ type: "image/webp", quality });
    return out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

// ── Thumbnail generation ────────────────────────────────────────────────────

/**
 * Resize a photo to fit within maxDim x maxDim while preserving aspect ratio.
 * Uses OffscreenCanvas in browser; falls back to a passthrough in Node /
 * Deno (where the consumer is the EF that doesn't need pixel-perfect
 * resizing — they store the original).
 *
 * @param {Blob} blob
 * @param {number} [maxDim=DEFAULT_THUMB_MAX_DIM]
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function generateThumbnail(blob, maxDim = DEFAULT_THUMB_MAX_DIM) {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return { blob, width: 0, height: 0 };
  }
  try {
    const src = await createImageBitmap(blob);
    const ratio = Math.min(maxDim / src.width, maxDim / src.height, 1);
    const w = Math.round(src.width * ratio);
    const h = Math.round(src.height * ratio);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0, w, h);
    const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.70 });
    return { blob: out, width: w, height: h };
  } catch {
    return { blob, width: 0, height: 0 };
  }
}

// ── Hashing (matches voiceTranscribe.hashAudio shape) ───────────────────────

/**
 * Compute the sha256 hex of a photo. Used as the Storage object key + as
 * dpr_messages dedup key (matches the audio_sha256 pattern from
 * voice_transcripts).
 *
 * @param {Blob | ArrayBuffer | Uint8Array} input
 * @returns {Promise<string>}
 */
export async function computePhotoSha256(input) {
  let bytes;
  if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (typeof Blob !== "undefined" && input instanceof Blob) {
    bytes = new Uint8Array(await input.arrayBuffer());
  } else {
    throw new Error("computePhotoSha256: input must be Blob, ArrayBuffer, or Uint8Array");
  }
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("computePhotoSha256: SubtleCrypto unavailable");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Upload (storage adapter pattern) ────────────────────────────────────────

/**
 * Storage adapter contract. The browser uses a Supabase Storage adapter;
 * tests use a mock that captures uploads + returns synthetic URLs.
 *
 * @typedef {Object} StorageAdapter
 * @property {(bucket: string, path: string, blob: Blob) => Promise<{ok: boolean, url?: string, error?: string}>} put
 */

/**
 * Mock storage adapter for tests. Captures all uploads to an in-memory map.
 */
export function makeMockStorageAdapter() {
  const captures = new Map();
  return {
    async put(bucket, path, blob) {
      captures.set(`${bucket}/${path}`, blob);
      return { ok: true, url: `mock://${bucket}/${path}` };
    },
    captures,
  };
}

/**
 * Pipeline a photo through validation → exif → thumbnail → upload. Returns
 * the canonical record the caller persists to dpr_messages.
 *
 * @param {Blob} photo
 * @param {Object} opts
 * @param {string} opts.bucket                - Supabase Storage bucket name
 * @param {string} opts.orgId                  - for path prefix
 * @param {string} [opts.dprId]               - optional client_token for path
 * @param {StorageAdapter} opts.adapter
 * @param {boolean} [opts.requireGeotag=true]
 * @returns {Promise<{
 *   ok: boolean,
 *   sha256?: string,
 *   url?: string,
 *   thumbUrl?: string,
 *   exif?: object,
 *   geotag?: {ok: boolean, reason?: string, warning?: string},
 *   sizeBytes?: number,
 *   error?: string,
 * }>}
 */
export async function uploadPhoto(photo, opts) {
  if (!photo || typeof photo !== "object") return { ok: false, error: "photo blob is required" };
  if (!opts?.bucket || !opts?.orgId || !opts?.adapter) {
    return { ok: false, error: "bucket / orgId / adapter are required" };
  }
  const sizeBytes = photo.size || 0;
  if (sizeBytes > MAX_PHOTO_BYTES) {
    return { ok: false, error: `Photo too large: ${sizeBytes} bytes > ${MAX_PHOTO_BYTES} cap`, sizeBytes };
  }

  const exif = await extractExif(photo);
  const geotag = exif?.gps ? validateGeotag(exif.gps) : { ok: false, reason: "No GPS in EXIF" };
  if (opts.requireGeotag !== false && !geotag.ok) {
    return { ok: false, error: `Geotag rejected: ${geotag.reason}`, geotag, exif, sizeBytes };
  }

  // Compress original JPEG → WebP (~80% size reduction)
  const compressed = await compressPhoto(photo, opts.compressQuality ?? COMPRESS_QUALITY);
  const compressedSize = compressed.size || sizeBytes;
  const sha256 = await computePhotoSha256(compressed);

  const datePath = (exif?.dateTaken || "").slice(0, 10).replace(/:/g, "-") || new Date().toISOString().slice(0, 10);
  const objPath = `${opts.orgId}/${datePath}/${sha256}.webp`;
  const thumbPath = `${opts.orgId}/${datePath}/${sha256}_thumb.webp`;

  const uploadRes = await opts.adapter.put(opts.bucket, objPath, compressed);
  if (!uploadRes.ok) {
    return { ok: false, error: `Upload failed: ${uploadRes.error || "unknown"}`, sha256, exif, geotag };
  }

  let thumbUrl;
  try {
    const thumb = await generateThumbnail(compressed);
    if (thumb.blob && thumb.blob !== compressed) {
      const thumbRes = await opts.adapter.put(opts.bucket, thumbPath, thumb.blob);
      if (thumbRes.ok) thumbUrl = thumbRes.url;
    }
  } catch {
    // Thumbnail is best-effort
  }

  return {
    ok: true,
    sha256,
    url: uploadRes.url,
    thumbUrl,
    exif,
    geotag,
    sizeBytes: compressedSize,
    originalSizeBytes: sizeBytes,
  };
}
