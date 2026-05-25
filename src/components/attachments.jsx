// SiteTrack Pro — Attachment upload + render atoms.
//
// Extracted from App.jsx in Batch 7. These four pieces are tightly coupled
// (Input adds, Row lazy-loads via IDB, List renders, helpers handle binary
// readers) so they live together in one module.
//
// Storage strategy (MED-3 fix preserved):
//   Binary content → IndexedDB via lib/offline.js (putBlob / getBlob / delBlob).
//   Row metadata   → localStorage as part of message / update / drawing / etc.
//   On render      → AttachmentRow asynchronously fetches the binary via
//                     resolveAttachmentUrl(), so localStorage stays well
//                     under the ~5-10 MB browser quota even with hundreds
//                     of site photos.
//
// Public exports:
//   ATTACH_ACCEPT        — comma-separated MIME hint string
//   DRAWING_ACCEPT       — subset for drawing uploads only
//   readAttachment(file) — File → row { id, kind, name, size, idbKey, ... }
//   resolveAttachmentUrl — async row → URL (IDB blob or inline dataUrl)
//   attachmentIcon       — row.kind → icon name
//   <AttachmentInput>    — drag/drop + click-to-upload
//   <AttachmentRow>      — single row renderer with lazy URL fetch
//   <AttachmentList>     — grid of rows under a parent record

import { useEffect, useRef, useState } from "react";
import { fileKind, fmtSize, Ic } from "./ui.jsx";
import { putBlob, getBlob, delBlob } from "../lib/offline.js";

export const ATTACH_ACCEPT  = ".pdf,.dwg,.dxf,.rvt,.ifc,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.svg,.gif,.zip,.rar";
export const DRAWING_ACCEPT = ".pdf,.dwg,.dxf,.rvt,.ifc,.png,.jpg,.jpeg,.svg,.zip,.rar";

export const attachmentIcon = kind =>
  ({ image:"image", pdf:"doc", cad:"gantt", doc:"doc", sheet:"receipt", archive:"folder", file:"doc" }[kind] || "doc");

// File → attachment row { id, name, size, type, kind, uploaded_at, idbKey | dataUrl }.
// Falls back to inline dataUrl when IDB unavailable (old browsers / Safari private).
export const readAttachment = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = async ev => {
    const dataUrl = ev.target.result;
    const id = `att_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const attachment = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      kind: fileKind(file.name),
      uploaded_at: new Date().toISOString(),
    };
    try {
      await putBlob(id, dataUrl);
      attachment.idbKey = id;
    } catch {
      attachment.dataUrl = dataUrl;
    }
    resolve(attachment);
  };
  r.onerror = reject;
  r.readAsDataURL(file);
});

// Resolves row → URL on demand. Used by AttachmentRow + safePhotoSrc.
export async function resolveAttachmentUrl(att) {
  if (!att) return "";
  if (att.idbKey) {
    try {
      const stored = await getBlob(att.idbKey);
      if (stored) return stored;
    } catch { /* fall through to inline */ }
  }
  return att.dataUrl || att.url || "";
}

// Drag-and-drop / click upload. Calls onChange with full updated files[].
export function AttachmentInput({ files = [], onChange, label = "Upload files", accept = ATTACH_ACCEPT, maxMb = 20 }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const addFiles = async list => {
    const picked = Array.from(list || []);
    const ok = picked.filter(f => {
      if (f.size > maxMb * 1024 * 1024) {
        alert(`${f.name} is larger than ${maxMb}MB`);
        return false;
      }
      return true;
    });
    if (!ok.length) return;
    const next = await Promise.all(ok.map(readAttachment));
    onChange([...(files || []), ...next]);
  };
  const remove = id => {
    const target = (files || []).find(f => (f.id || f.name) === id);
    if (target?.idbKey) delBlob(target.idbKey).catch(() => {});
    onChange((files || []).filter(f => (f.id || f.name) !== id));
  };
  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple accept={accept} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} className="hidden"/>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`w-full border-2 border-dashed rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${drag ? "border-orange-400 bg-orange-50 text-orange-600" : "border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600"}`}
      >
        <Ic n="download" s={15}/>{label}{files?.length ? ` (${files.length})` : ""}
      </button>
      {files?.length > 0 && <div className="space-y-2">{files.map(f =>
        <div key={f.id || f.name} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500">
            <Ic n={attachmentIcon(f.kind)} s={14}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-700 truncate">{f.name}</div>
            <div className="text-[10px] text-slate-400">{fmtSize(f.size)}</div>
          </div>
          <button type="button" onClick={() => remove(f.id || f.name)} className="text-slate-300 hover:text-red-400"><Ic n="x" s={14}/></button>
        </div>
      )}</div>}
    </div>
  );
}

// One attachment row. Lazy-loads URL on mount via IDB.
export function AttachmentRow({ f, idx }) {
  const [url, setUrl] = useState(f.dataUrl || f.url || "");
  useEffect(() => {
    if (url || !f.idbKey) return;
    let cancelled = false;
    resolveAttachmentUrl(f).then(u => { if (!cancelled) setUrl(u || ""); });
    return () => { cancelled = true; };
  }, [f.idbKey, f.id, url, f]);
  return (
    <div key={f.id || `${f.name}_${idx}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 overflow-hidden">
        {f.kind === "image" && url ? <img src={url} alt="" className="w-full h-full object-cover"/> : <Ic n={attachmentIcon(f.kind)} s={14}/>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-700 truncate">{f.name}</div>
        <div className="text-[10px] text-slate-400">{fmtSize(f.size)}</div>
      </div>
      {url && <a href={url} download={f.name} className="text-xs font-bold text-orange-600 hover:text-orange-700">Download</a>}
    </div>
  );
}

// Grid of rows under a message / update / drawing.
export function AttachmentList({ files = [] }) {
  const list = files || [];
  if (!list.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
        <Ic n="doc" s={12}/>Attachments ({list.length})
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {list.map((f, i) => <AttachmentRow key={f.id || `${f.name}_${i}`} f={f} idx={i}/>)}
      </div>
    </div>
  );
}
