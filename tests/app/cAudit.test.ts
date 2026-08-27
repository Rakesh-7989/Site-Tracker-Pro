// SiteTrack Pro — v4 Phase C consultancy inspection/audit surface tests.
// Pure helpers (verdict, status transitions) + query-layer mappers.

import { describe, it, expect } from "vitest";
import {
  checklistVerdict, CL_STATUS_NEXT, CL_STATUS_LABEL, CL_KIND_LABEL,
  REP_KIND_LABEL, REP_STATUS_LABEL,
  listChecklists, upsertChecklist, setChecklistStatus, deleteChecklist,
  listResults, upsertResult, deleteResult,
  listReports, upsertReport, setReportStatus, deleteReport,
} from "@/app/queries/consultancyAuditQueries";

describe("consultancyAuditQueries checklistVerdict", () => {
  it("rolls up pass/fail/na with passPct over decisive items", () => {
    const v = checklistVerdict([
      { result: "pass" }, { result: "pass" }, { result: "fail" }, { result: "na" },
    ]);
    expect(v.total).toBe(4);
    expect(v.passed).toBe(2);
    expect(v.failed).toBe(1);
    expect(v.na).toBe(1);
    expect(v.passPct).toBe(Math.round((2 / 3) * 100));
    expect(v.verdict).toBe("failed");
  });

  it("verdict is passed when no failures among decisive items", () => {
    const v = checklistVerdict([{ result: "pass" }, { result: "pass" }]);
    expect(v.verdict).toBe("passed");
    expect(v.passPct).toBe(100);
  });

  it("verdict is pending when nothing decisive", () => {
    expect(checklistVerdict([]).verdict).toBe("pending");
    expect(checklistVerdict([{ result: "na" }]).verdict).toBe("pending");
    expect(checklistVerdict([{ result: "na" }]).passPct).toBe(0);
  });

  it("failed verdict requires at least one fail", () => {
    expect(checklistVerdict([{ result: "fail" }, { result: "na" }]).verdict).toBe("failed");
  });
});

describe("consultancyAuditQueries status transitions", () => {
  it("CL_STATUS_NEXT walks draft → in_progress → passed, terminal stays put", () => {
    expect(CL_STATUS_NEXT.draft).toBe("in_progress");
    expect(CL_STATUS_NEXT.in_progress).toBe("passed");
    expect(CL_STATUS_NEXT.passed).toBe("passed");
    expect(CL_STATUS_NEXT.failed).toBe("failed");
    expect(CL_STATUS_NEXT.cancelled).toBe("draft");
  });
});

describe("consultancyAuditQueries checklists (mock client)", () => {
  it("listChecklists maps empty list", async () => {
    const c = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    const res = await listChecklists(c, "p1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it("upsertChecklist inserts a row and returns its id", async () => {
    const c = { from: () => ({ insert: (_row: unknown) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "c1" }, error: null }) }) }), update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    const res = await upsertChecklist(c, { projectId: "p1", kind: "site_visit", title: "Floor audit" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("c1");
  });

  it("upsertChecklist updates when an id is given", async () => {
    let updated = false;
    const c = { from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "c1" }, error: null }) }) }), update: (_row: unknown) => { updated = true; return { eq: () => Promise.resolve({ error: null }) }; } }) };
    const res = await upsertChecklist(c, { id: "c1", projectId: "p1", kind: "design_review", title: "Design review" });
    expect(res.ok).toBe(true);
    expect(updated).toBe(true);
  });

  it("setChecklistStatus + delete surface errors", async () => {
    const up = { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    expect((await setChecklistStatus(up, "c1", "passed")).ok).toBe(true);
    const del = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: { message: "x" } }) }) }) };
    expect((await deleteChecklist(del, "c1")).ok).toBe(false);
  });
});

describe("consultancyAuditQueries results (mock client)", () => {
  it("listResults maps empty list", async () => {
    const c = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    const res = await listResults(c, "c1");
    expect(res.ok).toBe(true);
  });

  it("upsertResult inserts/updates and returns id", async () => {
    const c = { from: () => ({ insert: (_row: unknown) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "r1" }, error: null }) }) }), update: (_row: unknown) => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    const ins = await upsertResult(c, { checklistId: "c1", item: "Railings secure" });
    expect(ins.ok).toBe(true);
    const upd = await upsertResult(c, { id: "r1", checklistId: "c1", item: "Railings", result: "pass" });
    expect(upd.ok).toBe(true);
  });

  it("deleteResult surfaces errors", async () => {
    const c = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: { message: "nope" } }) }) }) };
    expect((await deleteResult(c, "r1")).ok).toBe(false);
  });
});

describe("consultancyAuditQueries reports (mock client)", () => {
  it("listReports maps empty list", async () => {
    const c = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    const res = await listReports(c, "p1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it("upsertReport inserts with kind + summary", async () => {
    const c = { from: () => ({ insert: (_row: unknown) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "rep1" }, error: null }) }) }), update: (_row: unknown) => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    const res = await upsertReport(c, { projectId: "p1", kind: "recommendation", title: "MEP re-align", summary: "Shift riser 300mm" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("rep1");
  });

  it("setReportStatus + delete surface", async () => {
    const ok = { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    expect((await setReportStatus(ok, "rep1", "published")).ok).toBe(true);
    const del = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: { message: "x" } }) }) }) };
    expect((await deleteReport(del, "rep1")).ok).toBe(false);
  });
});

describe("consultancyAuditQueries label maps", () => {
  it("all kinds and statuses have labels", () => {
    expect(CL_KIND_LABEL.site_visit).toBe("Site visit");
    expect(REP_KIND_LABEL.recommendation).toBe("Recommendation");
    expect(REP_KIND_LABEL.milestone_review).toBe("Milestone review");
    for (const s of ["draft", "in_progress", "passed", "failed", "cancelled"] as const) {
      expect(CL_STATUS_LABEL[s]).toBeTruthy();
    }
    for (const s of ["draft", "published", "archived"] as const) {
      expect(REP_STATUS_LABEL[s]).toBeTruthy();
    }
  });
});