// SiteTrack Pro — shared CAD preview modal (v4 B5).
// Client-side preview for uploaded CAD files in the drawing / deliverable
// register. DXF is parsed + re-rendered to SVG by the dependency-free
// dxfPreview lib; DWG / SKP are closed binary formats → graceful fallback
// (metadata + a signed-URL download prompt instead of a preview).
//
// The caller supplies a signed-URL provider (`getUrl`) — each register tab
// has its own storage helper, and this modal stays storage-agnostic.

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { cadKind, parseDxf, dxfToSvg, entityCount } from "@/lib/dxfPreview";
import { cn } from "@/lib/cn";

type UrlResult = { ok: true; data: string } | { ok: false; error: string };

export interface CadPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** File name with extension (.dxf / .dwg / .skp). */
  fileName: string | null;
  /** Resolve a short-lived signed URL for the file (storage-agnostic). */
  getUrl: () => Promise<UrlResult>;
  /** Short label shown in the fallback download prompt, e.g. "Drawing file". */
  label?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "rendered"; svg: string; entities: number }
  | { kind: "unsupported"; ext: string }
  | { kind: "error"; message: string };

const EXT_LABEL: Record<string, string> = { dwg: "AutoCAD DWG", skp: "SketchUp SKP" };

export function CadPreviewModal({ open, onClose, fileName, getUrl, label }: CadPreviewModalProps): JSX.Element | null {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const getUrlRef = useRef(getUrl);
  getUrlRef.current = getUrl;

  const run = useCallback(async () => {
    if (!open || !fileName) return;
    const kind = cadKind(fileName);
    if (kind !== "dxf") {
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "file";
      setStatus({ kind: "unsupported", ext });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const urlRes = await getUrlRef.current();
      if (!urlRes.ok) { setStatus({ kind: "error", message: urlRes.error }); return; }
      const res = await fetch(urlRes.data);
      if (!res.ok) { setStatus({ kind: "error", message: `Could not load file (HTTP ${res.status}).` }); return; }
      const text = await res.text();
      const entities = parseDxf(text);
      if (entities.length === 0) {
        setStatus({ kind: "error", message: "No renderable entities found in this DXF." });
        return;
      }
      const svg = dxfToSvg(entities);
      if (!svg) { setStatus({ kind: "error", message: "No renderable entities found in this DXF." }); return; }
      setStatus({ kind: "rendered", svg, entities: entityCount(entities) });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [open, fileName]);

  useEffect(() => {
    if (open) void run();
    else setStatus({ kind: "idle" });
  }, [open, run]);

  const kind = fileName ? cadKind(fileName) : "other";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      title={fileName ?? "CAD preview"}
      subtitle={kind === "dxf" ? "DXF · rendered client-side" : `CAD · ${kind.toUpperCase()}`}
      ariaLabel="CAD file preview"
    >
      {status.kind === "loading" && (
        <div className="grid place-items-center py-16" role="status" aria-label="Loading CAD preview">
          <Spinner size={26} />
        </div>
      )}

      {status.kind === "rendered" && (
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              "w-full overflow-auto rounded-xl border border-border bg-bg-primary",
              "min-h-[240px] max-h-[70vh]",
            )}
            // SVG is generated locally from parsed numeric entities with
            // escaped text — never user-supplied HTML.
            dangerouslySetInnerHTML={{ __html: status.svg }}
          />
          <p className="text-[11px] text-fg-tertiary">{status.entities} entities rendered.</p>
        </div>
      )}

      {status.kind === "unsupported" && (
        <div className="flex flex-col items-start gap-3 py-2">
          <Alert variant="info">
            <span className="font-semibold">{EXT_LABEL[status.ext] ?? status.ext.toUpperCase()}</span>
            {" files can't be previewed in the browser. Download the file to open it in your CAD software."}
          </Alert>
          <Button
            variant="secondary"
            leftIcon="download"
            onClick={async () => {
              const urlRes = await getUrl();
              if (urlRes.ok) window.open(urlRes.data, "_blank", "noopener,noreferrer");
            }}
          >
            Download {label ?? "file"}
          </Button>
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex flex-col items-start gap-3 py-2">
          <Alert variant="danger">
            <span className="inline-flex items-center gap-1.5"><Icon name="alert" size={14} /> {status.message}</span>
          </Alert>
          <Button variant="ghost" onClick={() => void run()}>Try again</Button>
        </div>
      )}

      {status.kind === "idle" && <div className="text-sm text-fg-secondary">No file selected.</div>}
    </Modal>
  );
}
