// SiteTrack Pro — v3 impersonation context.
//
// Mirrors the legacy App.jsx impersonation banner pattern (admin as-user).
// This is deliberately minimal: stores impersonation state in-memory,
// a banner renders in ShellLayout, and stopImpersonating navigates back
// to the admin dashboard.
//
// A full implementation would need server-side session switching via
// Supabase Auth admin API. This provides the frontend shell for now.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface ImpersonationState {
  /** The admin user who initiated the impersonation. */
  realUser: { id: string; name: string; email: string };
  /** The user being impersonated. */
  asUser: { id: string; name: string; email: string; role: string };
}

interface ImpersonationContextValue {
  impersonating: ImpersonationState | null;
  startImpersonating: (state: ImpersonationState) => void;
  stopImpersonating: () => void;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  impersonating: null,
  startImpersonating: () => {},
  stopImpersonating: () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }): JSX.Element {
  const [impersonating, setImpersonating] = useState<ImpersonationState | null>(null);

  const startImpersonating = useCallback((state: ImpersonationState) => {
    setImpersonating(state);
  }, []);

  const stopImpersonating = useCallback(() => {
    setImpersonating(null);
  }, []);

  return (
    <ImpersonationContext.Provider value={{ impersonating, startImpersonating, stopImpersonating }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation(): ImpersonationContextValue {
  return useContext(ImpersonationContext);
}
