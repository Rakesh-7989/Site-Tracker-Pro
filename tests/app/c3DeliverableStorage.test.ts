// SiteTrack Pro — v4 C3.2 deliverable-storage pure-helper tests.
// Pure functions only (path/name/format helpers) — no client injected.

import { describe, it, expect } from "vitest";
import {
  DELIVERABLE_BUCKET, deliverableFolder, deliverableObjectPath, projectIdFromPath,
  sanitizeFileName, formatBytes, validateDeliverableFile, DELIVERABLE_ACCEPT,
  DELIVERABLE_MAX_BYTES, uploadPayloadSize,
} from "@/app/queries/deliverableStorageQueries";

describe("deliverableStorage folder/path helpers", () => {
  it("builds the folder <project>/<deliverable>", () => {
    expect(deliverableFolder("proj1", "delA")).toBe("proj1/delA");
  });

  it("builds the full object path including a sanitized file name", () => {
    expect(deliverableObjectPath("proj1", "delA", "GFC Drawing.pdf"))
      .toBe("proj1/delA/GFC Drawing.pdf");
  });

  it("sanitizes path separators and control chars out of a file name", () => {
    expect(sanitizeFileName("../..\\x:y?z*w\"q")).toBe(".._.._x_y_z_w_q");
  });

  it("falls back to a safe name when the sanitized name is empty", () => {
    expect(sanitizeFileName("   ")).toBe("file");
    expect(sanitizeFileName("\u0000")).toBe("file");
  });

  it("truncates over-long file names to 120 chars", () => {
    const long = "a".repeat(200) + ".pdf";
    expect(sanitizeFileName(long).length).toBe(120);
  });

  it("extracts the first path segment as the project id", () => {
    expect(projectIdFromPath("proj9/delB/a.txt")).toBe("proj9");
    expect(projectIdFromPath("/proj9/a.txt")).toBe("proj9");
    expect(projectIdFromPath("")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB and MB sensibly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("coerces invalid input to 0 B", () => {
    expect(formatBytes(NaN)).toBe("0 B");
  });
});

describe("bucket constant", () => {
  it("uses the `deliverables` bucket", () => {
    expect(DELIVERABLE_BUCKET).toBe("deliverables");
  });
});

describe("validateDeliverableFile (SEC-P1-6)", () => {
  it("accepts CAD/docs/image extensions", () => {
    for (const name of ["report.pdf", "GFC.dwg", "site.dxf", "photo.jpeg", "sheet.xlsx"]) {
      expect(validateDeliverableFile(name, 1024)).toBeNull();
    }
  });

  it("rejects stored-XSS + executable types", () => {
    for (const name of ["evil.html", "evil.svg", "evil.js", "run.exe", "noext"]) {
      expect(validateDeliverableFile(name, 1024)).toMatch(/not allowed/);
    }
  });

  it("rejects files over the 50 MB bucket cap", () => {
    expect(validateDeliverableFile("report.pdf", DELIVERABLE_MAX_BYTES + 1)).toMatch(/larger than/);
    expect(validateDeliverableFile("report.pdf", DELIVERABLE_MAX_BYTES)).toBeNull();
  });

  it("derives the input accept attr from the allowlist", () => {
    expect(DELIVERABLE_ACCEPT).toContain(".pdf");
    expect(DELIVERABLE_ACCEPT).not.toContain(".html");
  });

  it("measures Blob / ArrayBuffer / string payloads", () => {
    expect(uploadPayloadSize(new Blob(["hello"]))).toBe(5);
    expect(uploadPayloadSize(new Uint8Array(7).buffer)).toBe(7);
    expect(uploadPayloadSize("abc")).toBe(3);
  });
});