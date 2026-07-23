// SiteTrack Pro — v3 connection-status hook.
// Mirrors the legacy App.jsx offline + backend connection pills.

import { useState, useEffect } from "react";

interface ConnState {
  state: "unknown" | "live" | "off" | "degraded" | "error";
  detail: string;
}

export interface ConnectionStatus {
  online: boolean;
  pendingOps: number;
  conn: ConnState;
}

export function useConnectionStatus(): ConnectionStatus {
  const [online, setOnline] = useState(true);
  const [pendingOps, setPendingOps] = useState(0);
  const [conn, setConn] = useState<ConnState>({ state: "unknown", detail: "" });

  useEffect(() => {
    let stopped = false;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const offMod = await import("./offline.js");
        if (stopped) return;
        setOnline(offMod.isOnline());
        setPendingOps(offMod.queueLength());

        const unsub = offMod.onConnectivityChange(setOnline);

        const tick = setInterval(() => {
          if (!stopped) setPendingOps(offMod.queueLength());
        }, 3000);

        const supMod = await import("./supabase.js");
        const probe = async () => {
          if (stopped) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = await (supMod as any).probeConnection() as ConnState;
          if (!stopped) setConn(r);
        };
        await probe();
        const probeTimer = setInterval(probe, 30000);

        cleanup = () => {
          unsub();
          clearInterval(tick);
          clearInterval(probeTimer);
        };
      } catch {
        // offline module or supabase not available
      }
    })();

    return () => {
      stopped = true;
      cleanup?.();
    };
  }, []);

  return { online, pendingOps, conn };
}
