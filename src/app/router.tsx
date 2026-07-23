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
import { createBrowserRouter, Navigate } from "react-router-dom";

// ── Eager: entry + first paint + small ──────────────────────────────────────
import { RequireStaffArea } from "@/auth";
import { ShellLayout } from "@/features/shell/ShellLayout";
import { LandingView } from "@/features/marketing/LandingView";
import { SignupView } from "@/features/marketing/SignupView";
import { OrgRegisterView } from "@/features/auth/OrgRegisterView";
import { PayView } from "@/features/marketing/PayView";
import { PrivacyView, TermsView } from "@/features/marketing/LegalView";
import { LoginScreenV3, StaffLoginScreen } from "@/features/auth/LoginScreenV3";
import { ResetPasswordView } from "@/features/auth/ResetPasswordView";
import { StaffJoinView } from "@/features/auth/StaffJoinView";
import { AcceptInviteView } from "@/features/auth/AcceptInviteView";
import { ProfileCompleteView } from "@/features/account/ProfileCompleteView";
import { NotFoundView } from "@/features/shell/PlaceholderView";
import { RoleDashboard } from "@/features/dashboards/RoleDashboard";
import { ProjectsListView } from "@/features/shell/ProjectsListView";
import { CreateProjectView } from "@/features/shell/CreateProjectView";

// ── Lazy: loaded on navigation (keeps the initial bundle lean) ──────────────
const DetailView = lazy(() => import("@/features/project/DetailView").then(m => ({ default: m.DetailView })));
const DPRComposer = lazy(() => import("@/features/dpr/DPRComposer").then(m => ({ default: m.DPRComposer })));
const DPRHistoryView = lazy(() => import("@/features/dpr/DPRHistoryView").then(m => ({ default: m.DPRHistoryView })));
const VendorsView = lazy(() => import("@/features/org/VendorsView").then(m => ({ default: m.VendorsView })));
const CalendarView = lazy(() => import("@/features/org/CalendarView").then(m => ({ default: m.CalendarView })));
const AnalyticsView = lazy(() => import("@/features/org/AnalyticsView").then(m => ({ default: m.AnalyticsView })));
const GlobalSearchView = lazy(() => import("@/features/org/GlobalSearchView").then(m => ({ default: m.GlobalSearchView })));
const CrossProjectPOsView = lazy(() => import("@/features/org/CrossProjectPOsView").then(m => ({ default: m.CrossProjectPOsView })));
const NotificationsView = lazy(() => import("@/features/org/NotificationsView").then(m => ({ default: m.NotificationsView })));
const MessagesView = lazy(() => import("@/features/org/MessagesView").then(m => ({ default: m.MessagesView })));
const ClientPortalView = lazy(() => import("@/features/org/ClientPortalView").then(m => ({ default: m.ClientPortalView })));
const HelpView = lazy(() => import("@/features/org/HelpView").then(m => ({ default: m.HelpView })));
const PMView = lazy(() => import("@/features/org/PMView").then(m => ({ default: m.PMView })));
const VendorPortalView = lazy(() => import("@/features/org/VendorPortalView").then(m => ({ default: m.VendorPortalView })));
const OrgActivityView = lazy(() => import("@/features/org/OrgActivityView").then(m => ({ default: m.OrgActivityView })));
const OrgDashboardView = lazy(() => import("@/features/org/OrgDashboardView").then(m => ({ default: m.OrgDashboardView })));
const OrgMembersView = lazy(() => import("@/features/org/OrgMembersView").then(m => ({ default: m.OrgMembersView })));
const OrgRolesView = lazy(() => import("@/features/org/OrgRolesView").then(m => ({ default: m.OrgRolesView })));
const OrgBillingView = lazy(() => import("@/features/org/OrgBillingView").then(m => ({ default: m.OrgBillingView })));
const OrgTemplatesView = lazy(() => import("@/features/org/OrgTemplatesView").then(m => ({ default: m.OrgTemplatesView })));
const OrgApprovalsView = lazy(() => import("@/features/org/OrgApprovalsView").then(m => ({ default: m.OrgApprovalsView })));
const OrgNotificationsView = lazy(() => import("@/features/org/OrgNotificationsView").then(m => ({ default: m.OrgNotificationsView })));
const OrgIntegrationsView = lazy(() => import("@/features/org/OrgIntegrationsView").then(m => ({ default: m.OrgIntegrationsView })));
const OrgFeaturesView = lazy(() => import("@/features/org/OrgFeaturesView").then(m => ({ default: m.OrgFeaturesView })));
const OnboardingView = lazy(() => import("@/features/org/OnboardingView").then(m => ({ default: m.OnboardingView })));
const RoleManager = lazy(() => import("@/features/admin/RoleManager").then(m => ({ default: m.RoleManager })));
const SignupRequestsView = lazy(() => import("@/features/admin/SignupRequestsView").then(m => ({ default: m.SignupRequestsView })));
const PlatformOrgsView = lazy(() => import("@/features/admin/PlatformOrgsView").then(m => ({ default: m.PlatformOrgsView })));
const PlatformUsersView = lazy(() => import("@/features/admin/PlatformUsersView").then(m => ({ default: m.PlatformUsersView })));
const PlatformDashboardView = lazy(() => import("@/features/admin/PlatformDashboardView").then(m => ({ default: m.PlatformDashboardView })));
const StaffAdminView = lazy(() => import("@/features/admin/StaffAdminView").then(m => ({ default: m.StaffAdminView })));
const UpgradeRequestsView = lazy(() => import("@/features/admin/UpgradeRequestsView").then(m => ({ default: m.UpgradeRequestsView })));
const SecurityView = lazy(() => import("@/features/account/SecurityView").then(m => ({ default: m.SecurityView })));
const ProfileView = lazy(() => import("@/features/account/ProfileView").then(m => ({ default: m.ProfileView })));
const ClientShareView = lazy(() => import("@/features/share/ClientShareView").then(m => ({ default: m.ClientShareView })));
const PlatformBillingView = lazy(() => import("@/features/admin/PlatformBillingView").then(m => ({ default: m.PlatformBillingView })));
const PlatformAuditView = lazy(() => import("@/features/admin/PlatformAuditView").then(m => ({ default: m.PlatformAuditView })));
const PlatformUsageView = lazy(() => import("@/features/admin/PlatformUsageView").then(m => ({ default: m.PlatformUsageView })));
const PlatformSupportView = lazy(() => import("@/features/admin/PlatformSupportView").then(m => ({ default: m.PlatformSupportView })));
const PlatformSettingsView = lazy(() => import("@/features/admin/PlatformSettingsView").then(m => ({ default: m.PlatformSettingsView })));
const LabourKioskView = lazy(() => import("@/features/kiosk/LabourKioskView").then(m => ({ default: m.LabourKioskView })));
const SiteWallKioskView = lazy(() => import("@/features/kiosk/SiteWallKioskView").then(m => ({ default: m.SiteWallKioskView })));
const ARDrawingOverlayView = lazy(() => import("@/features/kiosk/ARDrawingOverlayView").then(m => ({ default: m.ARDrawingOverlayView })));
const DailySnapshotView = lazy(() => import("@/features/kiosk/DailySnapshotView").then(m => ({ default: m.DailySnapshotView })));
const HierarchyView = lazy(() => import("@/features/org/HierarchyView").then(m => ({ default: m.HierarchyView })));
const MaterialPricesView = lazy(() => import("@/features/org/MaterialPricesView").then(m => ({ default: m.MaterialPricesView })));
const ForecastView = lazy(() => import("@/features/org/ForecastView").then(m => ({ default: m.ForecastView })));
const DelegationsView = lazy(() => import("@/features/org/DelegationsView").then(m => ({ default: m.DelegationsView })));
const ComplianceView = lazy(() => import("@/features/org/ComplianceView").then(m => ({ default: m.ComplianceView })));
const PlatformBrandingView = lazy(() => import("@/features/admin/PlatformBrandingView").then(m => ({ default: m.PlatformBrandingView })));
const PlatformAuditLogV2View = lazy(() => import("@/features/admin/PlatformAuditLogV2View").then(m => ({ default: m.PlatformAuditLogV2View })));

export const router = createBrowserRouter([
  // ── Public routes (no auth) ──
  { path: "/", element: <LandingView /> },
  { path: "/signup", element: <SignupView /> },
  { path: "/register", element: <OrgRegisterView /> },
  { path: "/accept-invite", element: <AcceptInviteView /> },
  { path: "/privacy", element: <PrivacyView /> },
  { path: "/terms", element: <TermsView /> },
  { path: "/login", element: <LoginScreenV3 /> },
  { path: "/staff/login", element: <StaffLoginScreen /> },
  { path: "/admin/login", element: <Navigate to="/staff/login" replace /> },
  { path: "/auth/reset", element: <ResetPasswordView /> },
  { path: "/staff/join", element: <StaffJoinView /> },
  { path: "/profile/complete", element: <ProfileCompleteView /> },
  { path: "/pay/:requestId", element: <PayView /> },
  { path: "/share/:id", element: <ClientShareView /> },
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
      { path: "dpr/history", element: <DPRHistoryView /> },
      { path: "vendors", element: <VendorsView /> },
      { path: "calendar", element: <CalendarView /> },
      { path: "analytics", element: <AnalyticsView /> },
      { path: "search", element: <GlobalSearchView /> },
      { path: "pos", element: <CrossProjectPOsView /> },
      { path: "notifications", element: <NotificationsView /> },
      { path: "messages", element: <MessagesView /> },
      { path: "client", element: <ClientPortalView /> },
      { path: "help", element: <HelpView /> },
      { path: "pm", element: <PMView /> },
      { path: "vendor", element: <VendorPortalView /> },
      { path: "activity", element: <OrgActivityView /> },
      { path: "audit", element: <OrgActivityView /> },
      { path: "hierarchy", element: <HierarchyView /> },
      { path: "material-prices", element: <MaterialPricesView /> },
      { path: "forecast", element: <ForecastView /> },
      { path: "delegations", element: <DelegationsView /> },
      { path: "compliance", element: <ComplianceView /> },
      { path: "org", element: <OrgDashboardView /> },
      { path: "org/members", element: <OrgMembersView /> },
      { path: "org/roles", element: <OrgRolesView /> },
      { path: "org/billing", element: <OrgBillingView /> },
      { path: "org/templates", element: <OrgTemplatesView /> },
      { path: "org/approvals", element: <OrgApprovalsView /> },
      { path: "org/notifications", element: <OrgNotificationsView /> },
      { path: "org/integrations", element: <OrgIntegrationsView /> },
      { path: "org/features", element: <OrgFeaturesView /> },
      { path: "org/onboarding", element: <OnboardingView /> },
      { path: "admin", element: <PlatformDashboardView /> },
      { path: "admin/users", element: <RequireStaffArea area="users" fallback={<Navigate to="/admin" replace />}><PlatformUsersView /></RequireStaffArea> },
      { path: "admin/orgs", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformOrgsView /></RequireStaffArea> },
      { path: "admin/roles", element: <RequireStaffArea area="roles" fallback={<Navigate to="/admin" replace />}><RoleManager /></RequireStaffArea> },
      { path: "admin/staff", element: <StaffAdminView /> },
      { path: "admin/upgrades", element: <RequireStaffArea area="upgrades" fallback={<Navigate to="/admin" replace />}><UpgradeRequestsView /></RequireStaffArea> },
      { path: "admin/signups", element: <RequireStaffArea area="signups" fallback={<Navigate to="/admin" replace />}><SignupRequestsView /></RequireStaffArea> },
      { path: "admin/billing", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformBillingView /></RequireStaffArea> },
      { path: "admin/audit", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformAuditView /></RequireStaffArea> },
      { path: "admin/usage", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformUsageView /></RequireStaffArea> },
      { path: "admin/support", element: <PlatformSupportView /> },
      { path: "admin/settings", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformSettingsView /></RequireStaffArea> },
      { path: "admin/branding", element: <PlatformBrandingView /> },
      { path: "admin/audit-v2", element: <PlatformAuditLogV2View /> },
      { path: "settings/security", element: <SecurityView /> },
      { path: "settings/profile", element: <ProfileView /> },
      { path: "kiosk/labour", element: <LabourKioskView /> },
      { path: "kiosk/site", element: <SiteWallKioskView /> },
      { path: "kiosk/ar", element: <ARDrawingOverlayView /> },
      { path: "kiosk/snapshot", element: <DailySnapshotView /> },
    ],
  },
  // Public catch-all 404 (works signed-out too).
  { path: "*", element: <NotFoundView /> },
]);
