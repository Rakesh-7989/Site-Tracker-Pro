// SiteTrack Pro - Notification Preferences View.
// Allows users to toggle notification types per role.
// Persists preferences to localStorage via notificationPrefs storage.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/atoms";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  getEnabledNotificationTypes,
  toggleNotifType,
  DEFAULT_NOTIF_PREFS,
  type NotifPrefs,
  type NotifTypeKey,
  type PrefRole,
} from "@/lib/integrations/notificationPrefs";
import { getClient } from "@/lib/supabase/supabase";
import {
  getWebPushSubscription,
  subscribeToWebPush,
  unsubscribeWebPush,
} from "@/lib/platform/pwa";

const ROLE_DISPLAY_NAMES: Record<PrefRole, string> = {
  architect: "Architect",
  pm: "Project Manager",
  client: "Client",
  contractor: "Contractor",
};

const ROLE_OPTIONS: { value: PrefRole; label: string }[] = [
  { value: "architect", label: "Architect" },
  { value: "pm", label: "Project Manager" },
  { value: "client", label: "Client" },
  { value: "contractor", label: "Contractor" },
];

const NOTIFICATION_TYPES: { key: NotifTypeKey; label: string; category: string }[] = [
  { key: "dpr_submitted", label: "DPR Submitted", category: "DPR" },
  { key: "dpr_reminder", label: "DPR Reminder", category: "DPR" },
  { key: "dpr_approved", label: "DPR Approved", category: "DPR" },
  { key: "dpr_rejected", label: "DPR Rejected", category: "DPR" },
  { key: "dpr_deadline_approaching", label: "DPR Deadline Approaching", category: "DPR" },
  { key: "project_milestone", label: "Milestone Reached", category: "Project" },
  { key: "project_deadline_approaching", label: "Project Deadline Approaching", category: "Project" },
  { key: "invoice_generated", label: "Invoice Generated", category: "Invoice" },
  { key: "invoice_overdue", label: "Invoice Overdue", category: "Invoice" },
  { key: "invoice_paid", label: "Invoice Paid", category: "Invoice" },
  { key: "ra_bill_generated", label: "RA Bill Generated", category: "RA Bill" },
  { key: "ra_bill_paid", label: "RA Bill Paid", category: "RA Bill" },
  { key: "welcome", label: "Welcome Email", category: "Onboarding" },
  { key: "weekly_digest", label: "Weekly Digest", category: "Summary" },
  { key: "system_alert", label: "System Alert", category: "Alert" },
];

/** NotificationPreferencesView — toggle notification types per role.
 *
 * Renders a settings-style form with toggles for each notification type.
 * Preferences are stored in localStorage and persist across sessions.
 */
export function NotificationPreferencesView({ onClose }: { onClose?: () => void }) {
  const [prefs, setPrefs] = useState<NotifPrefs & { role: PrefRole }>(
    () => loadNotificationPrefs() ?? { role: "client", ...DEFAULT_NOTIF_PREFS.client },
  );
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  // Auto-save on every change
  useEffect(() => {
    saveNotificationPrefs(prefs);
  }, [prefs]);

  // Detect browser push support + current subscription once on mount
  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      const supports =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window;
      setPushSupported(supports);
      if (!supports) return;
      try {
        const sub = await getWebPushSubscription();
        if (!cancelled) setPushEnabled(!!sub);
      } catch {
        if (!cancelled) setPushEnabled(false);
      }
    };
    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const client = await getClient();
      if (!client) {
        setPushError("Backend not configured.");
        return;
      }
      const res = pushEnabled
        ? await unsubscribeWebPush(client)
        : await subscribeToWebPush(client);
      if (res.ok) {
        setPushEnabled(!pushEnabled);
      } else {
        setPushError(res.error);
      }
    } catch (e) {
      setPushError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushBusy(false);
    }
  };

  const enabledTypes = getEnabledNotificationTypes(prefs, prefs.role);

  const handleToggle = (type: NotifTypeKey) => {
    setPrefs({ ...toggleNotifType(prefs, type, prefs.role), role: prefs.role });
  };

  const handleReset = () => {
    setPrefs({ role: prefs.role, ...DEFAULT_NOTIF_PREFS[prefs.role] });
    setShowReset(false);
  };

  return (
    <div className="rounded-2xl bg-bg-primary p-6 max-w-lg mx-auto">
      <h2 className="text-xl font-semibold text-fg-primary mb-6">
        Notification Preferences — {ROLE_DISPLAY_NAMES[prefs.role]}
      </h2>

      {/* Browser push */}
      <div className="mb-6 rounded-2xl border border-default p-4">
        {pushSupported ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg-primary">Browser Push</p>
              <p className="text-xs text-fg-tertiary mt-0.5">
                {pushEnabled === null
                  ? "Checking subscription…"
                  : pushEnabled
                    ? "This browser is subscribed — alerts arrive as native notifications."
                    : "Subscribe this browser to get alerts even when you're not on the page."}
              </p>
              {pushError && <p className="text-xs text-error mt-1">{pushError}</p>}
            </div>
            <Button
              variant={pushEnabled ? "secondary" : "primary"}
              loading={pushBusy}
              disabled={pushEnabled === null}
              onClick={() => void togglePush()}
            >
              {pushEnabled ? "Disable Push" : "Enable Push"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-fg-secondary">
            Browser push isn't supported in this browser.
          </p>
        )}
      </div>

      {/* Role selector */}
      <div className="mb-4">
        <p className="text-sm text-fg-tertiary mb-2">Select your role:</p>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPrefs({ ...prefs, role: opt.value })}
              aria-pressed={prefs.role === opt.value}
              className={`flex items-center px-3 py-1 rounded text-sm transition-colors ${
                prefs.role === opt.value
                  ? "bg-accent-tint text-fg-primary font-medium"
                  : "text-fg-secondary hover:bg-bg-secondary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification type toggles */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {NOTIFICATION_TYPES.map(nt => {
          const isEnabled = enabledTypes.includes(nt.key);
          const defaultValue = DEFAULT_NOTIF_PREFS[prefs.role][nt.key];
          const isDefault = isEnabled === defaultValue;

          return (
            <div
              key={nt.key}
              className="flex items-center justify-between py-2 border-b last:border-0 border-default"
            >
              <span className="text-sm text-fg-secondary">{nt.label}</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => handleToggle(nt.key)}
                  className="w-4 h-4 accent-[var(--st-accent)]"
                />
                <span className={`text-xs ${isDefault ? "opacity-50" : "opacity-100"} text-fg-tertiary`}>
                  Default
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end items-center mt-6 gap-3 pt-6 border-t border-default">
        <Button variant="ghost" onClick={handleReset} disabled={showReset}>
          Reset to {ROLE_DISPLAY_NAMES[prefs.role]} Defaults
        </Button>
        <Button variant="secondary" onClick={() => onClose?.()}>
          Close
        </Button>
        <Button
          variant="primary"
          loading={saving}
          onClick={() => {
            setSaving(true);
            setTimeout(() => {
              saveNotificationPrefs(prefs);
              setSaving(false);
              onClose?.();
            }, 100);
          }}
        >
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
