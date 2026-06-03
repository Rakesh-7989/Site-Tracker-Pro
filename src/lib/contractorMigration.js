// SiteTrack Pro — Contractor migration (Powerplay / BuildSupply / Falconbrick).
//
// The single biggest barrier to winning Powerplay's customers is "we can't
// import our data". This lib closes that. Given a CSV export from a known
// competitor, we:
//   1. Auto-detect the vendor by header shape.
//   2. Normalize column names to SiteTrack canonical schema.
//   3. Validate + report per-row errors WITHOUT failing the entire import.
//   4. Return a structured payload the UI can preview before commit.
//
// All pure — no fetches, no React. Two-phase: parseCsv() → applyMigration().

import { parseBoq } from "./boqImport.js";

/** Target SiteTrack tables that contractor migrators can write into. */
export const TARGETS = ["projects", "vendors", "boq", "ra_bills", "labour"];

const HEADER_FINGERPRINTS = {
  powerplay_projects: ["project_id", "client_name", "site_address", "budget_inr"],
  powerplay_boq: ["item_code", "description", "uom", "qty", "rate"],
  buildsupply_vendors: ["supplier_code", "supplier_name", "gstin", "rating"],
  buildsupply_boq: ["code", "description", "unit_of_measurement", "quantity", "unit_rate"],
  falconbrick_labour: ["worker_id", "name", "aadhaar", "trade", "daily_wage"],
};

/**
 * Detect vendor + target table by sniffing the header row.
 * Returns { vendor: 'powerplay'|'buildsupply'|'falconbrick'|'unknown',
 *           target: 'projects'|'vendors'|... }.
 */
export function detectVendor(headerArray) {
  const lower = (headerArray || []).map(h => String(h || "").toLowerCase().trim());
  let bestKey = null, bestScore = 0;
  for (const [key, expected] of Object.entries(HEADER_FINGERPRINTS)) {
    const score = expected.filter(e => lower.includes(e)).length / expected.length;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }
  if (bestScore < 0.6) return { vendor: "unknown", target: null, confidence: bestScore };
  const [vendor, target] = bestKey.split("_");
  return { vendor, target, confidence: bestScore };
}

/**
 * Column mapping tables: per-vendor field-name → SiteTrack canonical field.
 */
const COLUMN_MAPS = {
  powerplay_projects: {
    project_id: "external_id", project_name: "name", client_name: "client_name",
    site_address: "location", budget_inr: "budget", start_date: "start_date",
    end_date: "expected_end_date", status: "status",
  },
  powerplay_boq: {
    item_code: "code", description: "description", uom: "unit",
    qty: "qty", rate: "rate", category: "category",
  },
  buildsupply_vendors: {
    supplier_code: "external_id", supplier_name: "name", category: "category",
    contact_phone: "phone", gstin: "gst", rating: "rating",
  },
  buildsupply_boq: {
    code: "code", description: "description", unit_of_measurement: "unit",
    quantity: "qty", unit_rate: "rate", category: "category",
  },
  falconbrick_labour: {
    worker_id: "external_id", name: "name", aadhaar: "aadhaar",
    trade: "trade", daily_wage: "wage", joining_date: "joined",
  },
};

/** Lowercased + trimmed header map for forgiving lookup. */
function indexMap(headerArray, vendorKey) {
  const map = COLUMN_MAPS[vendorKey] || {};
  const out = {};
  const lower = (headerArray || []).map(h => String(h || "").toLowerCase().trim());
  for (const [src, dest] of Object.entries(map)) {
    const idx = lower.indexOf(src.toLowerCase());
    if (idx >= 0) out[dest] = idx;
  }
  return out;
}

/**
 * Parse a raw CSV string into per-row records.
 *
 * Re-uses the BOQ parser's CSV tokenizer (detectSeparator + splitLine) so we
 * don't ship two CSV engines. We just discard BOQ-specific column mapping.
 */
function parseRows(csv) {
  // boqImport's parseBoq is BOQ-shape; we only want its split logic. Cheap
  // workaround: pass an empty target and inspect the raw rows it splits.
  // For now, do a simple inline split — quotes-aware.
  const rows = [];
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  for (const line of lines) {
    const tokens = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQ = !inQ; continue; }
      if ((c === "," || c === "\t") && !inQ) { tokens.push(cur); cur = ""; continue; }
      cur += c;
    }
    tokens.push(cur);
    rows.push(tokens.map(t => t.trim()));
  }
  return rows;
}

/**
 * Main entry — detect, parse, normalize, validate.
 *
 *   const { vendor, target, rows, errors } = parseCsv(csvText)
 */
export function parseCsv(csv) {
  if (!csv || typeof csv !== "string") {
    return { vendor: "unknown", target: null, rows: [], errors: [{ line: 0, reason: "empty-input" }] };
  }
  // Session 28.3: strip UTF-8 BOM (Byte Order Mark, U+FEFF) — Excel-saved
  // CSVs on Mac and many web exports prefix the file with this character,
  // which would otherwise be glued to the first header column (e.g.
  // "BOM-prefixed project_id") and cause detectVendor() to mis-classify
  // the file as "unknown-format". Check charCode to avoid ESLint's
  // no-irregular-whitespace error on a literal BOM char.
  if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);
  const rows = parseRows(csv);
  if (rows.length < 2) {
    return { vendor: "unknown", target: null, rows: [], errors: [{ line: 0, reason: "no-data-rows" }] };
  }
  const header = rows[0];
  const sniff = detectVendor(header);
  if (sniff.vendor === "unknown") {
    return { vendor: "unknown", target: null, rows: [], errors: [{ line: 0, reason: "unknown-format" }] };
  }
  const vendorKey = `${sniff.vendor}_${sniff.target}`;
  const idx = indexMap(header, vendorKey);

  const normalized = [];
  const errors = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    for (const [dest, srcIdx] of Object.entries(idx)) {
      const v = row[srcIdx];
      obj[dest] = v == null ? "" : v;
    }
    // Per-target validations:
    const err = validateRow(sniff.target, obj);
    if (err) errors.push({ line: i + 1, reason: err, row: obj });
    else normalized.push(obj);
  }

  return {
    vendor: sniff.vendor,
    target: sniff.target,
    confidence: sniff.confidence,
    rows: normalized,
    errors,
    summary: {
      total: rows.length - 1,
      ok: normalized.length,
      failed: errors.length,
    },
  };
}

function validateRow(target, row) {
  switch (target) {
    case "projects":
      if (!row.name) return "name-required";
      if (row.budget && !/^[0-9.]+$/.test(String(row.budget).replace(/,/g, ""))) return "budget-not-numeric";
      return null;
    case "vendors":
      if (!row.name) return "name-required";
      if (row.gst && !/^[0-9A-Z]{15}$/.test(String(row.gst).toUpperCase())) return "invalid-gstin";
      return null;
    case "boq":
      if (!row.description) return "description-required";
      if (row.qty && Number.isNaN(parseFloat(row.qty))) return "qty-not-numeric";
      if (row.rate && Number.isNaN(parseFloat(row.rate))) return "rate-not-numeric";
      return null;
    case "labour":
      if (!row.name) return "name-required";
      if (row.aadhaar && !/^\d{12}$/.test(String(row.aadhaar).replace(/\s/g, ""))) return "aadhaar-format";
      if (row.wage && Number.isNaN(parseFloat(row.wage))) return "wage-not-numeric";
      return null;
    default:
      return null;
  }
}

/**
 * Coerce normalized rows into the canonical INSERT shape for each target table.
 * Returns { boq, projects, vendors, labour } batches ready for app to call
 * Supabase upserts.
 */
export function toCanonicalBatches(target, normalizedRows, ctx = {}) {
  const out = { boq: [], projects: [], vendors: [], labour: [] };
  for (const row of normalizedRows ?? []) {
    switch (target) {
      case "projects":
        out.projects.push({
          org_id: ctx.org_id || null,
          name: row.name,
          location: row.location || null,
          budget: row.budget ? parseFloat(String(row.budget).replace(/,/g, "")) : null,
          start_date: row.start_date || null,
          expected_end_date: row.expected_end_date || null,
          client_name: row.client_name || null,
          status: (row.status || "active").toLowerCase(),
          type: "construction",
        });
        break;
      case "vendors":
        out.vendors.push({
          org_id: ctx.org_id || null,
          name: row.name,
          category: row.category || null,
          phone: row.phone || null,
          gst: row.gst || null,
          rating: row.rating ? parseFloat(row.rating) : null,
        });
        break;
      case "boq":
        out.boq.push({
          project_id: ctx.project_id || null,
          code: row.code || null,
          description: row.description,
          unit: row.unit || null,
          qty: row.qty ? parseFloat(row.qty) : null,
          rate: row.rate ? parseFloat(row.rate) : null,
          category: row.category || "Other",
        });
        break;
      case "labour":
        out.labour.push({
          project_id: ctx.project_id || null,
          name: row.name,
          aadhaar: row.aadhaar || null,
          trade: row.trade || null,
          wage: row.wage ? parseFloat(row.wage) : null,
          joined: row.joined || null,
        });
        break;
    }
  }
  return out;
}

// Re-export parseBoq so callers don't need a separate import for BOQ-only files.
export { parseBoq };
