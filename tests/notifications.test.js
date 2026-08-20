import { describe, it, expect } from "vitest";
import { notifsForUser } from "../src/lib/notifications";

const arch  = { id: "u1", name: "Arjun", email: "a@buildco.in", role: "architect" };
const pm    = { id: "u2", name: "Priya", email: "p@buildco.in", role: "pm" };
const cli   = { id: "u3", name: "Vikram", email: "vikram@client.in", role: "client" };
const sup   = { id: "u100", name: "Rakesh", email: "admin@sitetrackpro.in", role: "superadmin" };
const con   = { id: "u4", name: "Karthik", email: "k@kb.in", role: "contractor" };

const PROJECTS = [
  { id: "p1", client_email: "vikram@client.in" },
  { id: "p2", client_email: "other@x.in" },
  { id: "p3", client_email: "vikram@client.in" },
];

const NOTIFS = [
  { id: "n1", pid: "p1", title: "Update on p1" },
  { id: "n2", pid: "p2", title: "Update on p2" },
  { id: "n3", pid: "p3", title: "Update on p3" },
  { id: "n4", title: "Global system message (no pid)" },
];

describe("notifsForUser", () => {
  it("client sees ONLY notifications for projects matching their email", () => {
    const out = notifsForUser(NOTIFS, cli, PROJECTS);
    expect(out.map(n => n.id).sort()).toEqual(["n1", "n3"]);
  });

  it("client does NOT see notifications for unrelated projects", () => {
    const out = notifsForUser(NOTIFS, cli, PROJECTS);
    expect(out.find(n => n.id === "n2")).toBeUndefined();
  });

  it("client does NOT see global (no-pid) notifications", () => {
    const out = notifsForUser(NOTIFS, cli, PROJECTS);
    expect(out.find(n => n.id === "n4")).toBeUndefined();
  });

  it("superadmin sees all notifications across all projects", () => {
    const out = notifsForUser(NOTIFS, sup, PROJECTS);
    expect(out).toHaveLength(4);
  });

  it("architect sees all notifications (project-scoped filter is permissive for non-clients)", () => {
    const out = notifsForUser(NOTIFS, arch, PROJECTS);
    // visibleProjectsForUser returns all projects for non-clients in our model
    expect(out).toHaveLength(4);
  });

  it("pm sees all project notifications plus global", () => {
    const out = notifsForUser(NOTIFS, pm, PROJECTS);
    expect(out).toHaveLength(4);
  });

  it("contractor sees all project notifications plus global", () => {
    const out = notifsForUser(NOTIFS, con, PROJECTS);
    expect(out).toHaveLength(4);
  });

  it("returns empty array for null user", () => {
    expect(notifsForUser(NOTIFS, null, PROJECTS)).toEqual([]);
  });

  it("returns empty array for empty notifs", () => {
    expect(notifsForUser([], cli, PROJECTS)).toEqual([]);
    expect(notifsForUser(null, cli, PROJECTS)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const before = JSON.stringify(NOTIFS);
    notifsForUser(NOTIFS, cli, PROJECTS);
    expect(JSON.stringify(NOTIFS)).toBe(before);
  });

  it("Tech Lead HIGH-2 regression: a client never sees another client's project notification", () => {
    // The exact bug fix: previously ClientPortal showed ALL notifs.
    const out = notifsForUser(NOTIFS, cli, PROJECTS);
    const leakedIds = out.filter(n => {
      const proj = PROJECTS.find(p => p.id === n.pid);
      return proj && proj.client_email !== cli.email;
    });
    expect(leakedIds).toHaveLength(0);
  });
});
