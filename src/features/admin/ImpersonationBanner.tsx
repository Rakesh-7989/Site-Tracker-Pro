// SiteTrack Pro — v3 impersonation banner (hardened P1).
//
// Fixed top banner shown when a superadmin is impersonating another user.
// Shows reason + countdown + auto-expiry. Orange so it is unmistakable.

import { useEffect, useState } from "react";
import { useImpersonation, remainingMs } from "./ImpersonationContext";
import { Icon } from "@/components/ui/atoms";

function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ImpersonationBanner(): JSX.Element | null {
  const { impersonating, stopImpersonating } = useImpersonation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!impersonating) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [impersonating]);

  if (!impersonating) return null;

  const ms = remainingMs(impersonating, now);
  const expired = ms <= 0;

  return (
    <div className="shrink-0 bg-accent text-white flex flex-col gap-1 px-4 py-2 shadow-hover">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold flex items-center gap-2 flex-1 truncate">
          <Icon name="eye" size={14} />
          Impersonating <span className="font-semibold">{impersonating.asUser.name}</span> ({impersonating.asUser.role}) — as{" "}
          <span className="font-semibold">{impersonating.realUser.name}</span>
          <span className="hidden sm:inline text-white/80 font-normal truncate"> — {impersonating.reason}</span>
          <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-mono bg-white/20 rounded px-1.5 py-0.5">
            {expired ? "expired" : fmtRemaining(ms)}
          </span>
        </div>
        <button
          onClick={stopImpersonating}
          className="px-3 py-1 bg-ink text-accent-light text-xs font-semibold rounded-md hover:bg-ink transition flex-shrink-0"
        >
          Stop &amp; return to admin
        </button>
      </div>
      <div className="sm:hidden text-[11px] text-white/80 truncate">{impersonating.reason}</div>
    </div>
  );
}
