import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { getClient } from "@/lib/supabase";
import { enqueue, queueDepth } from "@/lib/offlineQueue";
import { useAuth } from "@/auth/AuthContext";
import { useT } from "@/i18n";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/forms";
import { listProjectsForOrg, type ProjectRow } from "@/features/projects/projectQueries";
import {
  buildDprPayload,
  invokeSendDpr,
  uploadDprMedia,
  type DprLanguageId,
} from "./dprSubmit";

interface GeoFix {
  lat: number;
  lon: number;
}

export function DPRComposerPage() {
  const { session } = useAuth();
  const t = useT();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState("");
  const [phone, setPhone] = useState("+91");
  const [language, setLanguage] = useState<DprLanguageId>("te");
  const [transcript, setTranscript] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [geo, setGeo] = useState<GeoFix | null>(null);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      queueDepth()
        .then((n) => {
          if (alive) setPendingCount(n);
        })
        .catch(() => void 0);
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    listProjectsForOrg(session)
      .then((rows) => {
        if (alive) setProjects(rows);
      })
      .catch(() => void 0);
    return () => {
      alive = false;
    };
  }, [session]);

  function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGeo({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () => void 0,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        setVoice(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
        for (const t of stream.getTracks()) t.stop();
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone permission denied");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setQueuedNotice(null);
    if (!session?.activeOrgId) {
      setError("No active organization");
      return;
    }
    setBusy(true);
    try {
      const payload = buildDprPayload({
        orgId: session.activeOrgId,
        projectId: projectId || null,
        supervisorUserId: session.user.id,
        promoterPhone: phone,
        language,
        transcript,
        photoLat: geo?.lat ?? null,
        photoLon: geo?.lon ?? null,
        photoTakenAt: photo ? new Date().toISOString() : null,
      });

      const online =
        typeof navigator === "undefined" ? true : navigator.onLine !== false;

      if (!online) {
        await enqueue({ key: payload.client_token, kind: "dpr", payload });
        setQueuedNotice(t("dpr.queuedOffline"));
        resetForm();
        return;
      }

      let body = payload;
      try {
        const refs = await uploadDprMedia(getClient(), session.activeOrgId, {
          photo: photo ?? undefined,
          voice: voice ?? undefined,
        });
        body = { ...payload, ...refs };
      } catch (mediaErr) {
        await enqueue({ key: payload.client_token, kind: "dpr", payload });
        setQueuedNotice(
          t("dpr.mediaQueued", {
            reason: mediaErr instanceof Error ? mediaErr.message : "unknown",
          }),
        );
        resetForm();
        return;
      }

      const res = await invokeSendDpr(getClient(), body);
      if (res.ok) {
        setQueuedNotice(t("dpr.reportSent"));
        resetForm();
      } else {
        await enqueue({ key: payload.client_token, kind: "dpr", payload });
        setQueuedNotice(t("dpr.sendFailedQueued", { reason: res.error ?? "unknown" }));
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setTranscript("");
    setPhoto(null);
    setVoice(null);
    setGeo(null);
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-fg-primary">{t("dpr.title")}</h1>
        <Badge tone={navigator.onLine === false ? "warning" : "success"}>
          {navigator.onLine === false ? t("common.offline") : t("common.online")}
        </Badge>
        {pendingCount > 0 && (
          <Badge tone="warning">{t("dpr.queueBadge", { count: pendingCount })}</Badge>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {queuedNotice && <Alert variant="info" title={t("dpr.title")}>{queuedNotice}</Alert>}

      <form onSubmit={onSubmit}>
        <Card padding="md">
          <div className="flex flex-col gap-3">
            <Select
              label={t("dpr.project")}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: "", label: t("dpr.noProject") },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Input
              label={t("dpr.phone")}
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Select
              label={t("dpr.language")}
              value={language}
              onChange={(e) => setLanguage(e.target.value as DprLanguageId)}
              options={[
                { value: "te", label: "తెలుగు" },
                { value: "hi", label: "हिंदी" },
                { value: "en", label: "English" },
              ]}
            />
            <Textarea
              label={t("dpr.notes")}
              placeholder={t("dpr.notesPh")}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={recording ? "danger" : "secondary"}
                onClick={() => void toggleRecording()}
              >
                {recording ? t("dpr.stopRecording") : t("dpr.recordVoice")}
              </Button>
              {voice && <Badge tone="info">{t("dpr.voiceAttached")}</Badge>}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--st-radius-md)] border border-default bg-panel px-4 h-10 text-sm text-fg-primary hover:bg-elevated focus-ring">
                {photo ? t("dpr.photoAttached") : t("dpr.addPhoto")}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onPhotoPicked}
                />
              </label>
              {geo && (
                <Badge tone="success">
                  {t("dpr.geotagged")} {geo.lat.toFixed(4)}, {geo.lon.toFixed(4)}
                </Badge>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" loading={busy} size="lg">
                {t("dpr.sendReport")}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
