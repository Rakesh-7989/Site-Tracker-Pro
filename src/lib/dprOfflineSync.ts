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
import { drain, queueDepth, type QueueItem } from "./offlineQueue";
import { isOnline, onConnectivityChange } from "./offline";
import { invokeSendDpr } from "@/app/dprSubmit";
 
import { getClient } from "./supabase";

/**
 * Drain the offline queue. Only kind "dpr" intents have a real send; other
 * kinds (voice/photo) have no consumer yet, so we mark them ok to clear them
 * rather than let them spam retries for 7 days.
 */
export async function drainDprQueue(client: any): Promise<{ sent: number; failed: number; deferred: number; gc: number }> {
  return drain({
    online: isOnline(),
    send: async (item: QueueItem) => {
      if (item.kind !== "dpr") return { ok: true };
      try {
        const res = await invokeSendDpr(client, item.payload as never);
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
