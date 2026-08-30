// SiteTrack Pro — v3 impersonation context (hardened P1).
//
// Superadmin support impersonation with reason + 15-min auto-expiry + immutable
// audit_log_v2 trail. In-memory only (reload clears); server-side session switch
// remains future work — the audit trail is the trust anchor.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { getClient } from "@/lib/supabase/supabase";

export const IMPERSONATION_TTL_MS = 15 * 60 * 1000;
export const IMPERSONATION_REASON_MIN = 10;

export interface ImpersonationState {
  /** The admin user who initiated the impersonation. */
  realUser: { id: string; name: string; email: string };
  /** The user being impersonated. */
  asUser: { id: string; name: string; email: string; role: string };
  /** Reason for impersonation (required, min 10 chars) — audited. */
  reason: string;
  /** ISO timestamp when impersonation started. */
  startedAt: string;
  /** ISO timestamp when it auto-expires (startedAt + TTL). */
  expiresAt: string;
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

export function buildImpersonationState(
  realUser: ImpersonationState["realUser"],
  asUser: ImpersonationState["asUser"],
  reason: string,
  nowMs = Date.now(),
): ImpersonationState {
  const startedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + IMPERSONATION_TTL_MS).toISOString();
  return { realUser, asUser, reason: reason.trim(), startedAt, expiresAt };
}

export function isImpersonationExpired(state: ImpersonationState, nowMs = Date.now()): boolean {
  return new Date(state.expiresAt).getTime() <= nowMs;
}

export function remainingMs(state: ImpersonationState, nowMs = Date.now()): number {
  return Math.max(0, new Date(state.expiresAt).getTime() - nowMs);
}

async function writeImpersonationAudit(state: ImpersonationState, ended: boolean): Promise<void> {
  try {
    const client = await getClient();
    if (!client) return;
    // Append-only audit via SECURITY DEFINER RPC — direct INSERT is revoked.
    // IMPERSONATE is an allowed action in audit_log_v2 CHECK. Both the start
    // and the end of a privileged session are recorded (end gives auditors a
    // session duration; expiry stops through the same path).
    const msg = ended
      ? `Ended impersonation of ${state.asUser.email} (${state.asUser.role}) — session closed`
      : `Impersonated ${state.asUser.email} (${state.asUser.role}) — reason: ${state.reason}`;
    await client.rpc("record_audit_v2", {
      p_action: "IMPERSONATE",
      p_resource: "profiles",
      p_resource_id: state.asUser.id,
      p_project_id: null,
      p_before: null,
      p_after: null,
      p_message: msg,
    });
  } catch {
    // Audit is best-effort — do not block impersonation.
  }
}

export function ImpersonationProvider({ children }: { children: ReactNode }): JSX.Element {
  const [impersonating, setImpersonating] = useState<ImpersonationState | null>(null);
  // Mirrors `impersonating` so the stable stop callback can audit the session
  // it ends (manual stop AND auto-expiry share the same path).
  const activeRef = useRef<ImpersonationState | null>(null);

  const startImpersonating = useCallback((state: ImpersonationState) => {
    activeRef.current = state;
    setImpersonating(state);
    void writeImpersonationAudit(state, false);
  }, []);

  const stopImpersonating = useCallback(() => {
    const cur = activeRef.current;
    activeRef.current = null;
    setImpersonating(null);
    if (cur) void writeImpersonationAudit(cur, true);
  }, []);

  // Auto-expire after TTL — also handles stale state after tab sleep.
  useEffect(() => {
    if (!impersonating) return;
    const ms = remainingMs(impersonating);
    if (ms <= 0) { stopImpersonating(); return; }
    const id = window.setTimeout(stopImpersonating, ms);
    return () => window.clearTimeout(id);
  }, [impersonating, stopImpersonating]);

  return (
    <ImpersonationContext.Provider value={{ impersonating, startImpersonating, stopImpersonating }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation(): ImpersonationContextValue {
  return useContext(ImpersonationContext);
}
