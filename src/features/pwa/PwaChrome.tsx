// SiteTrack Pro — PWA install + update-toast (ST-013).
// A small floating control: shows an "Install app" button when the browser
// fires beforeinstallprompt (and it isn't already installed), and a persistent
// "Update available" chip when a newer service worker is ready, with a Reload.

import { usePwaInstall } from "@/lib/pwa";

export function PwaChrome(): JSX.Element {
  const { canInstall, updateReady, refresh, promptInstall } = usePwaInstall();

  if (!canInstall && !updateReady) return <></>;

  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {updateReady && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-panel border border-accent/40 shadow-lg text-sm">
          <span className="text-fg-primary font-semibold">Update available</span>
          <button onClick={refresh} className="px-3 py-1 rounded-lg bg-accent text-white font-semibold hover:opacity-90">
            Reload
          </button>
        </div>
      )}
      {canInstall && (
        <button
          onClick={() => void promptInstall()}
          className="px-4 py-2.5 rounded-xl bg-panel border border-accent/50 shadow-lg text-sm font-semibold text-accent-2 hover:bg-secondary transition"
        >
          Install app
        </button>
      )}
    </div>
  );
}