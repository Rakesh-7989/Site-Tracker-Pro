// SiteTrack Pro — v3 root.
//
// Wraps the router in the AuthProvider so every route can use the auth
// layer (Phases 1-1.5). Mounted only when ?shell=v3 is present.

import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/auth";
import { router } from "./router";

export function AppV3(): JSX.Element {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
