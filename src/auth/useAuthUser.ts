// SiteTrack Pro — useAuthUser React hook.
//
// Subscribes to Supabase Auth state, fetches profile + org_members +
// project_members on user change, exposes the resulting AuthSession via
// a {session, status, error, refresh} contract.
//
// Logic-heavy work lives in fetchAuthSession.ts (pure, tested). This
// hook is a thin React wrapper: state + effect + callback.

import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthSession } from "./types";
import { fetchAuthSession, type FetchOutcome } from "./fetchAuthSession";
import { defaultStorage, readActiveOrgId, writeActiveOrgId, type StorageLike } from "./activeOrgStore";

export type AuthStatus = "idle" | "loading" | "ready" | "signed-out" | "error";

export interface UseAuthUserReturn {
  session: AuthSession | null;
  status: AuthStatus;
  error: string | null;
  /** Re-fetch from Supabase (e.g. after creating a new org). */
  refresh: () => Promise<void>;
  /** Switch the active org for the rest of the session. */
  setActiveOrgId: (orgId: string | null) => void;
}

export interface UseAuthUserOptions {
  /**
   * Function returning a Promise<SupabaseClient | null>. Falls back to
   * the lib's getSupabaseClient() when omitted. Injectable so tests
   * can pass a stub.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient?: () => Promise<any>;
  /** Storage backend for the active org id. Defaults to localStorage. */
  storage?: StorageLike;
}

/**
 * Hook returning the current AuthSession + status. Drop this near the
 * root of the React tree (or wrap with OrganizationContextProvider for
 * downstream consumers).
 */
export function useAuthUser(opts: UseAuthUserOptions = {}): UseAuthUserReturn {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const storage = opts.storage ?? defaultStorage();
  // Avoid stale-closure problems in the auth state listener.
  const storageRef = useRef(storage);
  storageRef.current = storage;

  // Resolve the client lazily — supabase.js getSupabaseClient is a JS
  // module; we accept either a custom getter or the default lib export.
  const getClient = useCallback(async () => {
    if (opts.getClient) return await opts.getClient();
    // Default import path — guarded so tests that pass getClient never
    // touch the lib.
    const mod = await import("../lib/supabase.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (mod as any).getSupabaseClient();
  }, [opts]);

  const hydrate = useCallback(async (): Promise<void> => {
    setStatus("loading");
    setError(null);
    let client: unknown;
    try {
      client = await getClient();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!client) {
      // Backend disabled — local mode. Treat as signed-out cleanly.
      setSession(null);
      setStatus("signed-out");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = client as any;
    const { data, error: getUserErr } = await sb.auth.getUser();
    if (getUserErr || !data?.user) {
      setSession(null);
      setStatus("signed-out");
      return;
    }
    const preferredOrgId = readActiveOrgId(storageRef.current);
    const outcome: FetchOutcome = await fetchAuthSession(
      sb,
      { authUserId: data.user.id, authUserEmail: data.user.email ?? "" },
      preferredOrgId,
    );
    if (!outcome.ok) {
      setSession(null);
      setStatus("error");
      setError(`${outcome.code}: ${outcome.error}`);
      return;
    }
    setSession(outcome.session);
    setStatus("ready");
    // Persist (in case pickActiveOrgId chose a different / first org).
    if (outcome.session.activeOrgId !== preferredOrgId) {
      writeActiveOrgId(outcome.session.activeOrgId, storageRef.current);
    }
  }, [getClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrate();
      if (cancelled) return;
      // Subscribe to subsequent auth changes (sign-in / sign-out).
      const client = await getClient();
      if (!client || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = client as any;
      sb.auth.onAuthStateChange(() => {
        if (!cancelled) void hydrate();
      });
    })();
    return () => { cancelled = true; };
  }, [hydrate, getClient]);

  const setActiveOrgId = useCallback((orgId: string | null) => {
    setSession((prev) => prev ? { ...prev, activeOrgId: orgId } : prev);
    writeActiveOrgId(orgId, storageRef.current);
  }, []);

  return { session, status, error, refresh: hydrate, setActiveOrgId };
}
