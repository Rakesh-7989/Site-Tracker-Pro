// SiteTrack Pro — v3 route tree.
//
// React Router v7. The shell layout wraps the authenticated routes; the public
// landing / signup / legal / login sit outside it. Unknown paths → 404.
//
// Performance: the entry + first-paint views are imported eagerly; everything
// reached by navigation (the 28-tab project detail, all org + admin panels, the
// Analytics view) is React.lazy() so it is NOT in the initial
// bundle. ShellLayout wraps <Outlet/> in <Suspense>, so lazy routes get a
// spinner while their chunk loads.
//
// Module-gated routes (v4 Phase 2): the shell children spread
// `...createPluginRoutes()` from the plugin catalog (src/plugins). Each such
// route is wrapped in <ModuleGuard> so direct URL access to a module the active
// org hasn't enabled renders AccessDenied. The catalog is the single source of
// truth for module→route ownership; non-module routes below stay hardcoded.

import { lazy } from "react";
import { createBrowserRouter, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { guardRoutes } from "@/app/RouteErrorBoundary";

// ── Eager: entry + first paint + small ──────────────────────────────────────
import { RequireStaffArea } from "@/auth";
import { ShellLayout } from "@/features/shell/ShellLayout";
import { StubGuard } from "@/auth/StubGuard";
import { HomePage } from "@/features/marketing/site/pages/HomePage";
import { SiteShell } from "@/features/marketing/site/SiteShell";
import { OrgRegisterView } from "@/features/auth/OrgRegisterView";
import { VerifyEmailView } from "@/features/auth/VerifyEmailView";
import { PayView } from "@/features/marketing/PayView";
import { PrivacyView, TermsView } from "@/features/marketing/LegalView";
import { LoginScreenV3, StaffLoginScreen } from "@/features/auth/LoginScreenV3";
import { ResetPasswordView } from "@/features/auth/ResetPasswordView";
import { ChangePasswordView } from "@/features/auth/ChangePasswordView";
import { StaffJoinView } from "@/features/auth/StaffJoinView";
import { AcceptInviteView } from "@/features/auth/AcceptInviteView";
import { ProfileCompleteView } from "@/features/account/ProfileCompleteView";
import { NotFoundView } from "@/features/shell/PlaceholderView";
import { RoleDashboard } from "@/features/dashboards/RoleDashboard";
import { ProjectsListView } from "@/features/shell/ProjectsListView";
import { CreateProjectView } from "@/features/shell/CreateProjectView";

// ── Plugin catalog: module-gated lazy routes (Phase 2) ─────────────────────
import { createPluginRoutes } from "@/plugins";

// ── Lazy (non-module): loaded on navigation (keeps the initial bundle lean) ─
const DetailView = lazy(() => import("@/features/project/DetailView").then(m => ({ default: m.DetailView })));
const CalendarView = lazy(() => import("@/features/org/CalendarView").then(m => ({ default: m.CalendarView })));
const GlobalSearchView = lazy(() => import("@/features/org/GlobalSearchView").then(m => ({ default: m.GlobalSearchView })));
const NotificationsView = lazy(() => import("@/features/org/NotificationsView").then(m => ({ default: m.NotificationsView })));
const TeamChatView = lazy(() => import("@/features/org/TeamChatView").then(m => ({ default: m.TeamChatView })));
// Public marketing pages (except first-paint HomePage) load on navigation
// so crawlers + visitors to / don't pay for the whole site up front.
const ProductPage = lazy(() => import("@/features/marketing/site/pages/ProductPage").then(m => ({ default: m.ProductPage })));
const FeaturesPage = lazy(() => import("@/features/marketing/site/pages/FeaturesPage").then(m => ({ default: m.FeaturesPage })));
const PricingPage = lazy(() => import("@/features/marketing/site/pages/PricingPage").then(m => ({ default: m.PricingPage })));
const SolutionsOverviewPage = lazy(() => import("@/features/marketing/site/pages/SolutionsPage").then(m => ({ default: m.SolutionsOverviewPage })));
const SolutionRolePage = lazy(() => import("@/features/marketing/site/pages/SolutionsPage").then(m => ({ default: m.SolutionRolePage })));
const ResourcesPage = lazy(() => import("@/features/marketing/site/pages/ResourcesPage").then(m => ({ default: m.ResourcesPage })));
const BlogPage = lazy(() => import("@/features/marketing/site/pages/BlogPage").then(m => ({ default: m.BlogPage })));
const AboutPage = lazy(() => import("@/features/marketing/site/pages/AboutPage").then(m => ({ default: m.AboutPage })));
const SecurityPage = lazy(() => import("@/features/marketing/site/pages/SecurityPage").then(m => ({ default: m.SecurityPage })));
const ContactPage = lazy(() => import("@/features/marketing/site/pages/ContactPage").then(m => ({ default: m.ContactPage })));
const LocalHyderabadPage = lazy(() => import("@/features/marketing/site/pages/LocalHyderabadPage").then(m => ({ default: m.LocalHyderabadPage })));
// Legacy mention-notification links (/teams?c=&m=) keep working.
function TeamsAliasRedirect(): JSX.Element {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("from", "teams");
  return <Navigate to={{ pathname: "/chat", search: params.toString() }} replace />;
}
const HelpView = lazy(() => import("@/features/org/HelpView").then(m => ({ default: m.HelpView })));
const PMView = lazy(() => import("@/features/org/PMView").then(m => ({ default: m.PMView })));
const OrgActivityView = lazy(() => import("@/features/org/OrgActivityView").then(m => ({ default: m.OrgActivityView })));
const OrgDashboardView = lazy(() => import("@/features/org/OrgDashboardView").then(m => ({ default: m.OrgDashboardView })));
const OrgMembersView = lazy(() => import("@/features/org/OrgMembersView").then(m => ({ default: m.OrgMembersView })));
const OrgRolesView = lazy(() => import("@/features/org/OrgRolesView").then(m => ({ default: m.OrgRolesView })));
const RbacView = lazy(() => import("@/features/org/RbacView").then(m => ({ default: m.RbacView })));
const OrgBillingView = lazy(() => import("@/features/org/OrgBillingView").then(m => ({ default: m.OrgBillingView })));
const OrgTemplatesView = lazy(() => import("@/features/org/OrgTemplatesView").then(m => ({ default: m.OrgTemplatesView })));
const OrgApprovalsView = lazy(() => import("@/features/org/OrgApprovalsView").then(m => ({ default: m.OrgApprovalsView })));
const OrgNotificationsView = lazy(() => import("@/features/org/OrgNotificationsView").then(m => ({ default: m.OrgNotificationsView })));
const OrgBrandingView = lazy(() => import("@/features/org/OrgBrandingView").then(m => ({ default: m.OrgBrandingView })));
const OrgBroadcastView = lazy(() => import("@/features/org/OrgBroadcastView").then(m => ({ default: m.OrgBroadcastView })));
const NotificationPreferencesView = lazy(() => import("@/features/org/NotificationPreferencesView").then(m => ({ default: m.NotificationPreferencesView })));
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
const ShareLinkView = lazy(() => import("@/features/share/ShareLinkView").then(m => ({ default: m.ShareLinkView })));
const PlatformBillingView = lazy(() => import("@/features/admin/PlatformBillingView").then(m => ({ default: m.PlatformBillingView })));
const PlatformUsageView = lazy(() => import("@/features/admin/PlatformUsageView").then(m => ({ default: m.PlatformUsageView })));
const PlatformSupportView = lazy(() => import("@/features/admin/PlatformSupportView").then(m => ({ default: m.PlatformSupportView })));
const PlatformSettingsView = lazy(() => import("@/features/admin/PlatformSettingsView").then(m => ({ default: m.PlatformSettingsView })));
const DelegationsView = lazy(() => import("@/features/org/DelegationsView").then(m => ({ default: m.DelegationsView })));
const DigestManagementView = lazy(() => import("@/features/org/DigestManagementView").then(m => ({ default: m.DigestManagementView })));
const PlatformBrandingView = lazy(() => import("@/features/admin/PlatformBrandingView").then(m => ({ default: m.PlatformBrandingView })));
const PlatformAuditLogV2View = lazy(() => import("@/features/admin/PlatformAuditLogV2View").then(m => ({ default: m.PlatformAuditLogV2View })));
const PlatformFeatureFlagsView = lazy(() => import("@/features/admin/PlatformFeatureFlagsView").then(m => ({ default: m.PlatformFeatureFlagsView })));

// P-D unified signup: `/signup` (legacy approval-gated flow) forwards to the
// Zoho-style self-service `/register`, carrying over any plan/billing params
// so deep links like `/signup?plan=pro&billing=annual` land correctly.
function SignupRedirect(): JSX.Element {
  const [params] = useSearchParams();
  const query: string[] = [];
  const plan = params.get("plan");
  if (plan) query.push(`plan=${encodeURIComponent(plan)}`);
  const billing = params.get("billing");
  if (billing) query.push(`billing=${encodeURIComponent(billing)}`);
  const to = query.length > 0 ? `/register?${query.join("&")}` : "/register";
  return <Navigate to={to} replace />;
}

export const router = createBrowserRouter(guardRoutes([
  // ── Public routes (no auth) ──
  // P-D unified signup: `/signup` (legacy approval-gated) redirects to the
  // Zoho-style self-service `/register`, preserving plan/billing params.
  { path: "/signup", element: <SignupRedirect /> },
  { path: "/register", element: <OrgRegisterView /> },
  { path: "/verify-email", element: <VerifyEmailView /> },
  { path: "/accept-invite", element: <AcceptInviteView /> },
  { path: "/privacy", element: <PrivacyView /> },
  { path: "/terms", element: <TermsView /> },
  { path: "/login", element: <LoginScreenV3 /> },
  { path: "/staff/login", element: <StaffLoginScreen /> },
  { path: "/admin/login", element: <Navigate to="/staff/login" replace /> },
  { path: "/auth/reset", element: <ResetPasswordView /> },
  { path: "/auth/change-password", element: <ChangePasswordView /> },
  { path: "/staff/join", element: <StaffJoinView /> },
  { path: "/profile/complete", element: <ProfileCompleteView /> },
  { path: "/pay/:requestId", element: <PayView /> },
  { path: "/share/:id", element: <ClientShareView /> },
  { path: "/share-link/:token", element: <ShareLinkView /> },
  // ── Public marketing site (SiteShell chrome: header + footer) ──
  {
    element: <SiteShell />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/product", element: <ProductPage /> },
      { path: "/product-tour", element: <Navigate to="/product" replace /> },
      { path: "/features", element: <FeaturesPage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/solutions", element: <SolutionsOverviewPage /> },
      { path: "/solutions/:slug", element: <SolutionRolePage /> },
      { path: "/resources", element: <ResourcesPage /> },
      { path: "/blog", element: <BlogPage /> },
      { path: "/about", element: <AboutPage /> },
      { path: "/security", element: <SecurityPage /> },
      { path: "/contact", element: <ContactPage /> },
      { path: "/construction-software-hyderabad", element: <LocalHyderabadPage /> },
    ],
  },
  // ── Authenticated app (pathless layout route wraps RequireSession + Suspense) ──
  {
    element: <ShellLayout />,
    children: [
      { path: "dashboard", element: <RoleDashboard /> },
      { path: "projects", element: <ProjectsListView /> },
      { path: "projects/new", element: <CreateProjectView /> },
      { path: "projects/:id", element: <DetailView /> },
      { path: "projects/:id/:tab", element: <DetailView /> },
      { path: "calendar", element: <CalendarView /> },
      { path: "search", element: <GlobalSearchView /> },
      { path: "notifications", element: <NotificationsView /> },
      { path: "chat", element: <TeamChatView /> },
      { path: "teams", element: <TeamsAliasRedirect /> },
      { path: "help", element: <HelpView /> },
      { path: "pm", element: <PMView /> },
      { path: "activity", element: <OrgActivityView /> },
      { path: "audit", element: <OrgActivityView /> },
      { path: "delegations", element: <DelegationsView /> },
      { path: "digest", element: <DigestManagementView /> },
      // Module-gated routes (Phase 2) — see src/plugins/catalog.ts
      ...createPluginRoutes(),
      { path: "org", element: <OrgDashboardView /> },
      { path: "org/members", element: <OrgMembersView /> },
      { path: "org/roles", element: <OrgRolesView /> },
      { path: "org/billing", element: <OrgBillingView /> },
      { path: "org/templates", element: <OrgTemplatesView /> },
      { path: "org/approvals", element: <OrgApprovalsView /> },
      { path: "org/notifications", element: <OrgNotificationsView /> },
      { path: "org/notification-preferences", element: <NotificationPreferencesView /> },
      { path: "org/branding", element: <OrgBrandingView /> },
      { path: "org/broadcast", element: <OrgBroadcastView /> },
      { path: "org/integrations", element: <OrgIntegrationsView /> },
      { path: "org/features", element: <OrgFeaturesView /> },
      { path: "org/rbac", element: <RbacView /> },
      { path: "org/onboarding", element: <OnboardingView /> },
      { path: "admin", element: <PlatformDashboardView /> },
      { path: "admin/users", element: <RequireStaffArea area="users" fallback={<Navigate to="/admin" replace />}><PlatformUsersView /></RequireStaffArea> },
      { path: "admin/orgs", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformOrgsView /></RequireStaffArea> },
      { path: "admin/roles", element: <RequireStaffArea area="roles" fallback={<Navigate to="/admin" replace />}><RoleManager /></RequireStaffArea> },
      { path: "admin/staff", element: <RequireStaffArea area="users" fallback={<Navigate to="/admin" replace />}><StaffAdminView /></RequireStaffArea> },
      { path: "admin/upgrades", element: <RequireStaffArea area="upgrades" fallback={<Navigate to="/admin" replace />}><UpgradeRequestsView /></RequireStaffArea> },
      { path: "admin/signups", element: <RequireStaffArea area="signups" fallback={<Navigate to="/admin" replace />}><SignupRequestsView /></RequireStaffArea> },
      { path: "admin/billing", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformBillingView /></RequireStaffArea> },
      { path: "admin/audit", element: <StubGuard stubId="admin-audit-log"><RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformAuditLogV2View /></RequireStaffArea></StubGuard> },
      { path: "admin/usage", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformUsageView /></RequireStaffArea> },
      { path: "admin/support", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformSupportView /></RequireStaffArea> },
      { path: "admin/settings", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformSettingsView /></RequireStaffArea> },
      { path: "admin/feature-flags", element: <RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformFeatureFlagsView /></RequireStaffArea> },
      { path: "admin/branding", element: <StubGuard stubId="admin-branding"><RequireStaffArea area="orgs" fallback={<Navigate to="/admin" replace />}><PlatformBrandingView /></RequireStaffArea></StubGuard> },
      { path: "settings/security", element: <SecurityView /> },
      { path: "settings/profile", element: <ProfileView /> },
    ],
  },
  // Public catch-all 404 (works signed-out too).
  { path: "*", element: <NotFoundView /> },
]));
