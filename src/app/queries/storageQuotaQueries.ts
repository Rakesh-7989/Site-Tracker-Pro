// SiteTrack Pro — B5 storage quota queries (P-H3).
// Pure helpers: used_bytes / total_bytes / used_pct across 3 private buckets.
// All read-only; no DB writes. Exported for use in UI components.

import type { TypedSupabaseClient } from "@/lib/supabase/db";

/** Per-bucket usage snapshot. */
export interface StorageByBucket {
  bucket: 'deliverables' | 'dpr-media' | 'research-docs';
  used_bytes: number;
  total_bytes: number;
  used_pct: number;  // 0–100, clamped
}

/** Async: read the org's quota snapshot for all three private buckets via the RPC. */
export async function storageByBucket(
  client: TypedSupabaseClient,
  orgId: string
): Promise<{ ok: boolean; data: StorageByBucket[] | null; error: string | null }> {
  const { data, error } = await client.rpc('storage_usage_by_org', {
    p_org_id: orgId,
  });
  if (error) return { ok: false, data: null, error: String(error.message ?? error) };
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  return { ok: true, data: rows as unknown as StorageByBucket[], error: null };
}

/** Sum of used_bytes across all buckets. */
export function storageUsed(data: StorageByBucket[]): number {
  if (!data || data.length === 0) return 0;
  return data.reduce((sum, b) => sum + b.used_bytes, 0);
}

/** Sum of total_bytes across all buckets. */
export function storageTotal(data: StorageByBucket[]): number {
  if (!data || data.length === 0) return 0;
  return data.reduce((sum, b) => sum + b.total_bytes, 0);
}

/** Weighted percent (0–100) across all buckets. */
export function storagePercent(data: StorageByBucket[]): number {
  const used = storageUsed(data);
  const total = storageTotal(data);
  return total > 0 ? Math.round(used / total * 100) : 0;
}

/** Remaining bytes (total - used). */
export function storageRemaining(data: StorageByBucket[]): number {
  const total = storageTotal(data);
  return total > 0 ? total - storageUsed(data) : total;
}