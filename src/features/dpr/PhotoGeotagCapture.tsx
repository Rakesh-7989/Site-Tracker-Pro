// SiteTrack Pro — Sprint 2 DPR photo capture with geotag verification.
//
// The camera + location capture surface a site supervisor uses to attach a
// site photo to a DPR. It:
//   1. lets the device camera take a photo (or pick from gallery),
//   2. reads EXIF GPS (photoStorage.extractExif) for a tamper-proof geotag,
//   3. falls back to device geolocation (navigator.geolocation) when the
//      camera didn't stamp GPS,
//   4. classifies the geotag against the Hyderabad bbox (validateGeotag),
//   5. emits a PhotoGeotagResult the DPRComposer forwards to the submit
//      pipeline (blob is uploaded to `dpr-media`, coords go in the DPR).
//
// Design-token classes only (no raw palette) per the AGENTS.md design system.

import { useCallback, useRef, useState } from "react";
import { Button, Spinner, Icon } from "@/components/ui/atoms";
import { extractExif, validateGeotag } from "@/lib/photoStorage";
import { HYDERABAD_BBOX } from "@/lib/photoStorage";
import { isNativeMobile } from "@/lib/platform";
import { nativeGetPosition, nativeTakePhoto } from "@/lib/native-capabilities";

export interface PhotoGeotagResult {
  blob: Blob;
  previewUrl: string;
  fileName: string;
  lat: number | null;
  lon: number | null;
  withinHyderabad: boolean | null;
  gpsSource: "exif" | "device" | "none";
  takenAt: string | null;
  error?: string;
}

interface PhotoGeotagCaptureProps {
  onCapture: (result: PhotoGeotagResult | null) => void;
  accepted?: string;
  disabled?: boolean;
  /** existing result (after "Compose another") pre-seed */
  initial?: PhotoGeotagResult | null;
}

type CaptureState = "idle" | "processing" | "locating" | "done" | "error";

function withinHyderabad(lat: number | null, lon: number | null): boolean | null {
  if (lat == null || lon == null) return null;
  return lat >= HYDERABAD_BBOX.latMin && lat <= HYDERABAD_BBOX.latMax
    && lon >= HYDERABAD_BBOX.lonMin && lon <= HYDERABAD_BBOX.lonMax;
}

export { withinHyderabad };

export function PhotoGeotagCapture({ onCapture, accepted = "image/*", disabled, initial }: PhotoGeotagCaptureProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<CaptureState>(initial ? "done" : "idle");
  const [result, setResult] = useState<PhotoGeotagResult | null>(initial ?? null);
  const [geoNote, setGeoNote] = useState<ReturnType<typeof validateGeotag> | null>(null);

  const finalize = useCallback(async (blob: Blob, fileName: string, deviceLat?: number, deviceLon?: number) => {
    let lat: number | null = null;
    let lon: number | null = null;
    let gpsSource: PhotoGeotagResult["gpsSource"] = "none";
    let takenAt: string | null = null;

    const exif = await extractExif(blob);
    if (exif?.gps?.lat != null && exif?.gps?.lon != null) {
      lat = exif.gps.lat;
      lon = exif.gps.lon;
      gpsSource = "exif";
      if (exif.dateTaken) takenAt = exif.dateTaken;
    }

    if (lat == null && deviceLat != null && deviceLon != null) {
      lat = deviceLat;
      lon = deviceLon;
      gpsSource = "device";
    }

    const verdict = validateGeotag(
      lat != null && lon != null ? { lat, lon } : null,
    );
    setGeoNote(verdict);

    const previewUrl = URL.createObjectURL(blob);
    const res: PhotoGeotagResult = {
      blob,
      previewUrl,
      fileName,
      lat,
      lon,
      withinHyderabad: withinHyderabad(lat, lon),
      gpsSource,
      takenAt,
    };
    setResult(res);
    setState("done");
    onCapture(res);
  }, [onCapture]);

  /**
   * Shared pipeline for web <input> files AND native-camera captures:
   * EXIF geotag → native GPS fallback → device geolocation → finalize.
   */
  const processFile = useCallback((file: File) => {
    setState("processing");
    setGeoNote(null);

    void (async () => {
      const exif = await extractExif(file);
      if (exif?.gps?.lat != null && exif?.gps?.lon != null) {
        await finalize(file, file.name);
        return;
      }
      // Native GPS first (higher accuracy + system permission flow).
      const nativeGeo = await nativeGetPosition();
      if (nativeGeo) {
        await finalize(file, file.name, nativeGeo.lat, nativeGeo.lon);
        return;
      }
      if (!(typeof navigator !== "undefined" && navigator.geolocation)) {
        await finalize(file, file.name);
        return;
      }
      setState("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => { void finalize(file, file.name, pos.coords.latitude, pos.coords.longitude); },
        () => { void finalize(file, file.name); },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    })().catch(() => {
      setState("error");
      setGeoNote({ ok: false, reason: "photo read failed" });
    });
  }, [finalize]);

  /** Native camera path (Capacitor shell only). */
  const onNativeCamera = useCallback(() => {
    void (async () => {
      setState("processing");
      const blob = await nativeTakePhoto();
      if (!blob) { setState("idle"); return; } // cancelled / permission denied
      processFile(new File([blob], `dpr-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" }));
    })();
  }, [processFile]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }, [processFile]);

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setGeoNote(null);
    onCapture(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onCapture]);

  // ── Idle: capture CTA ──────────────────────────────────────────────────────
  if (state === "idle") {
    const native = isNativeMobile();
    return (
      <div>
        {!native && (
          <input
            ref={inputRef} type="file" accept={accepted} capture="environment"
            className="hidden" onChange={onFile} disabled={disabled}
            data-photo-input
          />
        )}
        <Button size="md" variant="secondary" onClick={() => (native ? onNativeCamera() : inputRef.current?.click())} disabled={disabled} leftIcon={<Icon name="camera" size={16} />}>
          Take site photo
        </Button>
      </div>
    );
  }

  // ── Processing / locating ──────────────────────────────────────────────────
  if (state === "processing" || state === "locating") {
    return (
      <div className="flex items-center gap-2 text-sm text-fg-secondary">
        <Spinner size={16} /> {state === "locating" ? "Verifying location…" : "Processing photo…"}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-error">
          <Icon name="alert" size={14} /> Could not read the photo. Try again.
        </div>
        <Button size="sm" variant="ghost" onClick={reset} leftIcon={<Icon name="camera" size={14} />}>Retake</Button>
      </div>
    );
  }

  // ── Done: preview + geotag summary + actions ──────────────────────────────
  if (!result) return <></>;
  const geoLabel = result.withinHyderabad === true
    ? "Hyderabad ✓"
    : result.withinHyderabad === false
      ? "Outside Hyderabad"
      : "No geotag";

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-default bg-secondary">
        <img src={result.previewUrl} alt="Site photo" className="w-full max-h-64 object-cover" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 border ${
          result.withinHyderabad === true ? "text-success bg-success-tint border-success"
            : result.withinHyderabad === false ? "text-warning bg-warning-tint border-warning"
              : "text-fg-secondary bg-secondary border-default"
        }`}>
          <Icon name={result.withinHyderabad === true ? "check" : "map"} size={12} />
          {geoLabel}
        </span>
        {result.lat != null && result.lon != null && (
          <span className="text-[11px] font-mono text-fg-tertiary">
            {result.lat.toFixed(4)}, {result.lon.toFixed(4)}
          </span>
        )}
        {result.fileName && (
          <span className="text-[11px] text-fg-tertiary max-w-[12rem] truncate">{result.fileName}</span>
        )}
      </div>

      {geoNote && !geoNote.ok && geoNote.reason && (
        <div className="flex items-center gap-2 text-[11px] text-fg-tertiary">
          <Icon name="info" size={12} /> {geoNote.reason}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={reset} leftIcon={<Icon name="image" size={14} />}>Remove</Button>
        <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()} leftIcon={<Icon name="camera" size={14} />}>Retake</Button>
      </div>
    </div>
  );
}