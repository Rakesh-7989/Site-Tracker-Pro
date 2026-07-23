import { describe, it, expect } from "vitest";
import {
  listTemplates, upsertTemplate, removeTemplate, getTemplate,
  templateFromProject, applyProjectTemplate, applyBoqTemplate,
  INIT_TEMPLATES, TEMPLATE_KINDS,
} from "../src/lib/templates";

describe("templates — CRUD", () => {
  it("listTemplates returns empty for unknown org/kind", () => {
    expect(listTemplates({}, "org1", "boq")).toEqual([]);
    expect(listTemplates(INIT_TEMPLATES, "", "boq")).toEqual([]);
  });
  it("upsertTemplate adds a new template immutably", () => {
    const before = INIT_TEMPLATES;
    const after = upsertTemplate(before, "org1", "boq", { name: "Hi-rise BOQ", payload: [] });
    expect(after.org1.boq.length).toBe(1);
    expect(before.org1).toBeUndefined();
  });
  it("upsertTemplate replaces existing template by id", () => {
    let store = upsertTemplate({}, "org1", "boq", { name: "Original", payload: [] });
    const id = store.org1.boq[0].id;
    store = upsertTemplate(store, "org1", "boq", { id, name: "Renamed", payload: [{ a: 1 }] });
    expect(store.org1.boq.length).toBe(1);
    expect(store.org1.boq[0].name).toBe("Renamed");
    expect(store.org1.boq[0].payload).toEqual([{ a: 1 }]);
  });
  it("removeTemplate deletes by id", () => {
    let store = upsertTemplate({}, "org1", "boq", { name: "A", payload: [] });
    store = upsertTemplate(store, "org1", "boq", { name: "B", payload: [] });
    const idA = store.org1.boq[0].id;
    store = removeTemplate(store, "org1", "boq", idA);
    expect(store.org1.boq.length).toBe(1);
    expect(store.org1.boq[0].name).toBe("B");
  });
  it("getTemplate finds across kinds", () => {
    let store = upsertTemplate({}, "org1", "project", { name: "Proj", payload: {} });
    const id = store.org1.project[0].id;
    expect(getTemplate(store, "org1", id).name).toBe("Proj");
  });
  it("rejects invalid kind", () => {
    const next = upsertTemplate({}, "org1", "bogus", { name: "X" });
    expect(next).toEqual({});
  });
  it("rejects template without a name", () => {
    const next = upsertTemplate({}, "org1", "boq", { payload: [] });
    expect(next).toEqual({});
  });
});

describe("templates — capture from project", () => {
  it("captures milestones with start-relative day offsets", () => {
    const project = {
      id: "p1", name: "Test", start_date: "2025-01-01", expected_end_date: "2025-12-31",
      budget: 1000000,
    };
    const milestones = [
      { id: "m1", title: "Foundation", due_date: "2025-03-01" },
      { id: "m2", title: "Frame", due_date: "2025-06-01" },
    ];
    const tpl = templateFromProject(project, milestones, []);
    expect(tpl.payload.milestones.length).toBe(2);
    expect(tpl.payload.milestones[0].offset_days).toBe(59); // Jan 1 → Mar 1
    expect(tpl.payload.milestones[1].offset_days).toBe(151);
  });
  it("returns null for null project", () => {
    expect(templateFromProject(null, [], [])).toBeNull();
  });
});

describe("templates — apply project template", () => {
  it("creates project + milestones from a template", () => {
    const tpl = {
      kind: "project",
      name: "Hi-rise",
      payload: {
        project: { name_template: "Tower", budget_baseline: 50000000, duration_days: 365 },
        milestones: [
          { title: "Foundation", offset_days: 30 },
          { title: "Frame", offset_days: 180 },
        ],
        checklists: [{ title: "Pre-pour", type: "Quality", items: ["Reinforcement", "Cover"] }],
      },
    };
    const out = applyProjectTemplate(tpl, { name: "Tower B", start_date: "2025-01-01" });
    expect(out.project.name).toBe("Tower B");
    expect(out.project.budget).toBe(50000000);
    expect(out.milestones.length).toBe(2);
    expect(out.milestones[0].due_date).toBe("2025-01-31");
    expect(out.checklists.length).toBe(1);
    expect(out.checklists[0].items).toEqual(["Reinforcement", "Cover"]);
  });
  it("returns null for non-project template", () => {
    expect(applyProjectTemplate({ kind: "boq", payload: [] })).toBeNull();
  });
});

describe("templates — apply BOQ template", () => {
  it("regenerates IDs but keeps content", () => {
    const tpl = {
      kind: "boq",
      payload: [
        { code: "1.1", description: "Excavation", unit: "cum", qty: 100, rate: 250 },
        { code: "1.2", description: "PCC", unit: "cum", qty: 20, rate: 5400 },
      ],
    };
    const rows = applyBoqTemplate(tpl);
    expect(rows.length).toBe(2);
    expect(rows[0].code).toBe("1.1");
    expect(rows[0].id).toMatch(/^bq_/);
    expect(rows[0].sort).toBe(1);
  });
});

describe("templates — vocab", () => {
  it("TEMPLATE_KINDS lists exactly project/boq/checklist", () => {
    expect(TEMPLATE_KINDS.sort()).toEqual(["boq", "checklist", "project"].sort());
  });
});
