// SiteTrack Pro — v4 Phase A CRM query tests.
// Pure helpers (crmRollup, isOpenLead, LEAD_STAGE_NEXT, reopenLead) + the
// listOrgLeads mapper (injected client).

import { describe, it, expect } from "vitest";
import {
  crmRollup, isOpenLead, LEAD_STAGE_NEXT, reopenLead, LEAD_STAGES, LEAD_SOURCES,
  listOrgLeads, createLead,
  type Lead, type LeadStage,
} from "@/app/crmQueries";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "l1", orgId: "o1", name: "Rahul Rao", company: "Metro Constructions",
    phone: "98888", email: "rahul@x.in", source: "referral", budget: 5_000_000,
    stage: "new", notes: null, ownerId: null, wonAmount: null, lostReason: null,
    createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", ...overrides,
  };
}

describe("crmQueries enums", () => {
  it("LEAD_STAGES is the canonical funnel order", () => {
    expect(LEAD_STAGES).toEqual(["new", "contacted", "meeting_scheduled", "quotation_sent", "negotiating", "agreement_signed", "won", "lost"]);
  });

  it("LEAD_SOURCES includes referral + website + walk_in + call + whatsapp + event + other", () => {
    expect(LEAD_SOURCES).toContain("referral");
    expect(LEAD_SOURCES).toContain("whatsapp");
    expect(LEAD_SOURCES).toHaveLength(7);
  });
});

describe("crmQueries isOpenLead", () => {
  it("is true for funnel stages, false for won/lost", () => {
    expect(isOpenLead("new")).toBe(true);
    expect(isOpenLead("negotiating")).toBe(true);
    expect(isOpenLead("won")).toBe(false);
    expect(isOpenLead("lost")).toBe(false);
  });
});

describe("crmQueries LEAD_STAGE_NEXT", () => {
  it("advances the funnel new → ... → agreement_signed → won", () => {
    expect(LEAD_STAGE_NEXT.new).toBe("contacted");
    expect(LEAD_STAGE_NEXT.contacted).toBe("meeting_scheduled");
    expect(LEAD_STAGE_NEXT.meeting_scheduled).toBe("quotation_sent");
    expect(LEAD_STAGE_NEXT.quotation_sent).toBe("negotiating");
    expect(LEAD_STAGE_NEXT.negotiating).toBe("agreement_signed");
    expect(LEAD_STAGE_NEXT.agreement_signed).toBe("won");
    expect(LEAD_STAGE_NEXT.won).toBeUndefined();
    expect(LEAD_STAGE_NEXT.lost).toBeUndefined();
  });
});

describe("crmQueries reopenLead", () => {
  it("returns the stage unchanged for open stages", () => {
    expect(reopenLead("new")).toBe("new");
    expect(reopenLead("quotation_sent")).toBe("quotation_sent");
  });

  it("reopens won/lost back to new", () => {
    expect(reopenLead("won")).toBe("new");
    expect(reopenLead("lost")).toBe("new");
  });
});

describe("crmQueries crmRollup", () => {
  it("rolls up totals, values and per-stage counts", () => {
    const rows = [
      lead({ id: "a", stage: "new", budget: 1_000_000 }),
      lead({ id: "b", stage: "quotation_sent", budget: 2_000_000 }),
      lead({ id: "c", stage: "won", budget: 3_000_000, wonAmount: 4_000_000 }),
      lead({ id: "d", stage: "lost", budget: 5_000_000, lostReason: "price" }),
    ];
    const r = crmRollup(rows);
    expect(r.total).toBe(4);
    expect(r.open).toBe(2);
    expect(r.won).toBe(1);
    expect(r.lost).toBe(1);
    expect(r.pipelineValue).toBe(3_000_000);
    expect(r.wonValue).toBe(4_000_000);
    expect(r.byStage.new).toBe(1);
    expect(r.byStage.quotation_sent).toBe(1);
    expect(r.byStage.won).toBe(1);
    expect(r.byStage.lost).toBe(1);
  });

  it("computes conversion rate as won / decided, rounded", () => {
    expect(crmRollup([lead({ stage: "won" }), lead({ stage: "lost" })]).conversionRate).toBe(50);
    expect(crmRollup([lead({ stage: "won" })]).conversionRate).toBe(100);
    expect(crmRollup([lead({ stage: "lost" })]).conversionRate).toBe(0);
  });

  it("returns 0 conversion when nothing decided and zero-filled buckets", () => {
    const r = crmRollup([]);
    expect(r.conversionRate).toBe(0);
    expect(r.byStage.new).toBe(0);
    expect(r.byStage.won).toBe(0);
    for (const s of LEAD_STAGES as LeadStage[]) expect(r.byStage[s]).toBe(0);
  });

  it("budget nulls do not add pipeline value", () => {
    const r = crmRollup([lead({ budget: null }), lead({ budget: 500 })]);
    expect(r.pipelineValue).toBe(500);
  });
});

describe("crmQueries listOrgLeads mapper", () => {
  it("maps camelCase rows and coerces unknown stage to new", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              error: null,
              data: [
                { id: "x", org_id: "o1", name: "A", company: null, phone: null, email: null, source: "call", budget: 100, stage: "won", notes: null, owner_id: null, won_amount: 90, lost_reason: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
                { id: "y", org_id: "o1", name: "B", company: "C", phone: "1", email: "e", source: "bogus", budget: null, stage: "not-a-stage", notes: null, owner_id: null, won_amount: null, lost_reason: null, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
              ],
            }),
          }),
        }),
      }),
    };
    const res = await listOrgLeads(client as never, "o1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ id: "x", name: "A", source: "call", budget: 100, stage: "won", wonAmount: 90 });
    // unknown source → other; unknown stage → new
    expect(res.data[1]).toMatchObject({ source: "other", stage: "new", company: "C", budget: null });
  });

  it("propagates DB errors", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ error: { message: "boom" }, data: null }),
          }),
        }),
      }),
    };
    const res = await listOrgLeads(client as never, "o1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("crmQueries createLead", () => {
  it("inserts org + input and maps the single row", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        insert: (body: Record<string, unknown>) => {
          inserts.push(body);
          return {
            select: () => ({
              single: async () => ({
                error: null,
                data: { id: "n1", ...body, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
              }),
            }),
          };
        },
      }),
    };
    const res = await createLead(client as never, "o1", { name: "X", source: "website", budget: 999 });
    expect(res.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ org_id: "o1", name: "X", source: "website", budget: 999, stage: "new" });
    if (res.ok) expect(res.data.stage).toBe("new");
  });
});
