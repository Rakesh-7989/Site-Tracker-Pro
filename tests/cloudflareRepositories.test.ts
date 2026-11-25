import { describe, it, expect, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assertTenantContext, TenantSecurityError } from "../workers/api/src/middleware/tenant";
import { ProjectRepository } from "../workers/api/src/repositories/projectRepository";
import { SiteOpsRepository } from "../workers/api/src/repositories/siteOpsRepository";
import { FinanceRepository } from "../workers/api/src/repositories/financeRepository";
import { ProcurementAndDesignRepository } from "../workers/api/src/repositories/procurementAndDesignRepository";

function createD1Shim(sqlite: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          bound = values;
          return stmt;
        },
        async first<T = Record<string, unknown>>() {
          const row = sqlite.prepare(query).get(...(bound as never[])) as T | undefined;
          return row ?? null;
        },
        async all<T = Record<string, unknown>>() {
          const results = sqlite.prepare(query).all(...(bound as never[])) as T[];
          return { results, success: true, meta: {} };
        },
        async run() {
          const info = sqlite.prepare(query).run(...(bound as never[]));
          return { success: true, meta: { changes: Number(info.changes) } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

describe("Cloudflare D1 Workers Repositories & Tenant Isolation", () => {
  let sqlite: DatabaseSync;
  let db: D1Database;

  beforeAll(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const migrationsDir = join(process.cwd(), "cloudflare", "database", "migrations");
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
      sqlite.exec(readFileSync(join(migrationsDir, file), "utf8"));
    }

    // Seed 3 orgs: owner, active partner, and outsider
    sqlite.exec(`
      INSERT INTO users (id, email, full_name) VALUES
        ('u_owner', 'owner@builder.in', 'Owner Admin'),
        ('u_partner', 'arch@studio.in', 'Partner Architect'),
        ('u_outsider', 'other@outsider.in', 'Outsider');

      INSERT INTO organizations (id, slug, name, org_type) VALUES
        ('org_owner', 'builder-co', 'Builder Co', 'builder'),
        ('org_partner', 'studio-arch', 'Studio Arch', 'architecture_firm'),
        ('org_outsider', 'outsider-co', 'Outsider Co', 'contractor');

      INSERT INTO org_members (org_id, profile_id, role, is_admin, status) VALUES
        ('org_owner', 'u_owner', 'admin', 1, 'active'),
        ('org_partner', 'u_partner', 'admin', 1, 'active'),
        ('org_outsider', 'u_outsider', 'admin', 1, 'active');

      INSERT INTO projects (id, org_id, name, type, budget) VALUES
        ('prj_1', 'org_owner', 'Cyber Heights', 'construction', 50000000);

      INSERT INTO project_partner_orgs (id, project_id, org_id, scope, status) VALUES
        ('ppo_1', 'prj_1', 'org_partner', 'viewer', 'active');

      INSERT INTO project_partner_members (project_id, org_id, profile_id, role) VALUES
        ('prj_1', 'org_partner', 'u_partner', 'partner_viewer');
    `);

    db = createD1Shim(sqlite);
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
});
