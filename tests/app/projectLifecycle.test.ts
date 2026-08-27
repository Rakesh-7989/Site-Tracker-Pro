// SiteTrack Pro — project lifecycle (P-B): pure state machine + query mappers.

import { describe, it, expect } from "vitest";
import {
  asProjectLifecycleStatus,
  isProjectLifecycleStatus,
  isTerminalStatus,
  isPauseState,
  isLiveProject,
  nextLifecycleOptions,
  lifecycleActions,
  reactivateStatus,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
} from "@/lib/projectLifecycle";
import {
  setProjectStatus,
  archiveProject,
  restoreProject,
  deleteProject,
} from "@/app/queries/queries";

describe("projectLifecycle pure helpers", () => {
  it("recognises the full status set", () => {
    for (const s of ["active", "paused", "on_hold", "deactivated", "completed", "cancelled"]) {
      expect(isProjectLifecycleStatus(s)).toBe(true);
    }
    expect(isProjectLifecycleStatus("mystery")).toBe(false);
    expect(isProjectLifecycleStatus(null)).toBe(false);
  });

  it("falls back unknown values to active", () => {
    expect(asProjectLifecycleStatus(null)).toBe("active");
    expect(asProjectLifecycleStatus("weird")).toBe("active");
    expect(asProjectLifecycleStatus("paused")).toBe("paused");
  });

  it("classifies terminal vs reversible states", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("active")).toBe(false);
    expect(isPauseState("paused")).toBe(true);
    expect(isPauseState("on_hold")).toBe(true);
    expect(isPauseState("deactivated")).toBe(true);
    expect(isPauseState("active")).toBe(false);
  });

  it("considers a project live unless archived", () => {
    expect(isLiveProject({ status: "paused", archived_at: null })).toBe(true);
    expect(isLiveProject({ status: "active", archived_at: "2026-01-01" })).toBe(false);
    expect(isLiveProject({})).toBe(true);
  });

  it("builds the transition ladder per status", () => {
    expect(nextLifecycleOptions("active")).toEqual(["paused", "on_hold", "deactivated", "completed", "cancelled"]);
    expect(nextLifecycleOptions("paused")).toEqual(["active", "completed", "cancelled"]);
    expect(nextLifecycleOptions("on_hold")).toEqual(["active", "completed", "cancelled"]);
    expect(nextLifecycleOptions("deactivated")).toEqual(["active", "completed", "cancelled"]);
    expect(nextLifecycleOptions("completed")).toEqual(["active"]);
    expect(nextLifecycleOptions("cancelled")).toEqual(["active"]);
  });

  it("renders lifecycle action descriptors", () => {
    const acts = lifecycleActions("active");
    expect(acts.map(a => a.to)).toEqual(["paused", "on_hold", "deactivated", "completed", "cancelled"]);
    expect(acts[0]!.label).toBe("Paused");
    expect(acts[3]!.tone).toBe("info");
    expect(acts[4]!.tone).toBe("error");
    expect(lifecycleActions("completed").map(a => a.to)).toEqual(["active"]);
  });

  it("exposes labels + tones for every status", () => {
    expect(PROJECT_STATUS_LABEL.on_hold).toBe("On hold");
    expect(PROJECT_STATUS_TONE.active).toBe("success");
    expect(PROJECT_STATUS_TONE.deactivated).toBe("neutral");
    expect(PROJECT_STATUS_TONE.cancelled).toBe("error");
    expect(reactivateStatus()).toBe("active");
  });
});

describe("project lifecycle queries", () => {
  function chainable(selectResult: unknown, trace: { calls: string[] }) {
    const hasErrorShape = selectResult != null && typeof selectResult === "object" && "error" in (selectResult as Record<string, unknown>);
    const single = { single: async () => (hasErrorShape ? selectResult : { data: selectResult, error: null }) };
    return {
      from() {
        return {
          update(patch: Record<string, unknown>) {
            trace.calls.push(`update:${JSON.stringify(patch)}`);
            return {
              eq() {
                return {
                  is() { return { select() { return single; } }; },
                  not(col: string, op: string, val: unknown) {
                    trace.calls.push(`not:${col}:${op}:${String(val)}`);
                    return { select() { return single; } };
                  },
                  select() { return single; },
                };
              },
            };
          },
          delete() {
            trace.calls.push("delete");
            return { eq() { return { delete: async () => ({ data: null, error: null }) }; } };
          },
        };
      },
    };
  }

  it("setProjectStatus validates the status before updating", async () => {
    const trace = { calls: [] as string[] };
    const client = chainable({ status: "paused", archived_at: null }, trace);
    const bad = await setProjectStatus(client, "p-1", "exploded" as never);
    expect(bad.ok).toBe(false);
    expect(trace.calls).toEqual([]);

    const ok = await setProjectStatus(client, "p-1", "paused");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data).toEqual({ status: "paused", archivedAt: null });
    }
    expect(trace.calls[0]).toContain('"status":"paused"');
  });

  it("setProjectStatus surfaces query errors", async () => {
    const client = chainable({ data: null, error: { message: "rlz" } }, { calls: [] });
    const r = await setProjectStatus(client, "p-1", "active");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rlz/);
  });
  it("archiveProject sets archived_at only for non-archived rows", async () => {
    const trace = { calls: [] as string[] };
    const client = chainable({ status: "active", archived_at: "2026-01-01" }, trace);
    const r = await archiveProject(client, "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.archivedAt).toBe("2026-01-01");
    expect(trace.calls[0]).toContain('"archived_at":');
  });

  it("restoreProject clears archived_at and returns active", async () => {
    const trace = { calls: [] as string[] };
    const client = chainable({ status: "active", archived_at: null }, trace);
    const r = await restoreProject(client, "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ status: "active", archivedAt: null });
    expect(trace.calls.join()).toContain("not:archived_at:is:null");
    expect(trace.calls[0]).toContain('"archived_at":null');
  });

  it("deleteProject issues a hard delete", async () => {
    const trace = { calls: [] as string[] };
    const client = chainable({}, trace);
    const r = await deleteProject(client, "p-1");
    expect(r.ok).toBe(true);
    expect(trace.calls.join()).toContain("delete");
  });
});
