/**
 * SiteTrack Pro — Cloudflare Workers Finance Repository
 *
 * Strictly owner-org scoped: partner orgs never gain read or write access
 * to project money tables (invoices, expenses).
 */

import type { SecurityContext } from "../middleware/tenant";
import { assertProjectOwnerOrg } from "./projectAccess";

export class FinanceRepository {
  constructor(private db: D1Database) {}

  async listInvoices(ctx: SecurityContext, projectId: string) {
    await assertProjectOwnerOrg(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM invoices WHERE project_id = ? ORDER BY issue_date DESC, created_at DESC`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createInvoice(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      invoiceNumber: string;
      issueDate: string;
      dueDate?: string;
      subtotal: number;
      gstRate?: number;
      tdsRate?: number;
    }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId);
    const gstRate = input.gstRate ?? 18;
    const tdsRate = input.tdsRate ?? 0;
    const gstAmount = Math.round(input.subtotal * (gstRate / 100) * 100) / 100;
    const tdsAmount = Math.round(input.subtotal * (tdsRate / 100) * 100) / 100;
    const totalAmount = Math.round((input.subtotal + gstAmount - tdsAmount) * 100) / 100;

    await this.db
      .prepare(
        `INSERT INTO invoices (id, project_id, invoice_number, issue_date, due_date, subtotal, gst_rate, gst_amount, tds_rate, tds_amount, total_amount, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        projectId,
        input.invoiceNumber,
        input.issueDate,
        input.dueDate || null,
        input.subtotal,
        gstRate,
        gstAmount,
        tdsRate,
        tdsAmount,
        totalAmount,
        ctx.userId
      )
      .run();
  }

  async listExpenses(ctx: SecurityContext, projectId: string) {
    await assertProjectOwnerOrg(this.db, ctx, projectId);
    const { results } = await this.db
      .prepare(`SELECT * FROM expenses WHERE project_id = ? ORDER BY expense_date DESC, created_at DESC`)
      .bind(projectId)
      .all();
    return results || [];
  }

  async createExpense(
    ctx: SecurityContext,
    projectId: string,
    input: {
      id: string;
      category: string;
      description: string;
      amount: number;
      gst?: number;
      paidTo?: string;
      paidVia?: string;
      refNo?: string;
      expenseDate?: string;
    }
  ) {
    await assertProjectOwnerOrg(this.db, ctx, projectId);
    await this.db
      .prepare(
        `INSERT INTO expenses (id, project_id, category, description, amount, gst, paid_to, paid_via, ref_no, expense_date, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?)`
      )
      .bind(
        input.id,
        projectId,
        input.category,
        input.description,
        input.amount,
        input.gst ?? 0,
        input.paidTo || null,
        input.paidVia || null,
        input.refNo || null,
        input.expenseDate || null,
        ctx.userId
      )
      .run();
  }
}
