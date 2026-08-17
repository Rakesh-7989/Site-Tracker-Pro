// SiteTrack Pro — B5 storage upload gate (P-H4).
// A compact warning shown above an upload trigger when the org is at/over its
// storage cap, plus a `canUpload` flag the caller uses to disable its trigger.

import { useStorageQuota } from "@/hooks/useStorageQuota";
import { Alert } from "@/components/ui/atoms";
import { fmtCompactRupees } from "@/app/financeQueries";

export interface StorageUploadGateResult {
  loading: boolean;
  atQuota: boolean;
  canUpload: boolean;
  quota: ReturnType<typeof useStorageQuota>;
}

/** Pure derivation — unit-testable without rendering the hook. */
export function gateFromQuota(quota: { loading: boolean; atQuota: boolean }): Pick<StorageUploadGateResult, "loading" | "atQuota" | "canUpload"> {
  return {
    loading: quota.loading,
    atQuota: quota.atQuota,
    canUpload: !quota.loading && !quota.atQuota,
  };
}

export function useStorageUploadGate(orgId: string | null | undefined): StorageUploadGateResult {
  const quota = useStorageQuota(orgId);
  return {
    ...gateFromQuota(quota),
    quota,
  };
}

/** Inline warning banner (rendered above the upload trigger). */
export function StorageQuotaWarning({ quota }: { quota: ReturnType<typeof useStorageQuota> }): JSX.Element | null {
  if (quota.loading || !quota.atQuota) return null;
  return (
    <Alert variant="warning">
      Storage limit reached — {fmtCompactRupees(quota.usedBytes)} of {fmtCompactRupees(quota.totalBytes)} used.
      Delete files or upgrade to upload more.
    </Alert>
  );
}
