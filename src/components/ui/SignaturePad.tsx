// SiteTrack Pro — SignaturePad (v5 Phase B1).
// Canvas draw-to-sign with a "type" fallback. Emits either a PNG data URL
// (drawn) or the typed text (typed). Pointer events so touch + pen + mouse all
// draw; no external deps.

import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";

export interface SignaturePadProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  className?: string;
}

export function SignaturePad({ value, onChange, height = 140, className }: SignaturePadProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"draw" | "type">(value.startsWith("data:") ? "draw" : "type");

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (value.startsWith("data:")) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cv.width, cv.height);
      img.src = value;
    }
  }, [value, mode]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    drawing.current = true;
    cv.setPointerCapture(e.pointerId);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const cv = canvasRef.current;
    if (cv) onChange(cv.toDataURL("image/png"));
  };

  const clear = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    onChange("");
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Signature input mode">
          <button
            type="button"
            onClick={() => { setMode("draw"); onChange(""); }}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === "draw" ? "bg-accent text-white" : "text-fg-secondary"}`}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => { setMode("type"); onChange(""); }}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === "type" ? "bg-accent text-white" : "text-fg-secondary"}`}
          >
            Type
          </button>
        </div>
        <Button size="sm" variant="ghost" onClick={clear} leftIcon={<Icon name="trash" size={14} />}>
          Clear
        </Button>
      </div>
      {mode === "draw" ? (
        <canvas
          ref={canvasRef}
          width={520}
          height={height}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="w-full cursor-crosshair touch-none rounded-lg border border-border bg-white"
          role="img"
          aria-label="Signature pad — draw your signature"
        />
      ) : (
        <Input
          fit={false}
          value={value.startsWith("data:") ? "" : value}
          onChange={e => onChange(e.target.value)}
          placeholder="Type your name as signature"
          aria-label="Type your signature"
        />
      )}
    </div>
  );
}
