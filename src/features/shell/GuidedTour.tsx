// SiteTrack Pro — §2.1 first-run guided tour.
//
// A lightweight spotlight + tooltip walkthrough shown to new users who have not
// finished onboarding yet (per org, remembered in localStorage). Frontend-only:
// the gate is injectable so tests can bypass navigation/supabase entirely.
//
// Anchors are CSS selectors resolved against the verified shell DOM (sidebar
// links). Steps whose anchor is absent (module/capability-gated nav hidden) are
// skipped automatically.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";

import { useAuth } from "@/auth";
import type { AuthSession } from "@/auth/types";
import { Button } from "@/components/ui/atoms";
import { isOnboardingDone } from "@/app/queries/onboardingQueries";
import { getTypedClient } from "@/lib/supabase/db";
import { useT } from "@/i18n/I18nProvider";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** One tour card. `anchor` is a CSS selector to spotlight (undefined = centered card). */
export interface TourStep {
  id: string;
  titleKey: string;
  bodyKey: string;
  anchor?: string;
}

/** Steps are progressively filtered down to the anchors actually present. */
export const GUIDED_TOUR_STEPS: TourStep[] = [
  { id: "welcome", titleKey: "guidedTour.welcomeTitle", bodyKey: "guidedTour.welcomeBody" },
  { id: "dpr", titleKey: "guidedTour.dprTitle", bodyKey: "guidedTour.dprBody", anchor: 'a[href="/dpr"]' },
  { id: "projects", titleKey: "guidedTour.projectsTitle", bodyKey: "guidedTour.projectsBody", anchor: 'a[href="/projects"]' },
  { id: "calendar", titleKey: "guidedTour.calendarTitle", bodyKey: "guidedTour.calendarBody", anchor: 'a[href="/calendar"]' },
  { id: "chat", titleKey: "guidedTour.chatTitle", bodyKey: "guidedTour.chatBody", anchor: 'a[href="/chat"]' },
  { id: "dashboard", titleKey: "guidedTour.dashboardTitle", bodyKey: "guidedTour.dashboardBody", anchor: 'a[href="/dashboard"]' },
  { id: "invoices", titleKey: "guidedTour.invoicesTitle", bodyKey: "guidedTour.invoicesBody", anchor: 'a[href="/invoices"]' },
  { id: "finish", titleKey: "guidedTour.finishTitle", bodyKey: "guidedTour.finishBody" },
];

const TOUR_SEEN_PREFIX = "sitetrack:tour:seen:";
const TOUR_SEEN_SUFFIX = ":v1";
const OVERLAY_BACKDROP = "rgba(2, 6, 23, 0.55)";

export const TOUR_STORAGE_KEY = (orgId: string): string => `${TOUR_SEEN_PREFIX}${orgId}${TOUR_SEEN_SUFFIX}`;

/** Returns only the steps whose optional anchor resolves in the DOM (anchored present, unanchored always). */
export function filterStepsForDom(steps: TourStep[], isPresent: (selector: string) => boolean): TourStep[] {
  return steps.filter((s) => !s.anchor || isPresent(s.anchor));
}

export function readTourSeen(orgId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY(orgId)) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(orgId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY(orgId), "1");
  } catch {
    /* storage unavailable — tour keeps showing, harmless */
  }
}

export type GuidedTourGate = (session: AuthSession | null) => Promise<boolean>;

/**
 * Default gate: show the tour only for a ready session that has NOT finished
 * onboarding yet AND has not seen the tour for the active org. Fail-open on
 * lookup errors so no one is permanently locked out of the walkthrough.
 */
export const initGuidedTour: GuidedTourGate = async (session) => {
  const user = session?.user;
  if (!user) return false;
  if (user.profileCompleted === false) return false;
  const orgId = session.activeOrgId;
  if (!orgId) return false;
  if (readTourSeen(orgId)) return false;
  try {
    const sb = await getTypedClient();
    if (!sb) return true;
    const done = await isOnboardingDone(sb, orgId);
    return !done;
  } catch {
    return true;
  }
};

interface CardPlacement {
  top: number;
  left: number;
  width: number;
  below: boolean;
}

const CARD_WIDTH = 360;
const CARD_MAX = (): number => Math.min(CARD_WIDTH, window.innerWidth - 24);
const EDGE = 12;
const GAP = 12;

function placeCard(rect: DOMRect | null): CardPlacement {
  const width = CARD_MAX();
  if (!rect) {
    // Centered fallback for unanchored steps (welcome / finish).
    return { top: Math.max(EDGE, window.innerHeight / 2 - 140), left: Math.max(EDGE, (window.innerWidth - width) / 2), width, below: true };
  }
  const left = Math.max(EDGE, Math.min(window.innerWidth - width - EDGE, rect.left + rect.width / 2 - width / 2));
  const below = window.innerHeight - rect.bottom - EDGE > 220;
  const top = below ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - 200);
  return { top, left, width, below };
}

export interface GuidedTourProps {
  gate?: GuidedTourGate;
}

export function GuidedTour({ gate = initGuidedTour }: GuidedTourProps): JSX.Element | null {
  const { session } = useAuth();
  const t = useT();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [status, setStatus] = useState<"checking" | "active" | "hidden">("checking");
  const [stepIndex, setStepIndex] = useState(0);
  const [anchorBox, setAnchorBox] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<CardPlacement>({ top: 0, left: 0, width: CARD_WIDTH, below: true });
  const cardRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    if (session?.activeOrgId) markTourSeen(session.activeOrgId);
    setStatus("hidden");
  }, [session]);

  // Resolve the trailing session/context asynchronously (gate is injectable in tests).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isDesktop) {
        setStatus("hidden");
        return;
      }
      const ok = await gate(session);
      if (cancelled) return;
      setStatus(ok ? "active" : "hidden");
    })();
    return () => { cancelled = true; };
  }, [isDesktop, gate, session]);

  const shownSteps = useMemo(() => {
    if (status !== "active") return [];
    return filterStepsForDom(GUIDED_TOUR_STEPS, (sel) => Boolean(document.querySelector(sel)));
  }, [status]);

  const clampedIndex = Math.min(stepIndex, Math.max(0, shownSteps.length - 1));
  const step = shownSteps[clampedIndex];

  // Keep the spotlight pinned to its anchor across scroll / resize / layout drift.
  useEffect(() => {
    if (status !== "active" || !step?.anchor) {
      setAnchorBox(null);
      setCardPos(placeCard(null));
      return;
    }
    const update = () => {
      const el = document.querySelector<HTMLElement>(step.anchor as string);
      const rect = el ? el.getBoundingClientRect() : null;
      setAnchorBox(rect);
      setCardPos(placeCard(rect));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const iv = window.setInterval(update, 600);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.clearInterval(iv);
    };
  }, [status, step?.id, step?.anchor]);

  // Clamp the rendered card inside the viewport once its real size is known.
  useEffect(() => {
    if (status !== "active") return;
    const card = cardRef.current;
    if (!card) return;
    const h = card.offsetHeight;
    setCardPos((p) => {
      let top = p.top;
      const bottom = top + h;
      if (p.below && bottom > window.innerHeight - EDGE) top = Math.max(EDGE, window.innerHeight - h - EDGE);
      if (!p.below && top < EDGE) top = EDGE;
      const left = Math.max(EDGE, Math.min(window.innerWidth - card.offsetWidth - EDGE, p.left));
      if (top === p.top && left === p.left) return p;
      return { ...p, top, left };
    });
  }, [status, step?.id, anchorBox, cardPos.below]);

  // Esc dismisses.
  useEffect(() => {
    if (status !== "active") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, dismiss]);

  const goNext = useCallback(() => {
    if (clampedIndex >= shownSteps.length - 1) {
      dismiss();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [shownSteps.length, clampedIndex, dismiss]);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  if (status !== "active" || !step) return null;

  const isFinish = step.id === "finish";
  const hasSpotlight = Boolean(step.anchor && anchorBox);

  return (
    <div
      role="dialog"
      aria-label={t("guidedTour.ariaLabel")}
      className="fixed inset-0 z-[70] pointer-events-none"
    >
      {hasSpotlight && anchorBox ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: anchorBox.top,
            left: anchorBox.left,
            width: anchorBox.width,
            height: anchorBox.height,
            border: "2px solid var(--st-accent)",
            boxShadow: `0 0 0 100vmax ${OVERLAY_BACKDROP}`,
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={{ backgroundColor: OVERLAY_BACKDROP }} />
      )}
      <div
        ref={cardRef}
        style={{ top: cardPos.top, left: cardPos.left, width: cardPos.width }}
        className="pointer-events-auto absolute rounded-xl border border-border bg-card p-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-body-xs text-fg-tertiary">{t("guidedTour.step", { current: String(clampedIndex + 1), total: String(shownSteps.length) })}</span>
          <Button size="sm" variant="ghost" onClick={dismiss}>{t("guidedTour.skip")}</Button>
        </div>
        <h2 className="text-h4 text-fg-primary mb-1">{t(step.titleKey)}</h2>
        <p className="text-body-sm text-fg-secondary">{t(step.bodyKey)}</p>
        <div className="flex justify-end gap-2 mt-3">
          {clampedIndex > 0 && (
            <Button size="sm" variant="secondary" onClick={goPrev}>{t("guidedTour.prev")}</Button>
          )}
          {isFinish ? (
            <Button size="sm" onClick={dismiss}>{t("guidedTour.done")}</Button>
          ) : (
            <Button size="sm" onClick={goNext}>{t("guidedTour.next")}</Button>
          )}
        </div>
      </div>
    </div>
  );
}