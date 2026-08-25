import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase";
import { fetchAuthSession } from "@/auth/session";
import type { AppSession } from "@/auth/types";

interface AuthContextValue {
  session: AppSession | null;
  isLoading: boolean;
  isError: boolean;
  setActiveOrg: (orgId: string) => void;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [activeOrgOverride, setActiveOrgOverride] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => fetchAuthSession(getClient()),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const signIn = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { error } = await getClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
  });

  const signInFn = useCallback(
    async (email: string, password: string) => {
      try {
        await signIn.mutateAsync({ email, password });
        await qc.invalidateQueries({ queryKey: ["auth-session"] });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "sign-in-failed" };
      }
    },
    [signIn, qc],
  );

  const signOut = useCallback(async () => {
    await getClient().auth.signOut();
    setActiveOrgOverride(null);
    qc.setQueryData(["auth-session"], null);
    qc.invalidateQueries();
  }, [qc]);

  const value = useMemo<AuthContextValue>(() => {
    const base = sessionQuery.data ?? null;
    const session =
      base && activeOrgOverride && base.memberships.some((m) => m.orgId === activeOrgOverride)
        ? { ...base, activeOrgId: activeOrgOverride }
        : base;
    return {
      session,
      isLoading: sessionQuery.isLoading,
      isError: sessionQuery.isError,
      setActiveOrg: setActiveOrgOverride,
      signIn: signInFn,
      signOut,
    };
  }, [sessionQuery.data, sessionQuery.isLoading, sessionQuery.isError, activeOrgOverride, signInFn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function useCan(capability: string): boolean {
  const { session } = useAuth();
  return session?.capabilities.has(capability as never) ?? false;
}
