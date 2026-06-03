// SiteTrack Pro — v3 route tree.
//
// React Router v6. The shell layout wraps the authenticated routes;
// /login is public. Unknown paths → 404. The dashboard is the index.
//
// Strangler note: this router only mounts when ?shell=v3 is present
// (see main.jsx). The legacy App.jsx remains the production default.

import { createBrowserRouter, Navigate } from "react-router-dom";

import { ShellLayout } from "@/features/shell/ShellLayout";
import { DashboardView } from "@/features/shell/DashboardView";
import { ProjectsListView } from "@/features/shell/ProjectsListView";
import { CreateProjectView } from "@/features/shell/CreateProjectView";
import { PlaceholderView, NotFoundView } from "@/features/shell/PlaceholderView";
import { DetailView } from "@/features/project/DetailView";
import { LoginScreenV3 } from "@/features/auth/LoginScreenV3";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginScreenV3 /> },
  {
    path: "/",
    element: <ShellLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardView /> },
      { path: "projects", element: <ProjectsListView /> },
      { path: "projects/new", element: <CreateProjectView /> },
      { path: "projects/:id", element: <DetailView /> },
      { path: "projects/:id/:tab", element: <DetailView /> },
      { path: "dpr", element: <PlaceholderView title="Daily Reports" phase="Phase 7" /> },
      { path: "activity", element: <PlaceholderView title="Activity" phase="Phase 6" /> },
      { path: "audit", element: <PlaceholderView title="Audit Log" phase="Phase 8" /> },
      { path: "org/members", element: <PlaceholderView title="Members" phase="Phase 7" /> },
      { path: "org/billing", element: <PlaceholderView title="Billing" phase="Phase 7" /> },
      { path: "org/integrations", element: <PlaceholderView title="Integrations" phase="Phase 8" /> },
      { path: "admin/users", element: <PlaceholderView title="Users (Platform)" phase="Phase 7" /> },
      { path: "admin/orgs", element: <PlaceholderView title="Organizations (Platform)" phase="Phase 7" /> },
      { path: "*", element: <NotFoundView /> },
    ],
  },
], {
  // Opt into v7 behaviors early to silence the future-flag console warnings
  // and ease the eventual v7 upgrade.
  future: {
    v7_relativeSplatPath: true,
  },
});
