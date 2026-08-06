// SiteTrack Pro — v4 E4 download-audit tests.
// Pure downloadTotals / decorateDownloadEvents + logDownloadEvent / listOrgDownloadEvents
// query mappers (project list → events .in(project_id) → profile names).

import { describe, it, expect } from "vitest";
import {
  downloadTotals, decorateDownloadEvents, logDownloadEvent, listOrgDownloadEvents,
  type DownloadEvent, type DecoratedDownloadEvent,
} from "@/app/downloadAuditQueries";

const ev = (o: Partial<DownloadEvent> & { id: string }): DownloadEvent => ({
  projectId: o.projectId ?? "p1",
  register: o.register ?? "deliverable",
  refId: o.refId ?? "r1",
  fileName: o.fileName ?? "plan.pdf",
  filePath: o.filePath ?? "p1/d1/plan.pdf",
  sizeBytes: o.sizeBytes ?? 1024,
  downloadedBy: o.downloadedBy ?? null,
  downloadedAt: o.downloadedAt ?? "2026-08-06T10:00:00.000Z",
  ...o,
});

describe("downloadAuditQueries downloadTotals", () => {
  it("counts total + per-register", () => {
    const t = downloadTotals([
      ev({ id: "1", register: "deliverable" }),
      ev({ id: "2", register: "deliverable" }),
      ev({ id: "3", register: "drawing" }),
    ]);
    expect(t).toEqual({ total: 3, deliverable: 2, drawing: 1 });
  });

  it("is empty-safe", () => {
    expect(downloadTotals([])).toEqual({ total: 0, deliverable: 0, drawing: 0 });
  });
});

describe("downloadAuditQueries decorateDownloadEvents", () => {
  it("merges project + downloader names", () => {
    const out = decorateDownloadEvents(
      [ev({ id: "1", projectId: "p1", downloadedBy: "u1" })],
      [{ id: "p1", name: "HQ Build", type: "design" }],
      [{ id: "u1", name: "Anita Rao" }],
    );
    const r = out[0] as DecoratedDownloadEvent;
    expect(r.projectName).toBe("HQ Build");
    expect(r.projectType).toBe("design");
    expect(r.downloadedByName).toBe("Anita Rao");
  });

  it("stays null-safe for missing project / user / downloader", () => {
    const out = decorateDownloadEvents(
      [ev({ id: "1", projectId: "p9", downloadedBy: null })],
      [],
      [],
    );
    expect(out[0].projectName).toBeNull();
    expect(out[0].downloadedByName).toBeNull();
  });
});

describe("downloadAuditQueries logDownloadEvent", () => {
  const mockClient = (result: { error?: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = {
      from: () => ({ insert: (payload: Record<string, unknown>) => {
        client.payload = payload;
        return result;
      } }),
    };
    return client;
  };

  it("inserts a snake_case row (downloaded_by left to RLS default)", async () => {
    const client = mockClient({ error: null });
    const r = await logDownloadEvent(client, {
      projectId: "p1", register: "drawing", refId: "d1", fileName: "gf-01.pdf", filePath: "p1/d1/gf-01.pdf", sizeBytes: 2048,
    });
    expect(r.ok).toBe(true);
    expect(client.payload).toEqual({
      project_id: "p1", register: "drawing", ref_id: "d1",
      file_name: "gf-01.pdf", file_path: "p1/d1/gf-01.pdf", size_bytes: 2048,
    });
    expect(client.payload.downloaded_by).toBeUndefined();
  });

  it("surfaces insert errors", async () => {
    const client = mockClient({ error: { message: "rls denied" } });
    const r = await logDownloadEvent(client, { projectId: "p1", register: "deliverable", refId: "r1", fileName: "f", filePath: "p/f" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("rls denied");
  });
});

describe("downloadAuditQueries listOrgDownloadEvents", () => {
  const mockClient = (opts: {
    projects?: { data?: unknown; error?: unknown };
    events?: { data?: unknown; error?: unknown };
    profiles?: { data?: unknown; error?: unknown };
  }) => ({
    from: (table: string) => {
      if (table === "projects") return { select: () => ({ eq: () => opts.projects ?? { data: [], error: null } }) };
      if (table === "profiles") return { select: () => ({ in: () => opts.profiles ?? { data: [], error: null } }) };
      return { select: () => ({ in: () => ({ order: () => ({ limit: () => opts.events ?? { data: [], error: null } }) }) }) };
    },
  });

  it("decorates events with project + downloader names", async () => {
    const client = mockClient({
      projects: { data: [{ id: "p1", name: "HQ Build", type: "design" }], error: null },
      events: {
        data: [
          { id: "e1", project_id: "p1", register: "deliverable", ref_id: "r1", file_name: "GF Struct.pdf", file_path: "p1/r1/GF Struct.pdf", size_bytes: 5000, downloaded_by: "u1", downloaded_at: "2026-08-06T10:00:00Z" },
          { id: "e2", project_id: "p1", register: "weird", ref_id: "d1", file_name: "plan.png", file_path: "p1/d1/plan.png", size_bytes: 0, downloaded_by: null, downloaded_at: "2026-08-05T09:00:00Z" },
        ],
        error: null,
      },
      profiles: { data: [{ id: "u1", name: "Anita Rao" }], error: null },
    });
    const r = await listOrgDownloadEvents(client, "org-1");
    expect(r.ok).toBe(true);
    const rows = (r as { ok: true; data: DecoratedDownloadEvent[] }).data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ projectId: "p1", projectName: "HQ Build", register: "deliverable", downloadedByName: "Anita Rao", sizeBytes: 5000 });
    // invalid register coerces to 'deliverable'
    expect(rows[1].register).toBe("deliverable");
    expect(rows[1].downloadedByName).toBeNull();
  });

  it("short-circuits to empty when the org has no projects", async () => {
    const client = mockClient({ projects: { data: [], error: null } });
    const r = await listOrgDownloadEvents(client, "org-1");
    expect(r).toEqual({ ok: true, data: [] });
  });

  it("propagates project-list errors", async () => {
    const client = mockClient({ projects: { data: null, error: { message: "denied" } } });
    const r = await listOrgDownloadEvents(client, "org-1");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("denied");
  });

  it("propagates event errors", async () => {
    const client = mockClient({
      projects: { data: [{ id: "p1", name: "HQ", type: "design" }], error: null },
      events: { data: null, error: { message: "boom" } },
    });
    const r = await listOrgDownloadEvents(client, "org-1");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("boom");
  });
});
