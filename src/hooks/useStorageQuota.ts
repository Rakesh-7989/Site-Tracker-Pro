// SiteTrack Pro — B5 storage quota hook (P-H4).
// Loads the org's per-bucket storage usage once via storage_usage_by_org and
// exposes an at-quota flag for upload gating in register tabs. Fail-open on
// error (missing RPC / no client) so uploads never block on quota infra.

import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { storageByBucket, storagePercent, storageRemaining, storageTotal, storageUsed, type StorageByBucket } from "@/app/queries/storageQuotaQueries";

export interface StorageQuotaState {
  loading: boolean;
  atQuota: boolean;
  pct: number;
  usedBytes: number;
  totalBytes: number;
  remainingBytes: number;
  data: StorageByBucket[] | null;
}

const EMPTY: StorageQuotaState = { loading: true, atQuota: false, pct: 0, usedBytes: 0, totalBytes: 0, remainingBytes: 0, data: null };

/** True when the org is at/over its overall storage cap. */
export function quotaAtLimit(state: StorageQuotaState): boolean {
  return state.atQuota;
}

/** True when any individual bucket is over its cap (hard bucket limit). */
export function bucketAtLimit(state: StorageQuotaState): boolean {
  return (state.data ?? []).some(b => b.used_bytes >= b.total_bytes && b.total_bytes > 0);
}

export function useStorageQuota(orgId: string | null | undefined): StorageQuotaState {
  const [state, setState] = useState<StorageQuotaState>(EMPTY);
  const orgRef = useRef(orgId);
  orgRef.current = orgId;

  const load = useCallback(async () => {
    const org = orgRef.current;
    if (!org) { setState(EMPTY); return; }
    setState(s => ({ ...s, loading: true }));
    const client = await getClient();
    if (!client) { setState({ ...EMPTY, loading: false }); return; }
    const res = await storageByBucket(client, org);
    if (!res.ok || !res.data) { setState({ ...EMPTY, loading: false }); return; }
    setState({
      loading: false,
      atQuota: storagePercent(res.data) >= 100,
      pct: storagePercent(res.data),
      usedBytes: storageUsed(res.data),
      totalBytes: storageTotal(res.data),
      remainingBytes: storageRemaining(res.data),
      data: res.data,
    });
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onFocus = () => { if (orgRef.current) void load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return state;
}
