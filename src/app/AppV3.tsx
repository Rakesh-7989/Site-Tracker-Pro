// SiteTrack Pro — v3 root.
//
// Wraps the router in the AuthProvider so every route can use the auth
// layer (Phases 1-1.5). Mounted only when ?shell=v3 is present.

import { RouterProvider } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";

import { AuthProvider } from "@/auth";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ImpersonationProvider } from "@/features/admin/ImpersonationContext";
import { PwaChrome } from "@/features/pwa/PwaChrome";
import { SubdomainBranding } from "@/features/shell/SubdomainBranding";
import { router } from "./router";

export function AppV3(): JSX.Element {
  return (
    <I18nProvider>
      <AuthProvider>
        <ImpersonationProvider>
            <SubdomainBranding />
            <RouterProvider router={router} />
            <Analytics />
            <PwaChrome />
        </ImpersonationProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
