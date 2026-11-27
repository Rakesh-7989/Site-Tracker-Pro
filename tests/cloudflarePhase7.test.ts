import { describe, it, expect, beforeEach } from "vitest";
import { TenantSecurityError, type SecurityContext } from "../workers/api/src/middleware/tenant";
import { Phase7OperationsRepository } from "../workers/api/src/repositories/phase7OperationsRepository";

interface Phase7MockState {
  projects: Array<{ id: string; org_id: string }>;
  partnerOrgs: Array<{ project_id: string; org_id: string; status: string }>;
  boqItems: Array<{ id: string; project_id: string; item_name: string; qty: number; rate: number; amount: number; status: string }>;
  inventory: Array<{ id: string; project_id: string; material: string; qty: number; direction: string }>;
  labour: Array<{ id: string; project_id: string; name: string }>;
  attendance: Array<{ id: string; project_id: string; attendee_kind: string; attendee_name: string }>;
  channels: Array<{ id: string; org_id: string; name: string; is_archived: number }>;
  messages: Array<{ id: string; org_id: string; channel_id: string; parent_id: string | null; body: string; reply_count: number }>;
}

function createPhase7MockD1(state: Phase7MockState): D1Database {
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
          if (q.includes("FROM chat_channels WHERE id = ? AND org_id = ?")) {
            const [channelId, orgId] = args as [string, string];
            const ch = state.channels.find((c) => c.id === channelId && c.org_id === orgId);
            return (ch ? { id: ch.id } : null) as T;
          }
          return null as T;
        },
        async all() {
          const q = query.replace(/\s+/g, " ").trim();
          if (q.includes("FROM boq_items")) {
            const [projectId] = args as [string];
            return { results: state.boqItems.filter((b) => b.project_id === projectId), success: true, meta: {} };
          }
          if (q.includes("FROM inventory_transactions")) {
            const [projectId] = args as [string];
            return { results: state.inventory.filter((i) => i.project_id === projectId), success: true, meta: {} };
          }
          if (q.includes("FROM labour_register")) {
            const [projectId] = args as [string];
            return { results: state.labour.filter((l) => l.project_id === projectId), success: true, meta: {} };
          }
          if (q.includes("FROM attendance")) {
            const [projectId] = args as [string];
            return { results: state.attendance.filter((a) => a.project_id === projectId), success: true, meta: {} };
          }
          if (q.includes("FROM chat_channels")) {
            const [orgId] = args as [string];
            return { results: state.channels.filter((c) => c.org_id === orgId && c.is_archived === 0), success: true, meta: {} };
          }
          if (q.includes("FROM chat_messages")) {
            const [orgId, channelId] = args as [string, string];
            return { results: state.messages.filter((m) => m.org_id === orgId && m.channel_id === channelId), success: true, meta: {} };
          }
          return { results: [], success: true, meta: {} };
        },
        async run() {
          const q = query.replace(/\s+/g, " ").trim();
          if (q.startsWith("INSERT INTO boq_items")) {
            const [id, projectId, , itemName, , qty, rate, amount, status] = args as [string, string, string | null, string, string | null, number, number, number, string];
            state.boqItems.push({ id, project_id: projectId, item_name: itemName, qty, rate, amount, status });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE boq_items SET status = ?")) {
            const [status, itemId, projectId] = args as [string, string, string];
            const item = state.boqItems.find((b) => b.id === itemId && b.project_id === projectId);
            if (item) item.status = status;
            return { success: true, meta: { changes: item ? 1 : 0 } };
          }
          if (q.startsWith("INSERT INTO inventory_transactions")) {
            const [id, projectId, , material, , qty, direction] = args as [string, string, string | null, string, string | null, number, string];
            state.inventory.push({ id, project_id: projectId, material, qty, direction });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("INSERT INTO labour_register")) {
            const [id, projectId, name] = args as [string, string, string];
            state.labour.push({ id, project_id: projectId, name });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("INSERT INTO attendance")) {
            const [id, projectId, kind, , , name] = args as [string, string, string, string | null, string | null, string];
            state.attendance.push({ id, project_id: projectId, attendee_kind: kind, attendee_name: name });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("INSERT INTO chat_channels")) {
            const [id, orgId, name] = args as [string, string, string];
            state.channels.push({ id, org_id: orgId, name, is_archived: 0 });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("INSERT INTO chat_messages")) {
            const [id, orgId, channelId, parentId, , , body] = args as [string, string, string, string | null, string, string, string];
            state.messages.push({ id, org_id: orgId, channel_id: channelId, parent_id: parentId, body, reply_count: 0 });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE chat_messages SET reply_count")) {
            const [parentId, orgId] = args as [string, string];
            const parent = state.messages.find((m) => m.id === parentId && m.org_id === orgId);
            if (parent) parent.reply_count += 1;
            return { success: true, meta: { changes: parent ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return stmt as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("Cloudflare Phase 7 Operations Repository", () => {
  let state: Phase7MockState;
  let repo: Phase7OperationsRepository;
  const ctxA: SecurityContext = { userId: "u_a", email: "a@org.in", orgId: "org_a", role: "admin", isAdmin: true, partnerOrgIds: [] };
  const ctxPartner: SecurityContext = { userId: "u_b", email: "b@partner.in", orgId: "org_b", role: "viewer", isAdmin: false, partnerOrgIds: ["proj_1"] };

  beforeEach(() => {
    state = {
      projects: [{ id: "proj_1", org_id: "org_a" }],
      partnerOrgs: [{ project_id: "proj_1", org_id: "org_b", status: "active" }],
      boqItems: [],
      inventory: [],
      labour: [],
      attendance: [],
      channels: [],
      messages: [],
    };
    repo = new Phase7OperationsRepository(createPhase7MockD1(state));
  });

  it("supports BOQ, inventory, labour, and attendance for owner org while keeping partner read-only", async () => {
    const boq = await repo.createBoqItem(ctxA, "proj_1", { id: "boq_1", itemName: "M25 Concrete", qty: 10, rate: 5500 });
    expect(boq.amount).toBe(55000);
    expect(await repo.updateBoqItemStatus(ctxA, "proj_1", "boq_1", "approved")).toBe(true);

    await repo.recordInventoryTransaction(ctxA, "proj_1", { id: "inv_1", material: "Cement", qty: 50, direction: "inward" });
    await repo.createLabourWorker(ctxA, "proj_1", { id: "lab_1", name: "Raju", trade: "Mason", wage: 800 });
    await repo.recordAttendance(ctxA, "proj_1", { id: "att_1", attendeeKind: "labour", labourId: "lab_1", attendeeName: "Raju" });

    expect(await repo.listBoqItems(ctxPartner, "proj_1")).toHaveLength(1);
    expect(await repo.listInventoryTransactions(ctxPartner, "proj_1")).toHaveLength(1);
    expect(await repo.listLabourRegister(ctxPartner, "proj_1")).toHaveLength(1);
    expect(await repo.listAttendance(ctxPartner, "proj_1")).toHaveLength(1);

    await expect(
      repo.createBoqItem(ctxPartner, "proj_1", { id: "boq_2", itemName: "Steel", qty: 1, rate: 100 })
    ).rejects.toThrow(TenantSecurityError);
  });

  it("enforces org isolation on team chat channels and increments reply_count on thread replies", async () => {
    await repo.createChatChannel(ctxA, { id: "ch_1", name: "site-general" });
    await repo.postChatMessage(ctxA, "ch_1", { id: "m_1", body: "Pouring slab tomorrow" });
    await repo.postChatMessage(ctxA, "ch_1", { id: "m_2", parentId: "m_1", body: "Confirmed 6 AM" });

    const msgs = await repo.listChatMessages(ctxA, "ch_1") as Array<{ id: string; reply_count: number }>;
    expect(msgs).toHaveLength(2);
    expect(msgs.find((m) => m.id === "m_1")?.reply_count).toBe(1);

    await expect(repo.listChatMessages(ctxPartner, "ch_1")).rejects.toThrow(TenantSecurityError);
  });
});
