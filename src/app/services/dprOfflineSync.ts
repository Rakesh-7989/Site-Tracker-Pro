// SiteTrack Pro — Sprint 2 offline DPR sync (connectivity → drain).
//
// Wires the IndexedDB offline queue (offlineQueue) to the real WhatsApp DPR
// Edge Function: when the device comes back online (or the hook mounts), we
// drain every queued "dpr" intent through `whatsapp_dpr_send`. Retries +
// backoff + GC live in offlineQueue.drain.
//
// `useOfflineSync` is the React hook the composer/history use to surface a
// live "N queued" indicator and to trigger a drain on reconnect.

import { useEffect, useState } from "react";
import { drain, queueDepth, type QueueItem } from "../../lib/platform/offlineQueue";
import { isOnline, onConnectivityChange } from "../../lib/platform/offline";
import { invokeSendDpr, isDeferredDprQueuePayload, applyMediaRefs, uploadDprMedia } from "@/app/services/dprSubmit";

import { getClient } from "../../lib/supabase/supabase";

/**
 * Drain the offline queue. Only kind "dpr" intents have a real send; other
 * kinds (voice/photo) have no consumer yet, so we mark them ok to clear them
 * rather than let them spam retries for 7 days.
 *
 * For G1 offline-deferred media (photo/voice Blob stored alongside the payload
 * when `submitDpr` was offline), the Blobs are uploaded now that we are back
 * online — then the enriched payload is sent to the Edge Function. The upload
 * is idempotent (storage upsert on sha256 path), so a retry that re-uploads
 * the same content is safe.
 */
export async function drainDprQueue(client: Awaited<ReturnType<typeof getClient>>): Promise<{ sent: number; failed: number; deferred: number; gc: number }> {
  return drain({
    online: isOnline(),
    send: async (item: QueueItem) => {
      if (item.kind !== "dpr") return { ok: true };
      try {
        const raw: unknown = item.payload;
        if (isDeferredDprQueuePayload(raw)) {
          const up = await uploadDprMedia(client, raw.media, {
            orgId: raw.orgId || (raw.payload as unknown as { org_id?: string })?.org_id || "",
            photoTakenAt: (raw.payload as unknown as { photo_taken_at?: string | null })?.photo_taken_at ?? null,
          });
          if (!up.ok) return { ok: false, error: up.error };
          const enriched = applyMediaRefs(raw.payload, up.refs);
          const res = await invokeSendDpr(client, enriched as never);
          return { ok: res.ok, error: res.error };
        }
        const res = await invokeSendDpr(client, raw as never);
        return { ok: res.ok, error: res.error };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export interface OfflineSyncState {
  queued: number;
  draining: boolean;
}

/**
 * Mount once per signed-in surface: drains on mount + on reconnect, and
 * tracks the queued-item count for an indicator. Client is resolved lazily
 * (getClient) so this works before the Supabase client is ready.
 */
export function useOfflineSync(intervalMs = 30_000): OfflineSyncState {
  const [state, setState] = useState<OfflineSyncState>({ queued: 0, draining: false });

  useEffect(() => {
    let disposed = false;

    const run = async (opts: { drainQueue: boolean }) => {
      if (disposed) return;
      const client = await getClient();
      if (!client || disposed) return;

      if (opts.drainQueue) {
        setState(s => ({ ...s, draining: true }));
        try {
          await drainDprQueue(client);
        } finally {
          if (!disposed) setState(s => ({ ...s, draining: false }));
        }
      }

      if (!disposed) {
        const depth = await queueDepth();
        if (!disposed) setState({ queued: depth.total, draining: false });
      }
    };

    void run({ drainQueue: true });
    const unsub = onConnectivityChange(online => {
      if (online) void run({ drainQueue: true });
    });
    const poll = setInterval(() => void run({ drainQueue: false }), intervalMs);

    return () => {
      disposed = true;
      unsub?.();
      if (poll) clearInterval(poll);
    };
  }, [intervalMs]);

  return state;
}

export { isOnline };
