// SiteTrack Pro — v4 Phase A CRM query tests.
// Pure helpers (crmRollup, isOpenLead, LEAD_STAGE_NEXT, reopenLead) + the
// listOrgLeads mapper (injected client).

import { describe, it, expect } from "vitest";
import {
  crmRollup, isOpenLead, LEAD_STAGE_NEXT, reopenLead, LEAD_STAGES, LEAD_SOURCES,
  listOrgLeads, createLead, createProjectFromLead, acceptedQuote,
  setLeadOwner, updateLead, getQuotation, acceptQuotationAsAgreement,
  type Lead, type LeadStage, type LeadQuotation,
} from "@/app/crmQueries";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "l1", orgId: "o1", name: "Rahul Rao", company: "Metro Constructions",
    phone: "98888", email: "rahul@x.in", source: "referral", budget: 5_000_000,
    stage: "new", notes: null, ownerId: null, ownerName: null, wonAmount: null, lostReason: null,
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

  it("breaks the rollup down by owner (count/open/pipeline/won/value)", () => {
    const rows = [
      lead({ id: "a", ownerId: "u1", ownerName: "Ana", stage: "new", budget: 100_000 }),
      lead({ id: "b", ownerId: "u1", ownerName: "Ana", stage: "quotation_sent", budget: 200_000 }),
      lead({ id: "c", ownerId: "u2", ownerName: "Bo", stage: "won", budget: 50_000, wonAmount: 80_000 }),
      lead({ id: "d", ownerId: "u2", ownerName: "Bo", stage: "lost", budget: 99_000 }),
      lead({ id: "e", ownerId: null, stage: "new", budget: 1 }),
    ];
    const r = crmRollup(rows);
    expect(r.byOwner.u1).toEqual({ count: 2, open: 2, pipelineValue: 300_000, won: 0, wonValue: 0 });
    expect(r.byOwner.u2).toEqual({ count: 2, open: 0, pipelineValue: 0, won: 1, wonValue: 80_000 });
    expect(r.byOwner["undefined"]).toBeUndefined();
    expect(r.byOwner.e).toBeUndefined();
    expect(r.byOwner.u2?.open).toBe(0);
  });

  it("exposes per-owner bucket keys for every owned lead and totals agree", () => {
    const rows = [
      lead({ id: "a", ownerId: "u1", stage: "won", budget: 10, wonAmount: 10 }),
      lead({ id: "b", ownerId: "u3", stage: "agreement_signed", budget: 5 }),
    ];
    const r = crmRollup(rows);
    expect(Object.keys(r.byOwner).sort()).toEqual(["u1", "u3"]);
    expect(r.total).toBe(2);
    expect(r.pipelineValue).toBe(5);
    expect(r.wonValue).toBe(10);
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

describe("crmQueries acceptedQuote", () => {
  function q(overrides: Partial<LeadQuotation> = {}): LeadQuotation {
    return {
      id: "q1", leadId: "l1", title: "Quote", amount: 100, status: "accepted",
      validUntil: null, sentAt: null, createdBy: null, createdAt: "2026-08-01T00:00:00Z", ...overrides,
    };
  }

  it("returns the highest-amount accepted quotation", () => {
    const best = acceptedQuote([q({ id: "a", amount: 50, status: "accepted" }), q({ id: "b", amount: 80, status: "accepted" }), q({ id: "c", amount: 200, status: "sent" })]);
    expect(best?.id).toBe("b");
  });

  it("returns null when no quotation is accepted", () => {
    expect(acceptedQuote([q({ status: "draft" }), q({ status: "sent" }), q({ status: "rejected" })])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(acceptedQuote([])).toBeNull();
  });
});

describe("crmQueries createProjectFromLead", () => {
  it("creates a project then marks the lead won with the budget", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from: (t: string) => ({
        insert: (body: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (t === "projects") return { error: null, data: { id: "p1", ...body, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } };
              return { error: null, data: null };
            },
          }),
        }),
        update: (body: Record<string, unknown>) => {
          updates.push(body);
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ error: null, data: { id: "l1" } }),
              }),
            }),
          };
        },
      }),
    };
    const res = await createProjectFromLead(client as never, { orgId: "o1", leadId: "l1", name: "A — B", type: "construction", budget: 500_000 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.projectId).toBe("p1");
    expect(updates[0]).toMatchObject({ stage: "won", won_amount: 500_000 });
  });

  it("propagates createProject errors without touching the lead", async () => {
    const client = {
      from: (t: string) => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ error: t === "projects" ? { message: "boom" } : null, data: null }),
          }),
        }),
      }),
    };
    const res = await createProjectFromLead(client as never, { orgId: "o1", leadId: "l1", name: "A", type: "construction", budget: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("crmQueries owner join + setLeadOwner", () => {
  function clientWith() {
    let select: string | undefined;
    const updates: Array<Record<string, unknown>> = [];
    const c = {
      from: () => ({
        select: (cols: string) => {
          select = cols;
          return {
            eq: () => ({
              order: async () => ({ error: null, data: [{ id: "x", org_id: "o1", name: "A", company: null, phone: null, email: null, source: "referral", budget: 100, stage: "new", notes: null, owner_id: "u1", owner: { name: "Ana" }, won_amount: null, lost_reason: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }] }),
            }),
          };
        },
        update: (body: Record<string, unknown>) => {
          updates.push(body);
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ error: null, data: { id: "x", org_id: "o1", name: "A", company: null, phone: null, email: null, source: "referral", budget: 100, stage: "new", notes: null, owner_id: body.owner_id ?? null, owner: { name: body.owner_id === "u9" ? "New" : null }, won_amount: null, lost_reason: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" } }),
              }),
            }),
          };
        },
      }),
    };
    return { c, updates, select };
  }

  it("listOrgLeads maps ownerId + ownerName from the nested join", async () => {
    const selected: string[] = [];
    const client = {
      from: () => ({
        select: (cols: string) => {
          selected.push(cols);
          return {
            eq: () => ({
              order: async () => ({
                error: null,
                data: [{ id: "x", org_id: "o1", name: "A", company: null, phone: null, email: null, source: "referral", budget: 100, stage: "new", notes: null, owner_id: "u1", owner: { name: "Ana" }, won_amount: null, lost_reason: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
              }),
            }),
          };
        },
      }),
    };
    const res = await listOrgLeads(client as never, "o1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ ownerId: "u1", ownerName: "Ana" });
    expect(selected[0]).toContain("owner:owner_id(name)");
  });

  it("setLeadOwner updates owner_id and maps the resulting owner name", async () => {
    const { c, updates } = clientWith();
    const res = await setLeadOwner(c as never, "x", "u9");
    expect(res.ok).toBe(true);
    expect(updates[0]).toMatchObject({ owner_id: "u9" });
    if (res.ok) expect(res.data.ownerName).toBe("New");
  });

  it("setLeadOwner with null clears owner_id", async () => {
    const { c, updates } = clientWith();
    const res = await setLeadOwner(c as never, "x", null);
    expect(res.ok).toBe(true);
    expect(updates[0]).toHaveProperty("owner_id", null);
  });

  it("updateLead only builds a body for provided fields", async () => {
    const { c } = clientWith();
    const res = await updateLead(c as never, "x", { ownerId: "u9" });
    expect(res.ok).toBe(true);
  });

  it("setLeadOwner propagates update errors", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ order: async () => ({ error: null, data: [] }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ error: { message: "boom" }, data: null }) }) }) }),
      }),
    };
    const res = await setLeadOwner(client as never, "x", "u1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("crmQueries acceptQuotationAsAgreement", () => {
  function clientWith(quoteStatus: string, existingQuoteId: string | null | undefined = undefined) {
    const inserted: Array<Record<string, unknown>> = [];
    const calls = inserted;
    let checked: Record<string, unknown> | null = null;
    const c = {
      from: (t: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (t === "lead_quotations") return { error: null, data: { id: "q1", lead_id: "l1", title: "Quote A", amount: 5000, status: quoteStatus, valid_until: null, sent_at: null, created_by: null, created_at: "2026-08-01T00:00:00Z" } };
              // lead_agreements lookup by quotation_id
              checked = { quotation_id: existingQuoteId ?? null };
              return existingQuoteId == null ? { error: null, data: null } : { error: null, data: { id: "agr-existing", lead_id: "l1", title: "Quote A", amount: 5000, status: "pending", signed_at: null, signed_by: null, notes: null, quotation_id: existingQuoteId, created_by: null, created_at: "2026-08-01T00:00:00Z" } };
            },
          }),
        }),
        insert: (body: Record<string, unknown>) => {
          calls.push(body);
          return {
            select: () => ({
              single: async () => ({ error: null, data: { id: "agr-new", lead_id: "l1", title: "Quote A", amount: 5000, status: "pending", signed_at: null, signed_by: null, notes: null, quotation_id: "q1", created_by: null, created_at: "2026-08-01T00:00:00Z" } }),
            }),
          };
        },
      }),
    };
    return { c, calls, checked };
  }

  it("creates a pending agreement from an accepted quotation", async () => {
    const { c, calls } = clientWith("accepted");
    const res = await acceptQuotationAsAgreement(c as never, "q1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.amount).toBe(5000);
    expect(calls[0]).toMatchObject({ lead_id: "l1", title: "Quote A", amount: 5000, status: "pending", quotation_id: "q1" });
  });

  it("rejects non-accepted quotations", async () => {
    const { c } = clientWith("draft");
    const res = await acceptQuotationAsAgreement(c as never, "q1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/accepted/i);
  });

  it("is idempotent — returns the existing agreement when already converted", async () => {
    const { c, calls } = clientWith("accepted", "q1x");
    const res = await acceptQuotationAsAgreement(c as never, "q1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.quotationId).toBe("q1x");
    expect(calls).toHaveLength(0);
  });

  it("returns not-found when the quotation is missing", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null, data: null }) }) }),
      }),
    };
    const res = await acceptQuotationAsAgreement(client as never, "nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
  });

  it("propagates getQuotation errors", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: { message: "boom" }, data: null }) }) }),
      }),
    };
    const res = await acceptQuotationAsAgreement(client as never, "q1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });

  it("getQuotation returns null for a missing row via maybeSingle", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null, data: null }) }) }),
      }),
    };
    const res = await getQuotation(client as never, "q1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });
});
