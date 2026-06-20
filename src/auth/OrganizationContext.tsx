// SiteTrack Pro — OrganizationContext.
//
// Wraps the top of the React tree with the AuthSession + active org
// selection so any descendant can:
//
//   const { session, status, setActiveOrgId } = useAuth();
//
// instead of re-calling useAuthUser at every level (which would cause
// duplicate Supabase requests). The provider is also where the org
// switcher state lives.

import { createContext, useContext, type ReactNode } from "react";

import type { AuthSession } from "./types";
import { useAuthUser, type AuthStatus, type UseAuthUserOptions } from "./useAuthUser";

export interface AuthContextValue {
  session: AuthSession | null;
  status: AuthStatus;
  error: string | null;
  refresh: () => Promise<AuthSession | null>;
  setActiveOrgId: (orgId: string | null) => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps extends UseAuthUserOptions {
  children: ReactNode;
}

export function AuthProvider({ children, ...opts }: AuthProviderProps): JSX.Element {
  const value = useAuthUser(opts);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Read the current auth context. Throws when called outside the
 * provider — this is intentional; an auth-less render is a bug.
 */
export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useAuth() called outside <AuthProvider>. Wrap your root component with <AuthProvider> first.",
    );
  }
  return v;
}

/**
 * Convenience: returns the AuthSession only. Throws if not yet ready —
 * use this in screens that are already gated behind a loading view.
 */
export function useSession(): AuthSession {
  const { session, status } = useAuth();
  if (!session) {
    throw new Error(`useSession() called before session ready (status=${status}). Render a loading view first.`);
  }
  return session;
}
