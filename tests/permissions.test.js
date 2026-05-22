import { describe, it, expect } from "vitest";
import {
  PERMS,
  can,
  visibleProjectsForUser,
  canAccessProject,
  fallbackViewForUser,
  canOpenView,
  canUseQuickCapture,
  drawingKey,
  isReleasedCurrentDrawing,
} from "../src/lib/permissions.js";

const arch = { id: "u1", name: "Arjun", email: "a@buildco.in", role: "architect" };
const pm = { id: "u2", name: "Priya", email: "p@buildco.in", role: "pm" };
const con = { id: "u3", name: "Karthik", email: "k@karthikbuilders.in", role: "contractor" };
const cli = { id: "u4", name: "Vikram", email: "vikram@client.in", role: "client" };

const project = (overrides = {}) => ({
  id: "p1",
  name: "Skyline",
  client_email: "vikram@client.in",
  ...overrides,
});

describe("PERMS shape", () => {
  it("defines all four roles", () => {
    expect(Object.keys(PERMS).sort()).toEqual(["architect", "client", "contractor", "pm"]);
  });

  it("client role has zero write capabilities", () => {
    const c = PERMS.client;
    const writeFlags = [
      "createProject", "editProgress", "addUpdate", "manageTeam",
      "markAttendance", "addExpense", "deleteExpense", "share",
      "changeMilestone", "addIssue", "resolveIssue", "addMaterial",
      "deleteMaterial", "manageDrawings",
    ];
    writeFlags.forEach(f => expect(c[f]).toBe(false));
  });

  it("contractor cannot see invoices, budget, attendance, labour, team", () => {
    const tabs = PERMS.contractor.tabs;
    ["invoices", "budget", "attendance", "labour", "team"].forEach(t =>
      expect(tabs.includes(t)).toBe(false)
    );
  });

  it("client cannot see internal financial tabs", () => {
    const tabs = PERMS.client.tabs;
    ["budget", "po", "labour", "rabills", "rfi", "issues"].forEach(t =>
      expect(tabs.includes(t)).toBe(false)
    );
  });

  it("client can see boq tab (read-only)", () => {
    expect(PERMS.client.tabs.includes("boq")).toBe(true);
  });

  it("contractor + architect + pm all see the stock ledger", () => {
    expect(PERMS.architect.tabs.includes("ledger")).toBe(true);
    expect(PERMS.pm.tabs.includes("ledger")).toBe(true);
    expect(PERMS.contractor.tabs.includes("ledger")).toBe(true);
  });

  it("client never sees the stock ledger (financial sensitivity)", () => {
    expect(PERMS.client.tabs.includes("ledger")).toBe(false);
  });

  it("BOQ tab visibility — Tech Lead regression matrix", () => {
    expect(PERMS.architect.tabs.includes("boq")).toBe(true);
    expect(PERMS.pm.tabs.includes("boq")).toBe(true);
    expect(PERMS.client.tabs.includes("boq")).toBe(true);
    expect(PERMS.contractor.tabs.includes("boq")).toBe(false);
  });

  it("invoices are never visible to contractor (financial exposure fix)", () => {
    expect(PERMS.contractor.tabs.includes("invoices")).toBe(false);
  });
});

describe("can(user, capability)", () => {
  it("returns true only when role grants the capability", () => {
    expect(can(arch, "createProject")).toBe(true);
    expect(can(pm, "createProject")).toBe(false);
    expect(can(cli, "addUpdate")).toBe(false);
    expect(can(con, "addIssue")).toBe(true);
  });

  it("returns false for null/undefined user", () => {
    expect(can(null, "createProject")).toBe(false);
    expect(can(undefined, "createProject")).toBe(false);
  });

  it("returns false for unknown capability", () => {
    expect(can(arch, "destroyEverything")).toBe(false);
  });
});

describe("client project visibility", () => {
  it("client sees only projects matching their email", () => {
    const ps = [
      project({ id: "p1", client_email: "vikram@client.in" }),
      project({ id: "p2", client_email: "other@x.in" }),
    ];
    const visible = visibleProjectsForUser(ps, cli);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("p1");
  });

  it("non-client roles see all projects", () => {
    const ps = [project({ id: "p1" }), project({ id: "p2", client_email: "x@y.in" })];
    expect(visibleProjectsForUser(ps, arch)).toHaveLength(2);
    expect(visibleProjectsForUser(ps, pm)).toHaveLength(2);
    expect(visibleProjectsForUser(ps, con)).toHaveLength(2);
  });

  it("canAccessProject blocks client from unrelated projects", () => {
    expect(canAccessProject(cli, project({ client_email: "vikram@client.in" }))).toBe(true);
    expect(canAccessProject(cli, project({ client_email: "other@x.in" }))).toBe(false);
    expect(canAccessProject(arch, project({ client_email: "other@x.in" }))).toBe(true);
  });

  it("canAccessProject returns false on missing inputs", () => {
    expect(canAccessProject(null, project())).toBe(false);
    expect(canAccessProject(cli, null)).toBe(false);
  });
});

describe("view routing", () => {
  it("fallbackViewForUser sends client to client portal", () => {
    expect(fallbackViewForUser(cli)).toBe("client");
    expect(fallbackViewForUser(arch)).toBe("dashboard");
    expect(fallbackViewForUser(null)).toBe("dashboard");
  });

  it("canOpenView blocks create for non-architects", () => {
    expect(canOpenView(arch, "create")).toBe(true);
    expect(canOpenView(pm, "create")).toBe(false);
    expect(canOpenView(con, "create")).toBe(false);
    expect(canOpenView(cli, "create")).toBe(false);
  });

  it("canOpenView blocks unauthenticated entirely", () => {
    expect(canOpenView(null, "dashboard")).toBe(false);
  });

  it("logout and detail are always open for authed users", () => {
    expect(canOpenView(cli, "logout")).toBe(true);
    expect(canOpenView(cli, "detail")).toBe(true);
  });

  it("client cannot open analytics or activity", () => {
    expect(canOpenView(cli, "analytics")).toBe(false);
    expect(canOpenView(cli, "activity")).toBe(false);
  });
});

describe("quick capture & drawings", () => {
  it("clients cannot use quick capture (no field data entry)", () => {
    expect(canUseQuickCapture(arch)).toBe(true);
    expect(canUseQuickCapture(pm)).toBe(true);
    expect(canUseQuickCapture(con)).toBe(true);
    expect(canUseQuickCapture(cli)).toBe(false);
  });

  it("drawingKey normalizes title and type", () => {
    expect(drawingKey({ title: "  Floor Plan ", type: "Architectural" }))
      .toBe("floor plan::architectural");
  });

  it("drawingKey returns null for blank inputs (no collision)", () => {
    // Previously returned "::" for every blank drawing — collision risk.
    expect(drawingKey({})).toBe(null);
    expect(drawingKey({ title: "  ", type: "  " })).toBe(null);
    expect(drawingKey({ title: "Foo" })).toBe(null);
    expect(drawingKey({ type: "Architectural" })).toBe(null);
    expect(drawingKey(null)).toBe(null);
  });

  it("isReleasedCurrentDrawing requires status=current and released_to contains role", () => {
    const d1 = { status: "current", released_to: ["pm", "client"] };
    expect(isReleasedCurrentDrawing(d1, "pm")).toBe(true);
    expect(isReleasedCurrentDrawing(d1, "contractor")).toBe(false);

    const d2 = { status: "superseded", released_to: ["pm"] };
    expect(isReleasedCurrentDrawing(d2, "pm")).toBe(false);

    expect(isReleasedCurrentDrawing(null, "pm")).toBe(false);
  });
});
