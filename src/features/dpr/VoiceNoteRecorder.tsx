import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner, Icon } from "@/components/ui/atoms";

export interface VoiceRecordingResult {
  blob: Blob;
  durationMs: number;
}

interface VoiceNoteRecorderProps {
  onRecorded: (result: VoiceRecordingResult) => void;
  onTranscribe: () => void;
  transcribing: boolean;
  disabled?: boolean;
}

type RecorderState = "idle" | "requesting" | "recording" | "done" | "error";

export function VoiceNoteRecorder({ onRecorded, onTranscribe, transcribing, disabled }: VoiceNoteRecorderProps): JSX.Element {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [durationDisplay, setDurationDisplay] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
        mediaRecorder.current.stop();
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      mediaRecorder.current = rec;
      chunks.current = [];
      setRecordedBlob(null);
      setDurationDisplay(0);

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        setRecordedBlob(blob);
        setState("done");
        onRecorded({ blob, durationMs: elapsed * 1000 });
      };

      rec.onerror = () => {
        stream.getTracks().forEach(t => t.stop());
        setError("Recording failed. Try again.");
        setState("error");
      };

      rec.start(100);
      setState("recording");
      let elapsed = 0;
      timer.current = setInterval(() => { elapsed++; setDurationDisplay(elapsed); }, 1000);
    } catch (e) {
      const msg = (e as DOMException)?.name === "NotAllowedError"
        ? "Microphone permission denied. Enable in browser settings."
        : "Could not start recording. Check your microphone.";
      setError(msg);
      setState("error");
    }
  }, [onRecorded]);

  const stopRecording = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
  }, []);

  const retry = useCallback(() => {
    setState("idle");
    setError(null);
    setRecordedBlob(null);
    setDurationDisplay(0);
  }, []);

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      {state === "idle" && (
        <Button size="lg" onClick={() => void startRecording()} disabled={disabled} leftIcon={<Icon name="phone" size={16} />}>
          Record voice note
        </Button>
      )}
      {state === "requesting" && (
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Spinner size={16} /> Requesting microphone…
        </div>
      )}
      {state === "recording" && (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            Recording
          </span>
          <span className="text-sm font-mono text-ink-500">{fmtTime(durationDisplay)}</span>
          <Button size="sm" variant="secondary" onClick={stopRecording} leftIcon={<Icon name="pause" size={14} />}>
            Stop
          </Button>
        </div>
      )}
      {state === "done" && recordedBlob && (
        <div className="flex items-center gap-3">
          <audio src={URL.createObjectURL(recordedBlob)} controls className="h-9" />
          <span className="text-xs text-ink-400">{fmtTime(durationDisplay)}</span>
          <Button size="sm" variant="ghost" onClick={retry}>Re-record</Button>
          <Button size="sm" onClick={onTranscribe} disabled={transcribing}>
            {transcribing ? <Spinner size={14} /> : "Transcribe"}
          </Button>
        </div>
      )}
      {state === "error" && error && (
        <div className="flex items-center gap-2 text-sm text-red-700">
          <Icon name="alert" size={14} /> {error}
          <Button size="sm" variant="ghost" onClick={retry}>Try again</Button>
        </div>
      )}
    </div>
  );
}
