// SiteTrack Pro — PWA install + update hooks (ST-013).
// Provides: an install-prompt affordance (beforeinstallprompt), and an
// "update available" signal from the network-first service worker.

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// --- Web Push subscription helpers (migration 266) --------------------------

/** Live VAPID public key — RFC 8291 applicationServerKey for browser subscribe. */
export const VAPID_PUBLIC_KEY =
  "BLD3cGYfNgigbEMWpa5u2HtHU-7fIP9Q8Zr-nlhnalAWnpGEuJH61EvtqTnCIHtWcS4yoCDhqayF9-amZP9Lhh4";

/** Convert a URL-safe base64 (no padding) string to its raw bytes. */
export function urlBase64ToUint8Array(input: string): Uint8Array<ArrayBuffer> {
  const t = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4 === 0 ? 0 : 4 - (t.length % 4);
  const bin = atob(t + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type PushResult = { ok: true; endpoint?: string } | { ok: false; error: string };

async function currentRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Subscribe this browser to Web Push and persist via save_push_subscription
 *  (SECURITY DEFINER — always writes the caller's own row). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function subscribeToWebPush(client: any): Promise<PushResult> {
  try {
    const reg = await currentRegistration();
    if (!reg?.pushManager) return { ok: false, error: "push-unsupported" };
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      await sub.unsubscribe().catch(() => {});
      return { ok: false, error: "push-subscription-incomplete" };
    }
    const { error } = await client.rpc("save_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth_secret: auth,
    });
    if (error) {
      await sub.unsubscribe().catch(() => {});
      return { ok: false, error: String(error.message ?? error) };
    }
    return { ok: true, endpoint };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Opt out: drop the active subscription and clear the stored one via
 *  clear_push_subscription (SECURITY DEFINER, caller's own row). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function unsubscribeWebPush(client: any): Promise<PushResult> {
  try {
    const reg = await currentRegistration();
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
    const { error } = await client.rpc("clear_push_subscription");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The current browser PushSubscription, or null when none / unsupported. */
export async function getWebPushSubscription(): Promise<PushSubscription | null> {
  const reg = await currentRegistration();
  return reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
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