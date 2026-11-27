import { describe, it, expect, beforeEach } from "vitest";
import { TenantSecurityError, type SecurityContext } from "../workers/api/src/middleware/tenant";
import { Phase8SiteControlsRepository } from "../workers/api/src/repositories/phase8SiteControlsRepository";

interface Phase8MockState {
  projects: Array<{ id: string; org_id: string }>;
  partnerOrgs: Array<{ project_id: string; org_id: string; status: string }>;
  rfis: Array<{ id: string; project_id: string; no: string; subject: string; status: string; response: string | null }>;
  changeOrders: Array<{ id: string; project_id: string; no: string; description: string; status: string }>;
  raBills: Array<{ id: string; project_id: string; no: string; bill_amount: number; paid_amount: number; status: string }>;
}

function createPhase8MockD1(state: Phase8MockState): D1Database {
  return {
    prepare(query: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          args = params;
          return stmt;
        },
        async first<T>() {
          const q = query.replace(/\s+/g, " ").trim();
          if (q.includes("FROM projects p WHERE p.id = ?")) {
            const [ctxOrg, projectId, ownerOrg, partnerOrg] = args as [string, string, string, string];
            const proj = state.projects.find((p) => p.id === projectId);
            if (!proj) return null as T;
            const isOwner = proj.org_id === ownerOrg;
            const isPartner = state.partnerOrgs.some(
              (po) => po.project_id === projectId && po.org_id === partnerOrg && po.status === "active"
            );
            if (!isOwner && !isPartner) return null as T;
            return { org_id: proj.org_id, is_owner: proj.org_id === ctxOrg ? 1 : 0 } as T;
          }
          if (q.includes("FROM projects WHERE id = ? AND org_id = ?")) {
            const [projectId, orgId] = args as [string, string];
            const proj = state.projects.find((p) => p.id === projectId && p.org_id === orgId);
            return (proj ? { id: proj.id } : null) as T;
          }
          return null as T;
        },
        async all() {
          const q = query.replace(/\s+/g, " ").trim();
          if (q.includes("FROM rfi")) {
            const [projectId] = args as [string];
            return { results: state.rfis.filter((r) => r.project_id === projectId), success: true, meta: {} };
          }
          if (q.includes("FROM change_orders")) {
            const [projectId] = args as [string];
            return { results: state.changeOrders.filter((c) => c.project_id === projectId), success: true, meta: {} };
          }
          if (q.includes("FROM ra_bills")) {
            const [projectId] = args as [string];
            return { results: state.raBills.filter((b) => b.project_id === projectId), success: true, meta: {} };
          }
          return { results: [], success: true, meta: {} };
        },
        async run() {
          const q = query.replace(/\s+/g, " ").trim();
          if (q.startsWith("INSERT INTO rfi")) {
            const [id, projectId, no, subject] = args as [string, string, string, string];
            state.rfis.push({ id, project_id: projectId, no, subject, status: "open", response: null });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE rfi")) {
            const [status, response, , , , rfiId, projectId] = args as [string, string | null, unknown, unknown, unknown, string, string];
            const row = state.rfis.find((r) => r.id === rfiId && r.project_id === projectId);
            if (row) {
              row.status = status;
              if (response !== null) row.response = response;
            }
            return { success: true, meta: { changes: row ? 1 : 0 } };
          }
          if (q.startsWith("INSERT INTO change_orders")) {
            const [id, projectId, no, description] = args as [string, string, string, string];
            state.changeOrders.push({ id, project_id: projectId, no, description, status: "submitted" });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE change_orders")) {
            const [status, , , , coId, projectId] = args as [string, unknown, unknown, unknown, string, string];
            const row = state.changeOrders.find((c) => c.id === coId && c.project_id === projectId);
            if (row) row.status = status;
            return { success: true, meta: { changes: row ? 1 : 0 } };
          }
          if (q.startsWith("INSERT INTO ra_bills")) {
            const [id, projectId, no, , , billAmount] = args as [string, string, string, unknown, unknown, number];
            state.raBills.push({ id, project_id: projectId, no, bill_amount: billAmount, paid_amount: 0, status: "submitted" });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE ra_bills")) {
            const [status, paidAmount, billId, projectId] = args as [string, number | null, string, string];
            const row = state.raBills.find((b) => b.id === billId && b.project_id === projectId);
            if (row) {
              row.status = status;
              if (paidAmount !== null) row.paid_amount = paidAmount;
            }
            return { success: true, meta: { changes: row ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return stmt as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("Cloudflare Phase 8 Site Controls Repository", () => {
  let state: Phase8MockState;
  let repo: Phase8SiteControlsRepository;
  const ctxOwner: SecurityContext = { userId: "u1", email: "pm@org.in", orgId: "org_a", role: "pm", isAdmin: false, partnerOrgIds: [] };
  const ctxViewer: SecurityContext = { userId: "u2", email: "v@org.in", orgId: "org_a", role: "viewer", isAdmin: false, partnerOrgIds: [] };
  const ctxPartner: SecurityContext = { userId: "u3", email: "p@partner.in", orgId: "org_b", role: "admin", isAdmin: true, partnerOrgIds: [] };

  beforeEach(() => {
    state = {
      projects: [{ id: "proj_1", org_id: "org_a" }],
      partnerOrgs: [{ project_id: "proj_1", org_id: "org_b", status: "active" }],
      rfis: [],
      changeOrders: [],
      raBills: [],
    };
    repo = new Phase8SiteControlsRepository(createPhase8MockD1(state));
  });

  it("supports RFI, change orders, and RA bills CRUD for owner org", async () => {
    await repo.createRfi(ctxOwner, "proj_1", { id: "rfi_1", no: "RFI-01", subject: "Footing depth", question: "Confirm 1.5m?" });
    expect(await repo.updateRfi(ctxOwner, "proj_1", "rfi_1", { response: "Confirmed 1.5m" })).toBe(true);
    expect(state.rfis[0].status).toBe("answered");

    await repo.createChangeOrder(ctxOwner, "proj_1", { id: "co_1", no: "CO-01", description: "Extra retaining wall", costImpact: 120000 });
    expect(await repo.updateChangeOrderStatus(ctxOwner, "proj_1", "co_1", "approved")).toBe(true);
    expect(state.changeOrders[0].status).toBe("approved");

    await repo.createRaBill(ctxOwner, "proj_1", { id: "ra_1", no: "RA-01", billAmount: 250000 });
    expect(await repo.updateRaBillStatus(ctxOwner, "proj_1", "ra_1", { status: "paid", paidAmount: 237500 })).toBe(true);
    expect(state.raBills[0].paid_amount).toBe(237500);

    // Partner org can read all three
    expect(await repo.listRfis(ctxPartner, "proj_1")).toHaveLength(1);
    expect(await repo.listChangeOrders(ctxPartner, "proj_1")).toHaveLength(1);
    expect(await repo.listRaBills(ctxPartner, "proj_1")).toHaveLength(1);
  });

  it("blocks viewer role and partner org from mutating site controls", async () => {
    await expect(
      repo.createRfi(ctxViewer, "proj_1", { id: "rfi_x", no: "RFI-X", subject: "x", question: "x" })
    ).rejects.toThrow(TenantSecurityError);
    await expect(
      repo.createChangeOrder(ctxPartner, "proj_1", { id: "co_x", no: "CO-X", description: "x" })
    ).rejects.toThrow(TenantSecurityError);
    await expect(
      repo.createRaBill(ctxViewer, "proj_1", { id: "ra_x", no: "RA-X", billAmount: 1000 })
    ).rejects.toThrow(TenantSecurityError);
  });
});
