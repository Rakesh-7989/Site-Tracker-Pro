// SiteTrack Pro — v3 route tree.
//
// React Router v7. The shell layout wraps the authenticated routes; the public
// landing / signup / legal / login sit outside it. Unknown paths → 404.
//
// Performance: the entry + first-paint views are imported eagerly; everything
// reached by navigation (the 28-tab project detail, all org + admin panels, the
// recharts-heavy Analytics view) is React.lazy() so it is NOT in the initial
// bundle. ShellLayout wraps <Outlet/> in <Suspense>, so lazy routes get a
// spinner while their chunk loads.

import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";

// ── Eager: entry + first paint + small ──────────────────────────────────────
import { ShellLayout } from "@/features/shell/ShellLayout";
import { LandingView } from "@/features/marketing/LandingView";
import { SignupView } from "@/features/marketing/SignupView";
import { PrivacyView, TermsView } from "@/features/marketing/LegalView";
import { LoginScreenV3 } from "@/features/auth/LoginScreenV3";
import { NotFoundView } from "@/features/shell/PlaceholderView";
import { RoleDashboard } from "@/features/dashboards/RoleDashboard";
import { ProjectsListView } from "@/features/shell/ProjectsListView";
import { CreateProjectView } from "@/features/shell/CreateProjectView";

// ── Lazy: loaded on navigation (keeps the initial bundle lean) ──────────────
const DetailView = lazy(() => import("@/features/project/DetailView").then(m => ({ default: m.DetailView })));
const DPRComposer = lazy(() => import("@/features/dpr/DPRComposer").then(m => ({ default: m.DPRComposer })));
const VendorsView = lazy(() => import("@/features/org/VendorsView").then(m => ({ default: m.VendorsView })));
const CalendarView = lazy(() => import("@/features/org/CalendarView").then(m => ({ default: m.CalendarView })));
const AnalyticsView = lazy(() => import("@/features/org/AnalyticsView").then(m => ({ default: m.AnalyticsView })));
const GlobalSearchView = lazy(() => import("@/features/org/GlobalSearchView").then(m => ({ default: m.GlobalSearchView })));
const CrossProjectPOsView = lazy(() => import("@/features/org/CrossProjectPOsView").then(m => ({ default: m.CrossProjectPOsView })));
const NotificationsView = lazy(() => import("@/features/org/NotificationsView").then(m => ({ default: m.NotificationsView })));
const OrgActivityView = lazy(() => import("@/features/org/OrgActivityView").then(m => ({ default: m.OrgActivityView })));
const OrgDashboardView = lazy(() => import("@/features/org/OrgDashboardView").then(m => ({ default: m.OrgDashboardView })));
const OrgMembersView = lazy(() => import("@/features/org/OrgMembersView").then(m => ({ default: m.OrgMembersView })));
const OrgBillingView = lazy(() => import("@/features/org/OrgBillingView").then(m => ({ default: m.OrgBillingView })));
const OrgTemplatesView = lazy(() => import("@/features/org/OrgTemplatesView").then(m => ({ default: m.OrgTemplatesView })));
const OrgApprovalsView = lazy(() => import("@/features/org/OrgApprovalsView").then(m => ({ default: m.OrgApprovalsView })));
const OrgNotificationsView = lazy(() => import("@/features/org/OrgNotificationsView").then(m => ({ default: m.OrgNotificationsView })));
const OrgIntegrationsView = lazy(() => import("@/features/org/OrgIntegrationsView").then(m => ({ default: m.OrgIntegrationsView })));
const RoleManager = lazy(() => import("@/features/admin/RoleManager").then(m => ({ default: m.RoleManager })));
const SignupRequestsView = lazy(() => import("@/features/admin/SignupRequestsView").then(m => ({ default: m.SignupRequestsView })));
const PlatformOrgsView = lazy(() => import("@/features/admin/PlatformOrgsView").then(m => ({ default: m.PlatformOrgsView })));
const PlatformUsersView = lazy(() => import("@/features/admin/PlatformUsersView").then(m => ({ default: m.PlatformUsersView })));
const PlatformDashboardView = lazy(() => import("@/features/admin/PlatformDashboardView").then(m => ({ default: m.PlatformDashboardView })));
const SecurityView = lazy(() => import("@/features/account/SecurityView").then(m => ({ default: m.SecurityView })));

export const router = createBrowserRouter([
  // ── Public routes (no auth) ──
  { path: "/", element: <LandingView /> },
  { path: "/signup", element: <SignupView /> },
  { path: "/privacy", element: <PrivacyView /> },
  { path: "/terms", element: <TermsView /> },
  { path: "/login", element: <LoginScreenV3 /> },
  // ── Authenticated app (pathless layout route wraps RequireSession + Suspense) ──
  {
    element: <ShellLayout />,
    children: [
      { path: "dashboard", element: <RoleDashboard /> },
      { path: "projects", element: <ProjectsListView /> },
      { path: "projects/new", element: <CreateProjectView /> },
      { path: "projects/:id", element: <DetailView /> },
      { path: "projects/:id/:tab", element: <DetailView /> },
      { path: "dpr", element: <DPRComposer /> },
      { path: "vendors", element: <VendorsView /> },
      { path: "calendar", element: <CalendarView /> },
      { path: "analytics", element: <AnalyticsView /> },
      { path: "search", element: <GlobalSearchView /> },
      { path: "pos", element: <CrossProjectPOsView /> },
      { path: "notifications", element: <NotificationsView /> },
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
      { path: "settings/security", element: <SecurityView /> },
    ],
  },
  // Public catch-all 404 (works signed-out too).
  { path: "*", element: <NotFoundView /> },
]);
