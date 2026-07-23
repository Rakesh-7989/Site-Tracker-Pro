export const HYDERABAD_BBOX = {
  latMin: 17.20,
  latMax: 17.65,
  lonMin: 78.20,
  lonMax: 78.70,
};

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const COMPRESS_QUALITY = 0.80;
export const DEFAULT_THUMB_MAX_DIM = 640;

interface ExifResult {
  dateTaken?: string;
  gps?: { lat: number; lon: number };
  orientation?: number;
}

interface GeotagResult {
  ok: boolean;
  reason?: string;
  warning?: string;
}

interface UploadOpts {
  bucket: string;
  orgId: string;
  adapter: StorageAdapter;
  requireGeotag?: boolean;
  compressQuality?: number;
}

interface UploadResult {
  ok: boolean;
  sha256?: string;
  url?: string;
  thumbUrl?: string;
  exif?: ExifResult | null;
  geotag?: GeotagResult;
  sizeBytes?: number;
  originalSizeBytes?: number;
  error?: string;
}

interface StorageAdapter {
  put: (bucket: string, path: string, blob: Blob) => Promise<{ ok: boolean; url?: string; error?: string }>;
}

export async function extractExif(input: Blob | ArrayBuffer | Uint8Array): Promise<ExifResult | null> {
  let bytes: Uint8Array | null = null;
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

  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2) return null;

    if (marker === 0xe1) {
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

function parseTiff(bytes: Uint8Array, base: number, len: number): ExifResult | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset + base, len);
    const byteOrder = view.getUint16(0);
    const little = byteOrder === 0x4949;
    if (!little && byteOrder !== 0x4d4d) return null;
    const u16 = (off: number) => view.getUint16(off, little);
    const u32 = (off: number) => view.getUint32(off, little);
    if (u16(2) !== 0x2a) return null;

    const ifd0Offset = u32(4);
    const result: ExifResult = {};

    const numEntries = u16(ifd0Offset);
    let exifPtr: number | null = null, gpsPtr: number | null = null;
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
        if (tag === 0x9003) {
          const valOff = u32(entryOff + 8);
          const chars: string[] = [];
          for (let k = 0; k < 19; k++) chars.push(String.fromCharCode(bytes[base + valOff + k]));
          result.dateTaken = chars.join("");
        }
      }
    }

    if (gpsPtr) {
      const n = u16(gpsPtr);
      let latRef = "N", lonRef = "E", lat: number | null = null, lon: number | null = null;
      for (let e = 0; e < n; e++) {
        const entryOff = gpsPtr + 2 + e * 12;
        const tag = u16(entryOff);
        if (tag === 0x0001) latRef = String.fromCharCode(bytes[base + entryOff + 8]);
        else if (tag === 0x0003) lonRef = String.fromCharCode(bytes[base + entryOff + 8]);
        else if (tag === 0x0002 || tag === 0x0004) {
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

export function validateGeotag(gps: { lat: number; lon: number } | null | undefined): GeotagResult {
  if (!gps || typeof gps.lat !== "number" || typeof gps.lon !== "number") {
    return { ok: false, reason: "Missing lat/lon" };
  }
  const { lat, lon } = gps;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return { ok: false, reason: "Non-numeric coordinates" };
  if (lat < -90 || lat > 90) return { ok: false, reason: "Latitude out of range" };
  if (lon < -180 || lon > 180) return { ok: false, reason: "Longitude out of range" };
  if (lat === 0 && lon === 0) return { ok: false, reason: "GPS dropout (0, 0)" };

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

export async function compressPhoto(blob: Blob, quality = COMPRESS_QUALITY): Promise<Blob> {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return blob;
  }
  try {
    const src = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(src.width, src.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(src, 0, 0);
    const out = await canvas.convertToBlob({ type: "image/webp", quality });
    return out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

export async function generateThumbnail(blob: Blob, maxDim = DEFAULT_THUMB_MAX_DIM): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return { blob, width: 0, height: 0 };
  }
  try {
    const src = await createImageBitmap(blob);
    const ratio = Math.min(maxDim / src.width, maxDim / src.height, 1);
    const w = Math.round(src.width * ratio);
    const h = Math.round(src.height * ratio);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(src, 0, 0, w, h);
    const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.70 });
    return { blob: out, width: w, height: h };
  } catch {
    return { blob, width: 0, height: 0 };
  }
}

export async function computePhotoSha256(input: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  let bytes: Uint8Array;
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
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function makeMockStorageAdapter() {
  const captures = new Map<string, Blob>();
  return {
    async put(bucket: string, path: string, blob: Blob) {
      captures.set(`${bucket}/${path}`, blob);
      return { ok: true, url: `mock://${bucket}/${path}` };
    },
    captures,
  };
}

export async function uploadPhoto(photo: Blob, opts: UploadOpts): Promise<UploadResult> {
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

  let thumbUrl: string | undefined;
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
