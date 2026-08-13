// SiteTrack Pro — v5 Phase B1 approval/revision/share-link query tests.
// Pure helpers (revision sequence, threads, analytics) + the injected-client
// mappers/RPC wrappers (listApprovalDrawings, comments, share links,
// handover signatures, anon share surface).

import { describe, it, expect } from "vitest";
import {
  revisionRank, nextRevision, sortRevisions, revisionChain,
  commentThreads, commentReplies, openCommentCount,
  approvalAnalytics, APPROVAL_TONE, COMMENT_STATUSES,
  listApprovalDrawings, requestApproval, approveDrawing, rejectDrawing,
  lockDrawing, createRevision, listDrawingComments, addDrawingComment,
  setCommentStatus, deleteDrawingComment, listShareLinks, createShareLink,
  updateShareLink, setShareLinkRevoked, shareUrl, newShareToken,
  listHandoverSignatures, addHandoverSignature, validateShareLink, fetchSharePayload,
  approvalOrgRollup, listOrgApprovalDrawings,
  type ApprovalDrawing, type DrawingComment,
} from "@/app/approvalQueries";

function ad(overrides: Partial<ApprovalDrawing> = {}): ApprovalDrawing {
  return {
    id: "d1", projectId: "p1", title: "G+1 Plan", type: "architectural", revision: "Rev A",
    status: "current", releaseDate: "2026-08-01T00:00:00Z", storagePath: null, previewUrl: null,
    designStage: "concept", parentId: null, changeNote: null, approvalStatus: "not_requested",
    approvedByName: null, approvedAt: null, hasSignature: false, ...overrides,
  };
}

function c(overrides: Partial<DrawingComment> = {}): DrawingComment {
  return {
    id: "c1", drawingId: "d1", parentId: null, authorId: "u1", authorName: "Ana",
    x: 0.4, y: 0.6, body: "Move the door", status: "open", resolvedAt: null,
    createdAt: "2026-08-02T00:00:00Z", ...overrides,
  };
}

describe("revision helpers", () => {
  it("revisionRank orders Rev A < Rev B < Rev Z < Rev AA < Rev 1 < Rev 10", () => {
    expect(revisionRank("Rev A")).toBeLessThan(revisionRank("Rev B"));
    expect(revisionRank("Rev Z")).toBeLessThan(revisionRank("Rev AA"));
    expect(revisionRank("Rev 1")).toBeLessThan(revisionRank("Rev 10"));
    expect(revisionRank("v2.1")).toBe(-1);
  });
  it("nextRevision increments letters (Excel-style) and numbers", () => {
    expect(nextRevision("Rev A")).toBe("Rev B");
    expect(nextRevision("Rev Z")).toBe("Rev AA");
    expect(nextRevision("Rev AZ")).toBe("Rev BA");
    expect(nextRevision("Rev 3")).toBe("Rev 4");
    expect(nextRevision("3")).toBe("4");
    expect(nextRevision("v2.1")).toBe("Rev A");
  });
  it("sortRevisions returns the register oldest-first", () => {
    const rows = [ad({ id: "b", revision: "Rev B" }), ad({ id: "a", revision: "Rev A" }), ad({ id: "aa", revision: "Rev AA" })];
    expect(sortRevisions(rows).map(r => r.revision)).toEqual(["Rev A", "Rev B", "Rev AA"]);
  });
  it("revisionChain computes chain depth through parent links", () => {
    const chain = revisionChain([
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "x", parentId: null },
    ]);
    expect(chain.find(x => x.id === "a")?.depth).toBe(0);
    expect(chain.find(x => x.id === "b")?.depth).toBe(1);
    expect(chain.find(x => x.id === "c")?.depth).toBe(2);
    expect(chain.find(x => x.id === "x")?.depth).toBe(0);
  });
  it("revisionChain tolerates a broken (missing parent) link", () => {
    const chain = revisionChain([{ id: "a", parentId: null }, { id: "b", parentId: "ghost" }]);
    expect(chain.find(x => x.id === "b")?.depth).toBe(0);
  });
});

describe("comment thread helpers", () => {
  it("commentThreads returns only top-level pins whose parent exists", () => {
    const list = [c({ id: "pin1", parentId: null }), c({ id: "rep1", parentId: "pin1" }), c({ id: "rep2", parentId: "pin1" }), c({ id: "orphan", parentId: "ghost" })];
    expect(commentThreads(list).map(t => t.id).sort()).toEqual(["orphan", "pin1"]);
    expect(commentReplies(list, "pin1").map(r => r.id)).toEqual(["rep1", "rep2"]);
    expect(openCommentCount(list)).toBe(1);
  });
  it("openCommentCount counts only open/in_progress top-level pins", () => {
    const list = [
      c({ id: "a", status: "open" }),
      c({ id: "b", status: "in_progress" }),
      c({ id: "res", status: "resolved" }),
      c({ id: "rep", parentId: "a", status: "open" }),
    ];
    expect(openCommentCount(list)).toBe(2);
  });
  it("COMMENT_STATUSES + APPROVAL_TONE are complete", () => {
    expect(COMMENT_STATUSES).toEqual(["open", "in_progress", "resolved", "closed"]);
    expect(Object.keys(APPROVAL_TONE)).toEqual(["not_requested", "pending", "approved", "rejected", "locked"]);
  });
});

describe("approvalAnalytics", () => {
  it("rolls up revisions + approval rate over reviewed drawings", () => {
    const rows = [
      ad({ id: "a", revision: "Rev A", approvalStatus: "approved", releaseDate: "2026-08-01T00:00:00Z", approvedAt: "2026-08-06T00:00:00Z" }),
      ad({ id: "b", revision: "Rev B", approvalStatus: "locked", releaseDate: "2026-08-07T00:00:00Z", approvedAt: "2026-08-09T00:00:00Z", parentId: "a" }),
      ad({ id: "c", revision: "Rev A", approvalStatus: "rejected" }),
      ad({ id: "d", revision: "Rev A", approvalStatus: "pending" }),
      ad({ id: "e", revision: "Rev A", approvalStatus: "not_requested" }),
    ];
    const r = approvalAnalytics(rows);
    expect(r.totalRevisions).toBe(5);
    expect(r.pending).toBe(1);
    expect(r.approved).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.locked).toBe(1);
    expect(r.approvalRate).toBeCloseTo(2 / 3); // approved+locked over reviewed
    expect(r.avgApprovalDays).toBeCloseTo((5 + 2) / 2);
    expect(r.maxRevisionDepth).toBe(1);
  });
  it("empty + all-unreviewed rows are zeroed safely", () => {
    const empty = approvalAnalytics([]);
    expect(empty.totalRevisions).toBe(0);
    expect(empty.approvalRate).toBe(0);
    expect(empty.avgApprovalDays).toBe(0);
    expect(approvalAnalytics([ad(), ad({ approvalStatus: "pending" })]).approvalRate).toBe(0);
  });
});

describe("listApprovalDrawings mapper", () => {
  it("maps camelCase + approval columns and coerces unknown statuses", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              error: null,
              data: [
                { id: "d1", project_id: "p1", title: "T", type: "structural", revision: "Rev B", status: "current", release_date: "2026-08-01T00:00:00Z", storage_path: null, preview_url: null, design_stage: "approved", parent_id: "p0", change_note: "Moved wall", approval_status: "approved", approved_by: "u9", approved_at: "2026-08-05T00:00:00Z", signature: "data:image/png;base64,xxx", approver: { name: "Rahul" } },
                { id: "d2", project_id: "p1", title: "T2", type: "mep", revision: "Rev A", status: "superseded", release_date: null, storage_path: null, preview_url: null, design_stage: "concept", parent_id: null, change_note: null, approval_status: "bogus", approved_by: null, approved_at: null, signature: null, approver: null },
              ],
            }),
          }),
        }),
      }),
    };
    const res = await listApprovalDrawings(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ id: "d1", revision: "Rev B", parentId: "p0", changeNote: "Moved wall", approvalStatus: "approved", approvedByName: "Rahul", hasSignature: true });
    expect(res.data[1]).toMatchObject({ status: "superseded", approvalStatus: "not_requested", approvedByName: null, hasSignature: false });
  });
  it("propagates DB errors", async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ error: { message: "boom" }, data: null }) }) }) }),
    };
    const res = await listApprovalDrawings(client as never, "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("approval action queries", () => {
  it("requestApproval flips approval_status to pending", async () => {
    let patch: Record<string, unknown> | null = null;
    const client = { from: () => ({ update: (p: Record<string, unknown>) => { patch = p; return { eq: async () => ({ error: null }) }; } }) };
    const res = await requestApproval(client as never, "d1");
    expect(res.ok).toBe(true);
    expect(patch).toEqual({ approval_status: "pending" });
  });
  it("approveDrawing stamps status/by/at/signature", async () => {
    let patch: Record<string, unknown> | null = null;
    const client = { from: () => ({ update: (p: Record<string, unknown>) => { patch = p; return { eq: async () => ({ error: null }) }; } }) };
    const res = await approveDrawing(client as never, { drawingId: "d1", approvedBy: "u1", signature: "data:image/svg+xml;base64,S" });
    expect(res.ok).toBe(true);
    expect(patch).toMatchObject({ approval_status: "approved", approved_by: "u1", signature: "data:image/svg+xml;base64,S" });
    expect(typeof (patch as Record<string, unknown> | null)?.approved_at).toBe("string");
  });
  it("rejectDrawing and lockDrawing set their status", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ update: (p: Record<string, unknown>) => { patches.push(p); return { eq: async () => ({ error: null }) }; } }) };
    await rejectDrawing(client as never, "d1");
    await lockDrawing(client as never, "d1");
    expect(patches).toEqual([{ approval_status: "rejected" }, { approval_status: "locked" }]);
  });
  it("createRevision inserts a chained current revision pending review", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ insert: (b: Record<string, unknown>) => { inserts.push(b); return { select: () => ({ single: async () => ({ error: null, data: { id: "n1" } }) }) }; } }) };
    const res = await createRevision(client as never, { projectId: "p1", parentId: "p0", title: "T", type: "architectural", revision: "Rev B", releasedBy: "u1", changeNote: "Per client" });
    expect(res.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ project_id: "p1", parent_id: "p0", revision: "Rev B", change_note: "Per client", status: "current", approval_status: "not_requested" });
    if (res.ok) expect(res.data.id).toBe("n1");
  });
});

describe("comment queries", () => {
  it("listDrawingComments maps + coerces unknown status", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              error: null,
              data: [{ id: "c1", drawing_id: "d1", parent_id: null, author_id: "u1", x: 0.25, y: 0.5, body: "B", status: "open", resolved_at: null, created_at: "2026-08-02T00:00:00Z", author: { name: "Ana" } }],
            }),
          }),
        }),
      }),
    };
    const res = await listDrawingComments(client as never, "d1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ drawingId: "d1", x: 0.25, y: 0.5, authorName: "Ana", status: "open" });
  });
  it("addDrawingComment inserts a pin (x/y) or a reply (no x/y)", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ insert: (b: Record<string, unknown>) => { inserts.push(b); return { select: () => ({ single: async () => ({ error: null, data: { id: "n1" } }) }) }; } }) };
    await addDrawingComment(client as never, { drawingId: "d1", authorId: "u1", body: "pin", x: 0.5, y: 0.5 });
    await addDrawingComment(client as never, { drawingId: "d1", authorId: "u1", body: "reply", parentId: "c1" });
    expect(inserts[0]).toMatchObject({ x: 0.5, y: 0.5, parent_id: null });
    expect(inserts[1]).toMatchObject({ x: null, y: null, parent_id: "c1" });
  });
  it("setCommentStatus resolves (stamps resolved_at) and reopens (clears)", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ update: (p: Record<string, unknown>) => { patches.push(p); return { eq: async () => ({ error: null }) }; } }) };
    await setCommentStatus(client as never, "c1", "resolved");
    await setCommentStatus(client as never, "c1", "open");
    expect(patches[0]).toMatchObject({ status: "resolved" });
    expect(typeof patches[0]?.resolved_at).toBe("string");
    expect(patches[1]).toMatchObject({ status: "open", resolved_at: null });
  });
  it("deleteDrawingComment issues a delete", async () => {
    let eqArgs: [string, unknown] = ["", null];
    const client = { from: () => ({ delete: () => ({ eq: async (col: string, val: unknown) => { eqArgs = [col, val]; return { error: null }; } }) }) };
    await deleteDrawingComment(client as never, "c1");
    expect(eqArgs).toEqual(["id", "c1"]);
  });
});

describe("share link queries", () => {
  it("listShareLinks selects display columns only (never password_hash / otp)", async () => {
    let selected = "";
    const client = {
      from: () => ({
        select: (s: string) => {
          selected = s;
          return {
            eq: () => ({
              order: async () => ({
                error: null,
                data: [{ id: "s1", project_id: "p1", token: "abc", label: "Client", expires_at: null, revoked_at: null, allow_download: false, max_views: 3, views: 1, created_at: "2026-08-01T00:00:00Z" }],
              }),
            }),
          };
        },
      }),
    };
    const res = await listShareLinks(client as never, "p1");
    expect(selected).not.toContain("password_hash");
    expect(selected).not.toContain("otp");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ token: "abc", allowDownload: false, maxViews: 3, views: 1 });
  });
  it("createShareLink calls the RPC and returns token + otp", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = { rpc: (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return Promise.resolve({ error: null, data: { id: "s1", token: "tok", otp: "123456" } }); } };
    const res = await createShareLink(client as never, { projectId: "p1", password: "hunter2", needOtp: true, label: "Client", allowDownload: false });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toMatchObject({ token: "tok", otp: "123456" });
    expect(calls[0]).toMatchObject({ fn: "create_share_link", args: { p_project_id: "p1", p_password: "hunter2", p_need_otp: true, p_allow_download: false, p_label: "Client" } });
  });
  it("createShareLink propagates RPC errors + missing token", async () => {
    const errClient = { rpc: () => Promise.resolve({ error: { message: "denied" }, data: null }) };
    const res1 = await createShareLink(errClient as never, { projectId: "p1" });
    expect(res1.ok).toBe(false);
    if (!res1.ok) expect(res1.error).toBe("denied");
    const bad = { rpc: () => Promise.resolve({ error: null, data: null }) };
    const res2 = await createShareLink(bad as never, { projectId: "p1" });
    expect(res2.ok).toBe(false);
  });
  it("updateShareLink + setShareLinkRevoked issue the right patches", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ update: (p: Record<string, unknown>) => { patches.push(p); return { eq: async () => ({ error: null }) }; } }) };
    await updateShareLink(client as never, "s1", { label: "L", allowDownload: true, maxViews: 10, expiresAt: null });
    await setShareLinkRevoked(client as never, "s1", true);
    await setShareLinkRevoked(client as never, "s1", false);
    expect(patches[0]).toMatchObject({ label: "L", allow_download: true, max_views: 10 });
    expect(patches[1]).toMatchObject({ revoked_at: expect.any(String) });
    expect(patches[2]).toEqual({ revoked_at: null });
  });
  it("shareUrl + newShareToken are well-formed", () => {
    const t = newShareToken();
    expect(t).toMatch(/^[0-9a-f]{18}$/);
    expect(shareUrl("abc")).toMatch(/\/share-link\/abc$/);
  });
});

describe("handover signature queries", () => {
  it("listHandoverSignatures maps + join resolves", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              error: null,
              data: [{ id: "h1", project_id: "p1", org_id: "o1", signed_by: "u1", signature: "data:image/png;base64,x", signed_at: "2026-08-03T00:00:00Z", signer: { name: "Ana" } }],
            }),
          }),
        }),
      }),
    };
    const res = await listHandoverSignatures(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ projectId: "p1", orgId: "o1", signedByName: "Ana" });
  });
  it("addHandoverSignature inserts the signed capture", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ insert: (b: Record<string, unknown>) => { inserts.push(b); return { select: () => ({ single: async () => ({ error: null, data: { id: "n1" } }) }) }; } }) };
    const res = await addHandoverSignature(client as never, { projectId: "p1", orgId: "o1", signedBy: "u1", signature: "sig" });
    expect(res.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ project_id: "p1", org_id: "o1", signed_by: "u1", signature: "sig" });
  });
});

describe("public share surface (RPC wrappers)", () => {
  it("validateShareLink maps the gate row", async () => {
    const client = { rpc: (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe("validate_share_link");
      expect(args).toEqual({ p_token: "tok" });
      return Promise.resolve({ error: null, data: { valid: false, reason: "expired", project_id: "p1", label: "L", allow_download: true, expires_at: "2026-08-01T00:00:00Z", revoked_at: null, views: 4, max_views: 5, requires_password: true, requires_otp: false } });
    } };
    const res = await validateShareLink(client as never, "tok");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ valid: false, reason: "expired", requiresPassword: true, maxViews: 5, views: 4 });
  });
  it("fetchSharePayload forwards creds and maps null → invalid error", async () => {
    const ok = { rpc: (_fn: string, args: Record<string, unknown>) => {
      expect(args).toEqual({ p_token: "tok", p_password: "pw", p_otp: "otp" });
      return Promise.resolve({ error: null, data: { project: { name: "Villa" } } });
    } };
    const resOk = await fetchSharePayload(ok as never, { token: "tok", password: "pw", otp: "otp" });
    expect(resOk.ok).toBe(true);
    const bad = { rpc: () => Promise.resolve({ error: null, data: null }) };
    const resBad = await fetchSharePayload(bad as never, { token: "tok" });
    expect(resBad.ok).toBe(false);
    const err = { rpc: () => Promise.resolve({ error: { message: "boom" }, data: null }) };
    const resErr = await fetchSharePayload(err as never, { token: "tok" });
    if (!resErr.ok) expect(resErr.error).toBe("boom");
  });
});

describe("org approval rollup (pure)", () => {
  const name = (id: string) => (id === "p1" ? "Villa One" : id === "p2" ? "Tower Two" : null);
  const type = (id: string) => (id === "p1" ? "construction" : id === "p2" ? "design" : null);
  it("groups drawings by project and sums analytics", () => {
    const rows = [
      ad({ id: "a", projectId: "p1", approvalStatus: "approved" }),
      ad({ id: "b", projectId: "p1", approvalStatus: "pending" }),
      ad({ id: "c", projectId: "p2", approvalStatus: "locked" }),
      ad({ id: "d", projectId: "p2", approvalStatus: "rejected" }),
    ];
    const rollup = approvalOrgRollup(rows, name, type);
    expect(rollup.projects.length).toBe(2);
    expect(rollup.projects[0]).toMatchObject({ id: "p1", name: "Villa One", type: "construction" });
    expect(rollup.totalRevisions).toBe(4);
    expect(rollup.pending).toBe(1);
    expect(rollup.approved).toBe(1);
    expect(rollup.locked).toBe(1);
    expect(rollup.rejected).toBe(1);
    expect(rollup.approvalRate).toBeCloseTo(2 / 3, 5);
  });
  it("sorts projects by revision count desc and maps unknown ids", () => {
    const rollup = approvalOrgRollup([
      ad({ id: "a", projectId: "p1" }),
      ad({ id: "b", projectId: "p2" }),
      ad({ id: "c", projectId: "p2" }),
      ad({ id: "d", projectId: "ghost" }),
    ], name, type);
    expect(rollup.projects.map(p => p.id)).toEqual(["p2", "p1", "ghost"]);
    expect(rollup.projects[2]).toMatchObject({ name: "—", type: "—" });
  });
  it("empty rollup is zeroed", () => {
    const rollup = approvalOrgRollup([], name, type);
    expect(rollup).toMatchObject({ projects: [], totalRevisions: 0, approvalRate: 0 });
  });
});

describe("listOrgApprovalDrawings mapper", () => {
  it("queries member projects and maps drawings with name/type resolvers", async () => {
    const draws = [{
      id: "a", project_id: "p1", title: "G+1 Plan", type: "architectural", revision: "Rev A",
      status: "current", release_date: "2026-08-01T00:00:00Z", storage_path: null, preview_url: null,
      design_stage: "concept", parent_id: null, change_note: "widen corridor", approval_status: "pending",
      approved_by: null, approved_at: null, signature: null, approver: { name: null },
    }];
    const projectPromise = Promise.resolve({ error: null, data: [{ id: "p1", name: "Villa One", type: "construction" }] });
    const eqThenable = { then: (res: (v: unknown) => void) => projectPromise.then(res), in: () => projectPromise };
    const drawChain = (p: Promise<{ error: unknown; data: unknown }>) => ({ in: () => ({ order: () => p }) });
    const client = {
      from: (t: string) => {
        if (t === "projects") return { select: () => ({ eq: () => eqThenable }) };
        return { select: () => drawChain(Promise.resolve({ error: null, data: draws })) };
      },
    };
    const res = await listOrgApprovalDrawings(client as never, "org1", ["p1", "p2"]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.drawings[0]).toMatchObject({ id: "a", projectId: "p1", approvalStatus: "pending", changeNote: "widen corridor" });
    expect(res.data.projectName("p1")).toBe("Villa One");
    expect(res.data.projectType("p1")).toBe("construction");
    expect(res.data.projectName("missing")).toBeNull();
  });
  it("empty member scope short-circuits without touching the client", async () => {
    let touched = false;
    const client = { from: () => { touched = true; return { select: () => ({ eq: () => Promise.resolve({ error: null, data: [] }) }) }; } };
    const res = await listOrgApprovalDrawings(client as never, "org1", []);
    expect(res.ok).toBe(true);
    expect(touched).toBe(false);
    if (res.ok) expect(res.data.drawings).toEqual([]);
  });
  it("surfaces project-list query errors (no scope)", async () => {
    const failThenable = { then: (res: (v: unknown) => void) => Promise.resolve({ error: { message: "denied" }, data: null }).then(res) };
    const client = { from: () => ({ select: () => ({ eq: () => failThenable }) }) };
    const res = await listOrgApprovalDrawings(client as never, "org1", null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied");
  });
  it("surfaces drawings query errors", async () => {
    const projectPromise = Promise.resolve({ error: null, data: [{ id: "p1", name: "Villa One", type: "construction" }] });
    const eqThenable = { then: (res: (v: unknown) => void) => projectPromise.then(res), in: () => projectPromise };
    const client = {
      from: (t: string) => {
        if (t === "projects") return { select: () => ({ eq: () => eqThenable }) };
        return { select: () => ({ in: () => ({ order: () => Promise.resolve({ error: { message: "denied" }, data: null }) }) }) };
      },
    };
    const res = await listOrgApprovalDrawings(client as never, "org1", ["p1"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied");
  });
});
