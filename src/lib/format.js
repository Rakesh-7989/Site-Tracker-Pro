// SiteTrack Pro — Pure formatting helpers (no React, no DOM)
//
// Centralized so they can be:
//  - reused in DPR/PDF builders without pulling in App.jsx
//  - unit-tested without booting React
//  - swapped to a different locale in one place when we add Tamil/Kannada
//
// Extracted from App.jsx during the Tech Lead "begin split" pass (LOW-5).

export const fmtDate = d => {
  if (!d) return "—";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-IN", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return "—"; }
};

export const fmtTime = t => {
  if (!t) return "";
  try {
    const date = new Date(t);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
};

export const fmtCur = n => {
  if (n === undefined || n === null || n === "") return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return "₹" + num.toLocaleString("en-IN");
};

// File-kind classifier driven by extension. Used by AttachmentList icons.
const KIND_BY_EXT = {
  image: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
  pdf: ["pdf"],
  cad: ["dwg", "dxf", "rvt", "ifc"],
  doc: ["doc", "docx"],
  sheet: ["xls", "xlsx", "csv"],
  archive: ["zip", "rar"],
};

export const fileKind = name => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  if (!ext) return "file";
  for (const [kind, exts] of Object.entries(KIND_BY_EXT)) {
    if (exts.includes(ext)) return kind;
  }
  return "file";
};

export const fmtSize = n => {
  if (!n || n <= 0) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
