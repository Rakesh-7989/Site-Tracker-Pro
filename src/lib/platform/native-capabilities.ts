/**
 * SiteTrack Pro — native capability bridges (Capacitor) with web fallbacks.
 *
 * Every helper returns `null` / no-ops on the open web so callers keep their
 * existing browser path untouched; the native branch activates only inside
 * the Capacitor shell. All plugin imports are dynamic.
 */

import { isNativeMobile } from "./platform";

export interface NativeGeo {
  lat: number;
  lon: number;
  accuracy: number;
}

/**
 * Native camera capture → Blob (JPEG). Returns null when not native or the
 * user cancelled; callers fall back to their <input type="file"> path.
 */
export async function nativeTakePhoto(): Promise<Blob | null> {
  if (!isNativeMobile()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const check = await Camera.checkPermissions();
    if (check.camera === "denied") return null;
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 80,
      width: 1600,
      correctOrientation: true,
      saveToGallery: false,
    });
    if (!photo.webPath) return null;
    const res = await fetch(photo.webPath);
    return await res.blob();
  } catch {
    return null;
  }
}

/** Native GPS (higher accuracy + system dialog). Null when unavailable. */
export async function nativeGetPosition(): Promise<NativeGeo | null> {
  if (!isNativeMobile()) return null;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch {
    return null;
  }
}

export interface ShareFileRequest {
  fileName: string;
  blob: Blob;
  title: string;
}

/**
 * Native share sheet with a real file attachment (e.g. DPR PDF → WhatsApp).
 * Writes to the cache dir, opens the sheet, then cleans up. Returns false
 * when unsupported/failed so callers can fall back to links/downloads.
 */
export async function nativeShareFile(req: ShareFileRequest): Promise<boolean> {
  if (!isNativeMobile()) return false;
  try {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const base64 = await blobToBase64(req.blob);
    const write = await Filesystem.writeFile({
      path: req.fileName,
      data: base64,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const result = await Share.share({
      title: req.title,
      files: [write.uri],
    });
    void Filesystem.deleteFile({ path: req.fileName, directory: Directory.Cache }).catch(() => {});
    return result.activityType != null || true; // sheet opened (dismiss counts as shared)
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}
