// SiteTrack Pro — "Pro trial · N days left" pill for the shell top bar (§5.6).
//
// Shows only while the active org is inside an active Pro trial. The trial
// state is read-side resolved in getPlanCaps (subscriptions RLS is admin-only,
// so this surfaces for the owner/admins who can read it — exactly who needs the
// countdown). Hidden entirely when not in a trial.

import { Link } from "react-router-dom";

import { useT } from "@/i18n/I18nProvider";
import { usePlanCaps } from "@/auth/usePlanCaps";
import { useAuth } from "@/auth/OrganizationContext";

/** Whole days remaining until trialEndsAt (1 = today, 0 = none). Pure, testable. */
export function trialDaysLeft(trialEndsAt: string | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const end = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(end)) return 0;
  const ms = end - now.getTime();
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 86_400_000));
}

export function TrialBanner(): JSX.Element | null {
  const t = useT();
  const { trialActive, trialEndsAt } = usePlanCaps();
  // Owner-only countdown: the trial belongs to the org owner. Non-admin
  // members cannot read subscriptions anyway (RLS), but gate explicitly so
  // the pill can never leak to the whole team if that ever widens.
  const { session } = useAuth();
  const membership =
    session && session.activeOrgId
      ? session.orgs.find((m) => m.orgId === session.activeOrgId)
      : undefined;
  const isOwner = !!membership?.isAdmin || session?.user.identityRole === "superadmin";
  if (!trialActive || !isOwner) return null;
  const days = trialDaysLeft(trialEndsAt);
  return (
    <Link
      to="/org/billing"
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 bg-accent-tint text-accent hover:bg-accent/15 transition"
      title={t("shell.trialBanner")}
    >
      <span aria-hidden="true">✦</span>
      {days === 1 ? t("shell.trialBannerDay", { days }) : t("shell.trialBanner", { days })}
    </Link>
  );
}