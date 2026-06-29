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
import { setTenantContext } from "../lib/tenantContext";

export type AuthStatus = "idle" | "loading" | "ready" | "signed-out" | "error";

/**
 * Race a promise against a timeout so a hung network call (e.g. a stale /
 * misconfigured Supabase URL on a bad deploy) can never leave the app stuck
 * on an infinite loading spinner. Rejects with "auth-timeout" after `ms`.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("auth-timeout")), ms)),
  ]);
}

export interface UseAuthUserReturn {
  session: AuthSession | null;
  status: AuthStatus;
  error: string | null;
  /** Re-fetch from Supabase (e.g. after creating a new org). */
  refresh: () => Promise<AuthSession | null>;
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
  // Keep the latest opts in a ref so getClient / hydrate stay STABLE across
  // renders. CRITICAL: <AuthProvider> spreads a fresh `opts` object on every
  // render ({ children, ...opts }). Depending on its identity made getClient →
  // hydrate → the mount effect all re-run every render, which re-fired hydrate()
  // in a tight loop → endless fetchAuthSession requests + a permanently stuck
  // "Loading your workspace…" after login. Reading opts from a ref (so the
  // callbacks have empty/stable deps) breaks that loop — the effect runs once.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Resolve the client lazily — supabase.js getSupabaseClient is a JS
  // module; we accept either a custom getter or the default lib export.
  const getClient = useCallback(async () => {
    if (optsRef.current.getClient) return await optsRef.current.getClient();
    // Default import path — guarded so tests that pass getClient never
    // touch the lib.
    const mod = await import("../lib/supabase.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (mod as any).getSupabaseClient();
  }, []);

  const hydrate = useCallback(async (silent = false): Promise<AuthSession | null> => {
    // `silent` re-hydrations (triggered by background auth events such as a
    // token refresh) must NOT flip status back to "loading" — otherwise the
    // shell flashes the full-screen spinner on every refresh. Only the first
    // load (and an explicit refresh()) shows the loading state.
    if (!silent) setStatus("loading");
    setError(null);
    let client: unknown;
    try {
      // getClient() loads the Supabase SDK via dynamic import. Cap it with a
      // timeout so a hung / stale chunk fetch (e.g. a bad deploy or a stale
      // service-worker cache) can never leave the app frozen on an infinite
      // spinner — fall back to signed-out so the public login renders.
      client = await withTimeout(getClient(), 8000);
    } catch (e) {
      setSession(null);
      setStatus("signed-out");
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
    if (!client) {
      // Backend disabled — local mode. Treat as signed-out cleanly.
      setSession(null);
      setStatus("signed-out");
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = client as any;
    // Everything below is wrapped so a rejected OR hung auth call can never
    // leave status stuck on "loading" (which renders an infinite spinner).
    // On any unexpected failure we fall back to signed-out → the public
    // landing / login renders instead of a frozen page.
    try {
      // getSession() reads the persisted session from localStorage (fast, no
      // network round-trip) instead of getUser() — which hit /auth/v1/user on
      // every cold load and flashed a spinner. autoRefreshToken keeps the token
      // valid; RLS still enforces every request server-side.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = (await withTimeout(sb.auth.getSession(), 8000)) as { data: any };
      const authUser = data?.session?.user;
      if (!authUser) {
        setSession(null);
        setStatus("signed-out");
        return null;
      }
      const preferredOrgId = readActiveOrgId(storageRef.current);
      const outcome: FetchOutcome = await withTimeout(
        fetchAuthSession(
          sb,
          { authUserId: authUser.id, authUserEmail: authUser.email ?? "" },
          preferredOrgId,
        ),
        12000,
      );
      if (!outcome.ok) {
        setSession(null);
        setStatus("error");
        setError(`${outcome.code}: ${outcome.error}`);
        return null;
      }
      setSession(outcome.session);
      setStatus("ready");
      // Persist (in case pickActiveOrgId chose a different / first org).
      if (outcome.session.activeOrgId !== preferredOrgId) {
        writeActiveOrgId(outcome.session.activeOrgId, storageRef.current);
      }
      // Set tenant context so RLS has the org_id for defense-in-depth.
      void setTenantContext(sb, outcome.session.activeOrgId);
      return outcome.session;
    } catch (e) {
      // Network hang / timeout / unexpected throw → don't freeze the app.
      setSession(null);
      setStatus("signed-out");
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [getClient]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let subscription: { unsubscribe: () => void } | null = null;
    void (async () => {
      await hydrate();
      if (cancelled) return;
      // Subscribe to subsequent auth changes (sign-in / sign-out).
      const client = await getClient();
      if (!client || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = client as any;
      const res = sb.auth.onAuthStateChange(() => {
        // Background re-hydrate (sign-in / sign-out / token refresh) — silent so
        // it never re-flashes the full-screen "Loading your workspace…" spinner.
        if (!cancelled) void hydrate(true);
      });
      subscription = res?.data?.subscription ?? null;
      // If we were torn down while awaiting, clean up immediately.
      if (cancelled) subscription?.unsubscribe();
    })();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
    // getClient + hydrate are stable (see optsRef above) → this runs once on mount.
  }, [hydrate, getClient]);

  const setActiveOrgId = useCallback((orgId: string | null) => {
    setSession((prev) => prev ? { ...prev, activeOrgId: orgId } : prev);
    writeActiveOrgId(orgId, storageRef.current);
    if (orgId) {
      void (async () => {
        try {
          const client = await getClient();
          if (client) await setTenantContext(client, orgId);
        } catch { /* non-critical */ }
      })();
    }
  }, [getClient]);

  return { session, status, error, refresh: hydrate, setActiveOrgId };
}
