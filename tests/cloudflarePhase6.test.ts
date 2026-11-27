import { describe, it, expect, beforeEach } from "vitest";
import { assertTenantContext, TenantSecurityError } from "../workers/api/src/middleware/tenant";
import { TaskAndMilestoneRepository } from "../workers/api/src/repositories/taskAndMilestoneRepository";

interface MockState {
  orgMembers: Array<{ org_id: string; profile_id: string; role: string; is_admin: number; status: string; email: string }>;
  partnerOrgs: Array<{ id: string; project_id: string; org_id: string; scope: string; status: string }>;
  partnerMembers: Array<{ project_id: string; org_id: string; profile_id: string; role: string }>;
  projects: Array<{ id: string; org_id: string; name: string }>;
  tasks: Array<{
    id: string;
    project_id: string;
    milestone_id: string | null;
    title: string;
    description: string | null;
    assignee_id: string | null;
    status: string;
    priority: string;
    due_date: string | null;
  }>;
  milestones: Array<{
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    status: string;
    weight: number;
    order_index: number;
  }>;
  riskSignals: Array<{
    project_id: string;
    risk_score: number;
    risk_level: string;
    delay_probability: number;
    delay_days: number;
    burn_accelerating: number;
    updated_at: string;
  }>;
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
        return null;
      };

      const executeAll = (): unknown[] => {
        if (q.includes("FROM project_partner_members")) {
          const [userId] = args as [string];
          return state.partnerMembers.filter((pm) => pm.profile_id === userId);
        }
        if (q.startsWith("SELECT * FROM tasks WHERE project_id = ?")) {
          return state.tasks.filter((t) => t.project_id === args[0]);
        }
        if (q.startsWith("SELECT * FROM milestones WHERE project_id = ?")) {
          return [...state.milestones]
            .filter((m) => m.project_id === args[0])
            .sort((a, b) => a.order_index - b.order_index);
        }
        if (q.startsWith("SELECT * FROM project_risk_signals WHERE project_id = ?")) {
          return state.riskSignals.filter((r) => r.project_id === args[0]);
        }
        return [];
      };

      const executeRun = (): number => {
        if (q.startsWith("INSERT INTO tasks")) {
          const [id, project_id, milestone_id, title, description, assignee_id, priority, due_date] = args as [
            string,
            string,
            string | null,
            string,
            string | null,
            string | null,
            string,
            string | null,
          ];
          state.tasks.push({
            id,
            project_id,
            milestone_id,
            title,
            description,
            assignee_id,
            status: "todo",
            priority,
            due_date,
          });
          return 1;
        }
        if (q.startsWith("UPDATE tasks SET status = ?")) {
          const [status, id, projectId] = args as [string, string, string];
          const t = state.tasks.find((item) => item.id === id && item.project_id === projectId);
          if (!t) return 0;
          t.status = status;
          return 1;
        }
        if (q.startsWith("INSERT INTO milestones")) {
          const [id, project_id, title, description, due_date, weight, order_index] = args as [
            string,
            string,
            string,
            string | null,
            string | null,
            number,
            number,
          ];
          state.milestones.push({
            id,
            project_id,
            title,
            description,
            due_date,
            status: "pending",
            weight,
            order_index,
          });
          return 1;
        }
        if (q.startsWith("UPDATE milestones SET status = ?")) {
          const [status, id, projectId] = args as [string, string, string];
          const m = state.milestones.find((item) => item.id === id && item.project_id === projectId);
          if (!m) return 0;
          m.status = status;
          return 1;
        }
        return 0;
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

describe("TaskAndMilestoneRepository (Cloudflare D1 Phase 6)", () => {
  let state: MockState;
  let db: D1Database;
  let repo: TaskAndMilestoneRepository;

  beforeEach(() => {
    state = {
      orgMembers: [
        { org_id: "org_owner", profile_id: "u_owner", role: "admin", is_admin: 1, status: "active", email: "owner@builder.in" },
        { org_id: "org_partner", profile_id: "u_partner", role: "admin", is_admin: 1, status: "active", email: "arch@studio.in" },
        { org_id: "org_outsider", profile_id: "u_outsider", role: "admin", is_admin: 1, status: "active", email: "other@outsider.in" },
      ],
      partnerOrgs: [{ id: "ppo_1", project_id: "prj_1", org_id: "org_partner", scope: "viewer", status: "active" }],
      partnerMembers: [{ project_id: "prj_1", org_id: "org_partner", profile_id: "u_partner", role: "partner_viewer" }],
      projects: [
        { id: "prj_1", org_id: "org_owner", name: "Cyber Heights" },
        { id: "prj_2", org_id: "org_outsider", name: "Outsider Tower" },
      ],
      tasks: [],
      milestones: [],
      riskSignals: [
        {
          project_id: "prj_1",
          risk_score: 54,
          risk_level: "high",
          delay_probability: 0.45,
          delay_days: 7,
          burn_accelerating: 1,
          updated_at: "2026-11-26T00:00:00Z",
        },
      ],
    };
    db = createMockD1(state);
    repo = new TaskAndMilestoneRepository(db);
  });

  it("supports owner milestone create, list, and status update", async () => {
    const ownerCtx = await assertTenantContext(db, "u_owner", "org_owner");

    await repo.createMilestone(ownerCtx, "prj_1", {
      id: "ms_2",
      title: "Superstructure",
      dueDate: "2026-12-30",
      weight: 2.0,
      orderIndex: 2,
    });
    await repo.createMilestone(ownerCtx, "prj_1", {
      id: "ms_1",
      title: "Foundation",
      dueDate: "2026-12-01",
      orderIndex: 1,
    });

    const list = await repo.listMilestones(ownerCtx, "prj_1");
    expect(list).toHaveLength(2);
    expect((list[0] as { id: string }).id).toBe("ms_1");
    expect((list[0] as { status: string }).status).toBe("pending");

    const updated = await repo.updateMilestoneStatus(ownerCtx, "prj_1", "ms_1", "completed");
    expect(updated).toBe(true);
    expect(state.milestones.find((m) => m.id === "ms_1")?.status).toBe("completed");

    // Cross-project update returns false
    expect(await repo.updateMilestoneStatus(ownerCtx, "prj_1", "ms_missing", "blocked")).toBe(false);
  });

  it("supports owner task create, list, and status update", async () => {
    const ownerCtx = await assertTenantContext(db, "u_owner", "org_owner");

    await repo.createTask(ownerCtx, "prj_1", {
      id: "tsk_1",
      title: "Excavate footings",
      milestoneId: "ms_1",
      priority: "high",
      dueDate: "2026-11-30",
    });

    const tasks = await repo.listTasks(ownerCtx, "prj_1");
    expect(tasks).toHaveLength(1);
    expect((tasks[0] as { priority: string; status: string }).priority).toBe("high");
    expect((tasks[0] as { status: string }).status).toBe("todo");

    const updated = await repo.updateTaskStatus(ownerCtx, "prj_1", "tsk_1", "in_progress");
    expect(updated).toBe(true);
    expect(state.tasks[0].status).toBe("in_progress");
  });

  it("allows partner reads on tasks, milestones, and risk signals while blocking partner writes", async () => {
    const ownerCtx = await assertTenantContext(db, "u_owner", "org_owner");
    const partnerCtx = await assertTenantContext(db, "u_partner", "org_partner");

    await repo.createMilestone(ownerCtx, "prj_1", { id: "ms_1", title: "Foundation" });
    await repo.createTask(ownerCtx, "prj_1", { id: "tsk_1", title: "Pour PCC" });

    expect(await repo.listMilestones(partnerCtx, "prj_1")).toHaveLength(1);
    expect(await repo.listTasks(partnerCtx, "prj_1")).toHaveLength(1);
    const risks = await repo.listRiskSignals(partnerCtx, "prj_1");
    expect(risks).toHaveLength(1);
    expect((risks[0] as { risk_level: string }).risk_level).toBe("high");

    await expect(repo.createTask(partnerCtx, "prj_1", { id: "tsk_2", title: "Unauthorized" })).rejects.toThrow(
      TenantSecurityError
    );
    await expect(repo.updateTaskStatus(partnerCtx, "prj_1", "tsk_1", "done")).rejects.toThrow(TenantSecurityError);
    await expect(repo.createMilestone(partnerCtx, "prj_1", { id: "ms_2", title: "Unauthorized" })).rejects.toThrow(
      TenantSecurityError
    );
    await expect(repo.updateMilestoneStatus(partnerCtx, "prj_1", "ms_1", "completed")).rejects.toThrow(
      TenantSecurityError
    );
  });

  it("blocks outsider orgs from reading or writing another tenant's project", async () => {
    const outsiderCtx = await assertTenantContext(db, "u_outsider", "org_outsider");

    await expect(repo.listTasks(outsiderCtx, "prj_1")).rejects.toThrow(TenantSecurityError);
    await expect(repo.listMilestones(outsiderCtx, "prj_1")).rejects.toThrow(TenantSecurityError);
    await expect(repo.listRiskSignals(outsiderCtx, "prj_1")).rejects.toThrow(TenantSecurityError);
    await expect(repo.createTask(outsiderCtx, "prj_1", { id: "tsk_x", title: "Hack" })).rejects.toThrow(
      TenantSecurityError
    );
    await expect(repo.createMilestone(outsiderCtx, "prj_1", { id: "ms_x", title: "Hack" })).rejects.toThrow(
      TenantSecurityError
    );
  });
});
