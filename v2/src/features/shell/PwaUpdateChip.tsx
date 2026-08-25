import { useEffect, useState } from "react";
import { useT } from "@/i18n";

export function PwaUpdateChip() {
  const t = useT();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (cancelled || !reg) return;
      if (reg.waiting && navigator.serviceWorker.controller) setReady(true);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setReady(true);
          }
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-card focus-ring"
      >
        {t("shell.updateReady")}
      </button>
    </div>
  );
}
