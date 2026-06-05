// SiteTrack Pro — v3 route tree.
//
// React Router v6. The shell layout wraps the authenticated routes;
// /login is public. Unknown paths → 404. The dashboard is the index.
//
// Strangler note: this router only mounts when ?shell=v3 is present
// (see main.jsx). The legacy App.jsx remains the production default.

import { createBrowserRouter } from "react-router-dom";

import { ShellLayout } from "@/features/shell/ShellLayout";
import { LandingView } from "@/features/marketing/LandingView";
import { SignupView } from "@/features/marketing/SignupView";
import { ProjectsListView } from "@/features/shell/ProjectsListView";
import { CreateProjectView } from "@/features/shell/CreateProjectView";
import { NotFoundView } from "@/features/shell/PlaceholderView";
import { DetailView } from "@/features/project/DetailView";
import { RoleDashboard } from "@/features/dashboards/RoleDashboard";
import { DPRComposer } from "@/features/dpr/DPRComposer";
import { LoginScreenV3 } from "@/features/auth/LoginScreenV3";
import { RoleManager } from "@/features/admin/RoleManager";
import { SignupRequestsView } from "@/features/admin/SignupRequestsView";
import { PlatformOrgsView } from "@/features/admin/PlatformOrgsView";
import { PlatformUsersView } from "@/features/admin/PlatformUsersView";
import { PlatformDashboardView } from "@/features/admin/PlatformDashboardView";
import { OrgMembersView } from "@/features/org/OrgMembersView";
import { OrgDashboardView } from "@/features/org/OrgDashboardView";
import { OrgBillingView } from "@/features/org/OrgBillingView";
import { OrgActivityView } from "@/features/org/OrgActivityView";
import { OrgTemplatesView } from "@/features/org/OrgTemplatesView";
import { OrgApprovalsView } from "@/features/org/OrgApprovalsView";
import { OrgNotificationsView } from "@/features/org/OrgNotificationsView";
import { OrgIntegrationsView } from "@/features/org/OrgIntegrationsView";

export const router = createBrowserRouter([
  // ── Public routes (no auth) ──
  { path: "/", element: <LandingView /> },
  { path: "/signup", element: <SignupView /> },
  { path: "/login", element: <LoginScreenV3 /> },
  // ── Authenticated app (pathless layout route wraps RequireSession) ──
  {
    element: <ShellLayout />,
    children: [
      { path: "dashboard", element: <RoleDashboard /> },
      { path: "projects", element: <ProjectsListView /> },
      { path: "projects/new", element: <CreateProjectView /> },
      { path: "projects/:id", element: <DetailView /> },
      { path: "projects/:id/:tab", element: <DetailView /> },
      { path: "dpr", element: <DPRComposer /> },
      { path: "activity", element: <OrgActivityView /> },
      { path: "audit", element: <OrgActivityView /> },
      { path: "org", element: <OrgDashboardView /> },
      { path: "org/members", element: <OrgMembersView /> },
      { path: "org/billing", element: <OrgBillingView /> },
      { path: "org/templates", element: <OrgTemplatesView /> },
      { path: "org/approvals", element: <OrgApprovalsView /> },
      { path: "org/notifications", element: <OrgNotificationsView /> },
      { path: "org/integrations", element: <OrgIntegrationsView /> },
      { path: "admin", element: <PlatformDashboardView /> },
      { path: "admin/users", element: <PlatformUsersView /> },
      { path: "admin/orgs", element: <PlatformOrgsView /> },
      { path: "admin/roles", element: <RoleManager /> },
      { path: "admin/signups", element: <SignupRequestsView /> },
    ],
  },
  // Public catch-all 404 (works signed-out too).
  { path: "*", element: <NotFoundView /> },
]);
