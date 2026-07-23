// SiteTrack Pro — v3 impersonation banner.
//
// Fixed top banner shown when an admin is impersonating another user.
// Mirrors the legacy App.jsx banner (safety-orange background, user info,
// "Stop & return to admin" button).

import { useImpersonation } from "./ImpersonationContext";
import { Icon } from "@/components/ui/atoms";

export function ImpersonationBanner(): JSX.Element | null {
  const { impersonating, stopImpersonating } = useImpersonation();

  if (!impersonating) return null;

  return (
    <div className="shrink-0 bg-safety-500 text-white flex items-center justify-between gap-3 px-4 py-2 shadow-hover">
      <div className="text-xs font-semibold flex items-center gap-2 flex-1 truncate">
        <Icon name="eye" size={14} />
        Impersonating <span className="font-semibold">{impersonating.asUser.name}</span> ({impersonating.asUser.role}) — as{" "}
        <span className="font-semibold">{impersonating.realUser.name}</span>
      </div>
      <button
        onClick={stopImpersonating}
        className="px-3 py-1 bg-ink-900 text-safety-400 text-xs font-semibold rounded-md hover:bg-ink-800 transition"
      >
        Stop &amp; return to admin
      </button>
    </div>
  );
}
