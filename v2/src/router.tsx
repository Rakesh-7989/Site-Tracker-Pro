import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireSession } from "@/auth/RequireSession";
import { AppShell } from "@/features/shell/AppShell";
import { LoginView } from "@/features/auth/LoginView";

const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ProjectsListPage = lazy(() =>
  import("@/features/projects/ProjectsListPage").then((m) => ({ default: m.ProjectsListPage })),
);
const ProjectDetailPage = lazy(() =>
  import("@/features/projects/ProjectDetailPage").then((m) => ({ default: m.ProjectDetailPage })),
);
const DPRComposerPage = lazy(() =>
  import("@/features/dpr/DPRComposerPage").then((m) => ({ default: m.DPRComposerPage })),
);
const ShareLinkPage = lazy(() =>
  import("@/features/share/ShareLinkPage").then((m) => ({ default: m.ShareLinkPage })),
);
const OrgMembersPage = lazy(() =>
  import("@/features/org/OrgMembersPage").then((m) => ({ default: m.OrgMembersPage })),
);
const StaffAreaPage = lazy(() =>
  import("@/features/org/StaffAreaPage").then((m) => ({ default: m.StaffAreaPage })),
);

export function AppErrorBoundary() {
  return (
    <main className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="text-sm text-error">Something went wrong. Reload the page.</div>
    </main>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginView />, errorElement: <AppErrorBoundary /> },
  {
    path: "/share-link/:token",
    element: <ShareLinkPage />,
    errorElement: <AppErrorBoundary />,
  },
  {
    element: <RequireSession />,
    errorElement: <AppErrorBoundary />,
    children: [
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "projects", element: <ProjectsListPage /> },
          { path: "projects/:projectId", element: <ProjectDetailPage /> },
          { path: "dpr", element: <DPRComposerPage /> },
          { path: "org/members", element: <OrgMembersPage /> },
          { path: "staff", element: <StaffAreaPage /> },
          { path: "*", element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
