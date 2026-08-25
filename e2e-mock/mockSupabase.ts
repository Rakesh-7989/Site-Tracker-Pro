// Playwright mock-Supabase harness for the role-access e2e suite.
//
// Renders the REAL v3 router + shell with zero credentials or live DB:
//   1. seedSession() plants a fake Supabase session in localStorage under
//      the key supabase-js derives from the bundled public URL
//      (`sb-<ref>-auth-token`). supabase-js getSession() reads this with NO
//      network when the shape is valid + expires_at is far future.
//   2. mockSupabase() route-intercepts every request to the Supabase host
//      and answers the REST queries fetchAuthSession() issues per table
//      (profiles, org_members, project_members, staff_area_grants, plus the
//      no-op override/custom-role tables) with per-role canned rows.
//
// Roles are keyed by the identity profile.role; the project_members rows
// drive the project-tier gates; org_members drives the org gates.

import type { Page, Route } from "@playwright/test";

export const SUPABASE_REF = "nntkxojdeyziemdhyjvg";
export const STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;

const FUTURE_EPOCH_S = Math.floor(Date.now() / 1000) + 7200;

export type MockIdentityRole =
  | "owner"
  | "orgadmin"
  | "pm"
  | "client"
  | "superadmin"
  | "consultant_head"
  | "design_architect_interior";

export interface MockProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  is_staff: boolean;
  staff_tier?: "owner" | "head" | "member" | null;
  profile_completed: boolean;
}

export interface MockOrgRow {
  org_id: string;
  role: string;
  joined_at: string;
  organizations: { id: string; name: string; slug: string; segment: string | null; enabled_modules: string[] | null };
}

export interface MockProjectRow {
  project_id: string;
  role: string;
  assigned_by: string | null;
  assigned_at: string;
  removed_at: string | null;
  projects: { id: string; name: string; type: string };
}

export interface MockSession {
  profile: MockProfile;
  orgs?: MockOrgRow[];
  projects?: MockProjectRow[];
}

const PROFILE_COMPLETED_TRUE = true;
const staffTierFor = (role: string): MockProfile["staff_tier"] =>
  role === "superadmin" ? "owner" : null;

export function mockSessionFor(role: MockIdentityRole): MockSession {
  // Generate a UUID-like ID for the role - use a hash-like approach for long names
  const roleHash = role.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0).toString(16).padStart(8, '0');
  const id = `00000000-0000-0000-0000-${roleHash}`.slice(0, 36);
  const email = `${role}@mock.test`;
  switch (role) {
    case "owner":
      return {
        profile: {
          id, email, name: "Owner", role: "owner", is_staff: false,
          staff_tier: null, profile_completed: PROFILE_COMPLETED_TRUE,
        },
        orgs: [{
          org_id: "11111111-1111-1111-1111-111111111111", role: "admin",
          joined_at: "2026-01-01T00:00:00Z",
          organizations: { id: "11111111-1111-1111-1111-111111111111", name: "Mock Org", slug: "mock-org", segment: "multiple", enabled_modules: null, plan: "enterprise" },
        }],
        projects: [],
      };
    case "orgadmin":
      return {
        profile: {
          id, email, name: "Org Admin", role: "orgadmin", is_staff: false,
          staff_tier: null, profile_completed: PROFILE_COMPLETED_TRUE,
        },
        orgs: [{
          org_id: "11111111-1111-1111-1111-111111111111", role: "admin",
          joined_at: "2026-01-01T00:00:00Z",
          organizations: { id: "11111111-1111-1111-1111-111111111111", name: "Mock Org", slug: "mock-org", segment: "multiple", enabled_modules: null, plan: "enterprise" },
        }],
        projects: [{
          project_id: "22222222-2222-2222-2222-222222222222", role: "project_admin",
          assigned_by: id, assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
          projects: { id: "22222222-2222-2222-2222-222222222222", name: "Mock Project", type: "construction" },
        }],
      };
    case "pm":
      return {
        profile: {
          id, email, name: "PM", role: "pm", is_staff: false,
          staff_tier: null, profile_completed: PROFILE_COMPLETED_TRUE,
        },
        orgs: [{
          org_id: "11111111-1111-1111-1111-111111111111", role: "member",
          joined_at: "2026-01-01T00:00:00Z",
          organizations: { id: "11111111-1111-1111-1111-111111111111", name: "Mock Org", slug: "mock-org", segment: "multiple", enabled_modules: null, plan: "enterprise" },
        }],
        projects: [
          {
            project_id: "22222222-2222-2222-2222-222222222222", role: "pm",
            assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
            projects: { id: "22222222-2222-2222-2222-222222222222", name: "Mock Project", type: "construction", status: "active", org_id: "11111111-1111-1111-1111-111111111111", location: "Hyderabad", start_date: "2026-01-01", industry_subtype: "commercial" },
          },
          {
            project_id: "33333333-3333-3333-3333-333333333333", role: "client",
            assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
            projects: { id: "33333333-3333-3333-3333-333333333333", name: "Consulting Project", type: "consultant", status: "active", org_id: "11111111-1111-1111-1111-111111111111", location: "Hyderabad", start_date: "2026-01-01", industry_subtype: null },
          },
          {
            project_id: "44444444-4444-4444-4444-444444444444", role: "pm",
            assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
            projects: { id: "44444444-4444-4444-4444-444444444444", name: "Interior Project", type: "interior", status: "active", org_id: "11111111-1111-1111-1111-111111111111", location: "Hyderabad", start_date: "2026-01-01", industry_subtype: null },
          },
        ],
      };
    case "client":
      return {
        profile: {
          id, email, name: "Client", role: "client", is_staff: false,
          staff_tier: null, profile_completed: PROFILE_COMPLETED_TRUE,
        },
        orgs: [{
          org_id: "11111111-1111-1111-1111-111111111111", role: "member",
          joined_at: "2026-01-01T00:00:00Z",
          organizations: { id: "11111111-1111-1111-1111-111111111111", name: "Mock Org", slug: "mock-org", segment: "multiple", enabled_modules: null, plan: "enterprise" },
        }],
        projects: [{
          project_id: "22222222-2222-2222-2222-222222222222", role: "client",
          assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
          projects: { id: "22222222-2222-2222-2222-222222222222", name: "Mock Project", type: "construction" },
        }],
      };
    case "superadmin":
      return {
        profile: {
          id, email, name: "Super Admin", role: "superadmin", is_staff: true,
          staff_tier: staffTierFor("superadmin"), profile_completed: PROFILE_COMPLETED_TRUE,
        },
        orgs: [],
        projects: [],
      };
    case "design_architect_interior":
      return {
        profile: {
          id, email, name: "Design Architect", role: "design_architect_interior", is_staff: false,
          staff_tier: null, profile_completed: PROFILE_COMPLETED_TRUE,
        },
        orgs: [{
          org_id: "11111111-1111-1111-1111-111111111111", role: "member",
          joined_at: "2026-01-01T00:00:00Z",
          organizations: { id: "11111111-1111-1111-1111-111111111111", name: "Mock Org", slug: "mock-org", segment: "interior", enabled_modules: null, plan: "enterprise" },
        }],
        projects: [
          {
            project_id: "22222222-2222-2222-2222-222222222222", role: "design_architect_interior",
            assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
            projects: { id: "22222222-2222-2222-2222-222222222222", name: "Interior Project", type: "interior", status: "active", org_id: "11111111-1111-1111-1111-111111111111", location: "Hyderabad", start_date: "2026-01-01", industry_subtype: null },
          },
          {
            project_id: "44444444-4444-4444-4444-444444444444", role: "design_architect_interior",
            assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
            projects: { id: "44444444-4444-4444-4444-444444444444", name: "Interior Project 2", type: "interior", status: "active", org_id: "11111111-1111-1111-1111-111111111111", location: "Hyderabad", start_date: "2026-01-01", industry_subtype: null },
          },
        ],
      };
    case "consultant_head":
      return {
        profile: {
          id, email, name: "Consultant Head", role: "consultant_head", is_staff: false,
          staff_tier: null, profile_completed: PROFILE_COMPLETED_TRUE,
        },
        orgs: [{
          org_id: "11111111-1111-1111-1111-111111111111", role: "member",
          joined_at: "2026-01-01T00:00:00Z",
          organizations: { id: "11111111-1111-1111-1111-111111111111", name: "Mock Org", slug: "mock-org", segment: "consultancy", enabled_modules: null, plan: "enterprise" },
        }],
        projects: [
          {
            project_id: "22222222-2222-2222-2222-222222222222", role: "consultant_head",
            assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
            projects: { id: "22222222-2222-2222-2222-222222222222", name: "Consulting Project", type: "consultant", status: "active", org_id: "11111111-1111-1111-1111-111111111111", location: "Hyderabad", start_date: "2026-01-01", industry_subtype: null },
          },
          {
            project_id: "33333333-3333-3333-3333-333333333333", role: "consultant_head",
            assigned_by: "00000000-0000-0000-0000-000000000001", assigned_at: "2026-01-01T00:00:00Z", removed_at: null,
            projects: { id: "33333333-3333-3333-3333-333333333333", name: "Consulting Project 2", type: "consultant", status: "active", org_id: "11111111-1111-1111-1111-111111111111", location: "Hyderabad", start_date: "2026-01-01", industry_subtype: null },
          },
        ],
      };
  }
}

/** Session JSON exactly as supabase-js persists it (getSession reads it offline). */
export function buildSessionJson(s: MockSession): Record<string, unknown> {
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: FUTURE_EPOCH_S,
    user: {
      id: s.profile.id,
      aud: "authenticated",
      role: "authenticated",
      email: s.profile.email,
      phone: "",
      last_sign_in_at: "2026-01-01T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  };
}

/** Plant the fake session in localStorage before any app JS runs. */
export async function seedSession(page: Page, session: MockSession): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); },
    { key: STORAGE_KEY, value: buildSessionJson(session) },
  );
}

const JSON_RESP = { "content-type": "application/json" };

function jsonReply(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ status: 200, headers: JSON_RESP, body: JSON.stringify(body) });
}

/**
 * Route-intercept the Supabase host: answer the REST tables fetchAuthSession()
 * queries with per-role canned rows. Everything else (rpc/set_tenant_context,
 * auth/v1 token refresh, storage) is neutered so the app never hits the network.
 */
export async function mockSupabase(page: Page, s: MockSession): Promise<void> {
  await page.route(`**://${SUPABASE_REF}.supabase.co/**`, async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;

    // Non-REST (auth token refresh, storage, realtime) → return a benign error;
    // the app treats auth failures as signed-out, which we never trigger because
    // the seeded session never expires during the test.
    if (!pathname.startsWith("/rest/v1/")) {
      await route.fulfill({ status: 400, headers: JSON_RESP, body: JSON.stringify({ error: "mocked-off" }) });
      return;
    }

    const table = pathname.slice("/rest/v1/".length);
    const query = url.searchParams;
    const projectId = query.get("id")?.replace("eq.", "");
    switch (table) {
      case "profiles":
        await jsonReply(route, s.profile);
        return;
      case "org_members":
        await jsonReply(route, s.orgs ?? []);
        return;
      case "project_members":
        await jsonReply(route, s.projects ?? []);
        return;
      case "projects": {
        const allProjects = (s.projects ?? []).map(p => p.projects);
    const _projectId = query.get("id")?.replace("eq.", "");
        if (projectId) {
          const match = allProjects.find(p => p.id === projectId);
          await jsonReply(route, match ? [match] : []);
        } else {
          await jsonReply(route, allProjects);
        }
        return;
      }
      case "staff_area_grants":
        await jsonReply(route, s.profile.is_staff && s.profile.staff_tier === "member" ? [] : []);
        return;
      case "role_capability_overrides":
      case "org_member_roles":
      case "org_role_capabilities":
        await jsonReply(route, []);
        return;
      default:
        // Unknown table (e.g. a project-tab query) → empty array keeps the app
        // rendering instead of erroring on a network call.
        await jsonReply(route, []);
        return;
    }
  });
}

/** Convenience: seed + mock + navigate to the app root. */
export async function openMockedApp(page: Page, s: MockSession, path = "/"): Promise<void> {
  await seedSession(page, s);
  await mockSupabase(page, s);
  await page.goto(path, { waitUntil: "domcontentloaded" });
}