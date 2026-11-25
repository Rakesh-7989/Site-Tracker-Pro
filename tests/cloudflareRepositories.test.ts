import { describe, it, expect, beforeEach } from "vitest";
import { assertTenantContext, TenantSecurityError } from "../workers/api/src/middleware/tenant";
import { ProjectRepository } from "../workers/api/src/repositories/projectRepository";
import { SiteOpsRepository } from "../workers/api/src/repositories/siteOpsRepository";
import { FinanceRepository } from "../workers/api/src/repositories/financeRepository";
import { ProcurementAndDesignRepository } from "../workers/api/src/repositories/procurementAndDesignRepository";
import { OrgAdminRepository } from "../workers/api/src/repositories/orgAdminRepository";

interface MockState {
  orgMembers: Array<{ org_id: string; profile_id: string; role: string; is_admin: number; status: string; email: string }>;
  partnerOrgs: Array<{ id: string; project_id: string; org_id: string; scope: string; status: string }>;
  partnerMembers: Array<{ project_id: string; org_id: string; profile_id: string; role: string }>;
  projects: Array<{ id: string; org_id: string; name: string; type: string; budget: number }>;
  tasks: Array<{ id: string; project_id: string; title: string; status: string }>;
  dprs: Array<{ id: string; project_id: string; transcript_text: string | null }>;
  invoices: Array<{ id: string; project_id: string; invoice_number: string; total_amount: number }>;
  expenses: Array<{ id: string; project_id: string; amount: number }>;
  boqItems: Array<{ id: string; project_id: string; item_name: string; amount: number }>;
  purchaseOrders: Array<{ id: string; project_id: string; vendor_id: string; po_number: string }>;
  drawings: Array<{ id: string; project_id: string; title: string; drawing_number: string }>;
  invitations: Array<{ id: string; org_id: string; email: string; role: string; token: string }>;
  signupRequests: Array<{ id: string; firm_name: string; email: string }>;
  resendEvents: Array<{ id: string; event: string }>;
  planPayments: Array<{ id: string; org_id: string; plan: string; amount_paise: number }>;
}

function createMockD1(state: MockState): D1Database {
  return {
    prepare(query: string) {
      let args: unknown[] = [];
      const q = query.replace(/\s+/g, " ").trim();

      const executeFirst = (): unknown => {
        if (q.includes("FROM org_members om")) {
          const [orgId, userId] = args as [string, string];
          return (
            state.orgMembers.find(
              (m) => m.org_id === orgId && m.profile_id === userId && m.status === "active"
            ) ?? null
          );
        }
        if (q.includes("CASE WHEN p.org_id = ? THEN 1 ELSE 0 END AS is_owner")) {
          const [ctxOrg1, projectId, ctxOrg2, ctxOrg3] = args as [string, string, string, string];
          const p = state.projects.find((pr) => pr.id === projectId);
          if (!p) return null;
          const isPartner = state.partnerOrgs.some(
            (po) => po.project_id === projectId && po.org_id === ctxOrg3 && po.status === "active"
          );
          if (p.org_id !== ctxOrg2 && !isPartner) return null;
          return { org_id: p.org_id, is_owner: p.org_id === ctxOrg1 ? 1 : 0 };
        }
        if (q.startsWith("SELECT id FROM projects WHERE id = ? AND org_id = ?")) {
          const [projectId, orgId] = args as [string, string];
          const p = state.projects.find((pr) => pr.id === projectId && pr.org_id === orgId);
          return p ? { id: p.id } : null;
        }
        if (q.includes("FROM projects p WHERE p.id = ?")) {
          const [projectId, org1, org2] = args as [string, string, string];
          const p = state.projects.find((pr) => pr.id === projectId);
          if (!p) return null;
          const isPartner = state.partnerOrgs.some(
            (po) => po.project_id === projectId && po.org_id === org2 && po.status === "active"
          );
          return p.org_id === org1 || isPartner ? p : null;
        }
        return null;
      };

      const executeAll = (): unknown[] => {
        if (q.includes("FROM project_partner_members")) {
          const [userId] = args as [string];
          return state.partnerMembers.filter((pm) => pm.profile_id === userId);
        }
        if (q.includes("FROM projects p WHERE p.org_id = ?")) {
          const [org1, org2] = args as [string, string];
          return state.projects.filter(
            (p) =>
              p.org_id === org1 ||
              state.partnerOrgs.some((po) => po.project_id === p.id && po.org_id === org2 && po.status === "active")
          );
        }
        if (q.startsWith("SELECT * FROM tasks WHERE project_id = ?")) {
          return state.tasks.filter((t) => t.project_id === args[0]);
        }
        if (q.startsWith("SELECT * FROM dpr_messages WHERE project_id = ?")) {
          return state.dprs.filter((d) => d.project_id === args[0]);
        }
        if (q.startsWith("SELECT * FROM invoices WHERE project_id = ?")) {
          return state.invoices.filter((i) => i.project_id === args[0]);
        }
        if (q.startsWith("SELECT * FROM expenses WHERE project_id = ?")) {
          return state.expenses.filter((e) => e.project_id === args[0]);
        }
        if (q.startsWith("SELECT * FROM boq_items WHERE project_id = ?")) {
          return state.boqItems.filter((b) => b.project_id === args[0]);
        }
        if (q.includes("FROM purchase_orders po")) {
          return state.purchaseOrders.filter((po) => po.project_id === args[0]);
        }
        if (q.startsWith("SELECT * FROM drawings WHERE project_id = ?")) {
          return state.drawings.filter((d) => d.project_id === args[0]);
        }
        return [];
      };

      const executeRun = (): number => {
        if (q.startsWith("INSERT INTO projects")) {
          const [id, org_id, name, type, budget] = args as [string, string, string, string, number];
          state.projects.push({ id, org_id, name, type, budget });
          return 1;
        }
        if (q.startsWith("INSERT INTO tasks")) {
          const [id, project_id, , title] = args as [string, string, unknown, string];
          state.tasks.push({ id, project_id, title, status: "todo" });
          return 1;
        }
        if (q.startsWith("UPDATE tasks SET status = ?")) {
          const [status, id, projectId] = args as [string, string, string];
          const t = state.tasks.find((item) => item.id === id && item.project_id === projectId);
          if (!t) return 0;
          t.status = status;
          return 1;
        }
        if (q.startsWith("INSERT INTO dpr_messages")) {
          const [id, project_id, , transcript_text] = args as [string, string, string, string | null];
          state.dprs.push({ id, project_id, transcript_text });
          return 1;
        }
        if (q.startsWith("INSERT INTO invoices")) {
          const [id, project_id, invoice_number, , , , , , , , total_amount] = args as [
            string,
            string,
            string,
            string,
            string | null,
            number,
            number,
            number,
            number,
            number,
            number,
          ];
          state.invoices.push({ id, project_id, invoice_number, total_amount });
          return 1;
        }
        if (q.startsWith("INSERT INTO boq_items")) {
          const [id, project_id, , item_name, , , , amount] = args as [
            string,
            string,
            string | null,
            string,
            string | null,
            number,
            number,
            number,
          ];
          state.boqItems.push({ id, project_id, item_name, amount });
          return 1;
        }
        if (q.startsWith("INSERT INTO drawings")) {
          const [id, project_id, title, , drawing_number] = args as [string, string, string, string, string];
          state.drawings.push({ id, project_id, title, drawing_number });
          return 1;
        }
        if (q.startsWith("INSERT INTO org_invitations")) {
          const [id, org_id, email, role, , token] = args as [string, string, string, string, string, string];
          state.invitations.push({ id, org_id, email, role, token });
          return 1;
        }
        if (q.startsWith("INSERT INTO signup_requests")) {
          const [id, firm_name, , email] = args as [string, string, string, string];
          state.signupRequests.push({ id, firm_name, email });
          return 1;
        }
        if (q.startsWith("INSERT INTO resend_delivery_events")) {
          const [id, event] = args as [string, string];
          state.resendEvents.push({ id, event });
          return 1;
        }
        if (q.startsWith("INSERT INTO plan_payments")) {
          const [id, org_id, plan, , amount_paise] = args as [string, string, string, string, number];
          state.planPayments.push({ id, org_id, plan, amount_paise });
          return 1;
        }
        if (q.startsWith("UPDATE org_members SET status = 'removed'")) {
          const [orgId, profileId] = args as [string, string];
          const m = state.orgMembers.find(
            (item) => item.org_id === orgId && item.profile_id === profileId && item.status !== "removed"
          );
          if (!m) return 0;
          m.status = "removed";
          return 1;
        }
        return 1;
      };

      const stmt = {
        bind(...values: unknown[]) {
          args = values;
          return stmt;
        },
        async first<T = Record<string, unknown>>() {
          return executeFirst() as T | null;
        },
        async all<T = Record<string, unknown>>() {
          return { results: executeAll() as T[], success: true, meta: {} };
        },
        async run() {
          return { success: true, meta: { changes: executeRun() } };
        },
      };
      return stmt as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("Cloudflare D1 Workers Repositories & Tenant Isolation", () => {
  let state: MockState;
  let db: D1Database;

  beforeEach(() => {
    state = {
      orgMembers: [
        { org_id: "org_owner", profile_id: "u_owner", role: "admin", is_admin: 1, status: "active", email: "owner@builder.in" },
        { org_id: "org_partner", profile_id: "u_partner", role: "admin", is_admin: 1, status: "active", email: "arch@studio.in" },
        { org_id: "org_outsider", profile_id: "u_outsider", role: "admin", is_admin: 1, status: "active", email: "other@outsider.in" },
      ],
      partnerOrgs: [{ id: "ppo_1", project_id: "prj_1", org_id: "org_partner", scope: "viewer", status: "active" }],
      partnerMembers: [{ project_id: "prj_1", org_id: "org_partner", profile_id: "u_partner", role: "partner_viewer" }],
      projects: [{ id: "prj_1", org_id: "org_owner", name: "Cyber Heights", type: "construction", budget: 50000000 }],
      tasks: [],
      dprs: [],
      invoices: [],
      expenses: [],
      boqItems: [],
      purchaseOrders: [],
      drawings: [],
      invitations: [],
      signupRequests: [],
      resendEvents: [],
      planPayments: [],
    };
    db = createMockD1(state);
  });

  it("enforces org membership in assertTenantContext", async () => {
    const ctx = await assertTenantContext(db, "u_owner", "org_owner");
    expect(ctx.orgId).toBe("org_owner");
    expect(ctx.isAdmin).toBe(true);

    await expect(assertTenantContext(db, "u_outsider", "org_owner")).rejects.toThrow(TenantSecurityError);
  });

  it("allows owner & active partner to read project, blocks outsider", async () => {
    const projects = new ProjectRepository(db);
    const ownerCtx = await assertTenantContext(db, "u_owner", "org_owner");
    const partnerCtx = await assertTenantContext(db, "u_partner", "org_partner");
    const outsiderCtx = await assertTenantContext(db, "u_outsider", "org_outsider");

    expect(await projects.listProjects(ownerCtx)).toHaveLength(1);
    expect(await projects.listProjects(partnerCtx)).toHaveLength(1);
    expect(await projects.listProjects(outsiderCtx)).toHaveLength(0);
    expect(await projects.getProjectById(outsiderCtx, "prj_1")).toBeNull();
  });

  it("allows owner writes & partner reads on SiteOps, blocks partner writes", async () => {
    const siteOps = new SiteOpsRepository(db);
    const ownerCtx = await assertTenantContext(db, "u_owner", "org_owner");
    const partnerCtx = await assertTenantContext(db, "u_partner", "org_partner");

    await siteOps.createTask(ownerCtx, "prj_1", { id: "tsk_1", title: "Pour Slab 1" });
    await siteOps.createDprMessage(ownerCtx, "prj_1", { id: "dpr_1", transcriptText: "Slab 1 poured" });

    expect(await siteOps.listTasks(partnerCtx, "prj_1")).toHaveLength(1);
    expect(await siteOps.listDprMessages(partnerCtx, "prj_1")).toHaveLength(1);

    await expect(siteOps.createTask(partnerCtx, "prj_1", { id: "tsk_2", title: "Hack" })).rejects.toThrow(
      TenantSecurityError
    );
    await expect(siteOps.updateTaskStatus(partnerCtx, "prj_1", "tsk_1", "done")).rejects.toThrow(
      TenantSecurityError
    );
  });

  it("strictly blocks partner orgs from money tables (invoices, expenses, BOQ, POs)", async () => {
    const finance = new FinanceRepository(db);
    const procurement = new ProcurementAndDesignRepository(db);
    const ownerCtx = await assertTenantContext(db, "u_owner", "org_owner");
    const partnerCtx = await assertTenantContext(db, "u_partner", "org_partner");

    await finance.createInvoice(ownerCtx, "prj_1", {
      id: "inv_1",
      invoiceNumber: "INV-001",
      issueDate: "2026-11-25",
      subtotal: 100000,
      gstRate: 18,
      tdsRate: 2,
    });
    const invoices = await finance.listInvoices(ownerCtx, "prj_1");
    expect(invoices).toHaveLength(1);
    expect((invoices[0] as { total_amount: number }).total_amount).toBe(116000);

    await procurement.createBoqItem(ownerCtx, "prj_1", {
      id: "boq_1",
      itemName: "M25 Concrete",
      qty: 10,
      rate: 5500,
    });

    await expect(finance.listInvoices(partnerCtx, "prj_1")).rejects.toThrow(TenantSecurityError);
    await expect(finance.listExpenses(partnerCtx, "prj_1")).rejects.toThrow(TenantSecurityError);
    await expect(procurement.listBoqItems(partnerCtx, "prj_1")).rejects.toThrow(TenantSecurityError);
    await expect(procurement.listPurchaseOrders(partnerCtx, "prj_1")).rejects.toThrow(TenantSecurityError);

    // Drawings remain readable by partner, writable only by owner
    await procurement.createDrawing(ownerCtx, "prj_1", {
      id: "drw_1",
      title: "Ground Floor Plan",
      drawingNumber: "A-101",
      currentFileKey: "prj_1/a101.pdf",
    });
    expect(await procurement.listDrawings(partnerCtx, "prj_1")).toHaveLength(1);
    await expect(
      procurement.createDrawing(partnerCtx, "prj_1", {
        id: "drw_2",
        title: "Unauthorized",
        drawingNumber: "A-102",
        currentFileKey: "prj_1/a102.pdf",
      })
    ).rejects.toThrow(TenantSecurityError);
  });

  it("handles org invitations, member removal, signup requests, resend webhooks, and plan payments", async () => {
    const orgAdmin = new OrgAdminRepository(db);
    const ownerCtx = await assertTenantContext(db, "u_owner", "org_owner");
    const nonAdminCtx = { ...ownerCtx, isAdmin: false };

    await expect(
      orgAdmin.inviteOrgMember(nonAdminCtx, { id: "invt_0", email: "x@y.com", role: "viewer", token: "tok0" })
    ).rejects.toThrow(TenantSecurityError);

    await orgAdmin.inviteOrgMember(ownerCtx, { id: "invt_1", email: "eng@builder.in", role: "engineer", token: "tok1" });
    expect(state.invitations).toHaveLength(1);

    await orgAdmin.submitSignupRequest({
      id: "sr_1",
      firmName: "Apex Infra",
      contactName: "Ramesh",
      email: "ramesh@apex.in",
      plan: "pro",
    });
    expect(state.signupRequests).toHaveLength(1);

    await orgAdmin.recordResendEvent({
      id: "rde_1",
      event: "delivered",
      rawEvent: "email.delivered",
      messageId: "msg_123",
      toEmail: "ramesh@apex.in",
      payload: { ok: true },
    });
    expect(state.resendEvents).toHaveLength(1);

    await orgAdmin.recordPlanPayment(ownerCtx, {
      id: "pp_1",
      plan: "pro",
      period: "monthly",
      amountPaise: 353988,
      linkId: "plink_1",
    });
    expect(state.planPayments).toHaveLength(1);

    await expect(orgAdmin.removeOrgMember(ownerCtx, "u_owner")).rejects.toThrow(TenantSecurityError);
  });
});
