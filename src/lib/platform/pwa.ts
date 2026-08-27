// SiteTrack Pro — PWA install + update hooks (ST-013).
// Provides: an install-prompt affordance (beforeinstallprompt), and an
// "update available" signal from the network-first service worker.

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Register the network-first service worker (prod only). Safe: network wins online. */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  if (import.meta.env.SSR) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

export interface PwaState {
  canInstall: boolean;
  /** Whether the served app shell is a network-first refresh pending a reload. */
  updateReady: boolean;
  refresh: () => void;
  promptInstall: () => Promise<boolean>;
}

/**
 * Track PWA installability + a new-service-worker update.
 * `updateReady` flips true when a newer SW has installed+skipped waiting or
 * claimed control, signalling the loaded shell may be stale → user reloads.
 */
export function usePwaInstall(): PwaState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = (e: Event) => {
      if (import.meta.env.DEV) return; // only notify in prod
      const reg = (e as { currentTarget?: { state?: string } })?.currentTarget as unknown as {
        state?: string;
        installing?: { state: string; addEventListener: (t: string, h: () => void) => void };
      } | null;
      const waiting = reg?.installing;
      if (waiting) waiting.addEventListener("statechange", () => {
        if (waiting.state === "installed") setUpdateReady(true);
      });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    navigator.serviceWorker?.addEventListener("controllerchange", () => setUpdateReady(true));
    navigator.serviceWorker?.ready.then((reg) => {
      if (reg.waiting) setUpdateReady(true);
      reg.addEventListener("updatefound", onInstalled as EventListener);
    }).catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setDeferred(null);
    return choice.outcome === "accepted";
  }, [deferred]);

  const refresh = useCallback(() => {
    void navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    window.location.reload();
  }, []);

  return { canInstall: !!deferred, updateReady, refresh, promptInstall };
}