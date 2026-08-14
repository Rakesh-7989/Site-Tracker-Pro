// SiteTrack Pro — Notification Preferences View.
// Allows users to toggle notification types per role.
// Persists preferences to localStorage via notificationPrefs storage.

import { useState, useEffect } from "react";
import { loadNotificationPrefs, saveNotificationPrefs, getEnabledNotificationTypes, toggleNotifType, DEFAULT_NOTIF_PREFS } from "@/lib/notificationPrefs";

/** NotificationPreferencesView — toggle notification types per role.
 * 
 * Renders a settings-style form with toggle switches for each notification type.
 * Preferences are stored in localStorage and persist across sessions.
 */
export function NotificationPreferencesView(props) {
  const { onClose } = props;
  const [prefs, setPrefs] = useState(() => loadNotificationPrefs() || { role: "client", ...DEFAULT_NOTIF_PREFS.client });
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // Auto-save on every change (debounced in storage layer)
  useEffect(() => {
    saveNotificationPrefs(prefs);
  }, [prefs]);

  const enabledTypes = getEnabledNotificationTypes(prefs, prefs.role);

  const handleToggle = (type) => {
    const next = toggleNotifType(prefs, type, prefs.role || "client");
    setPrefs(next);
  };

  const handleReset = () => {
    setPrefs({ role: prefs.role || "client", ...DEFAULT_NOTIF_PREFS[prefs.role] || DEFAULT_NOTIF_PREFS.client });
    setShowReset(false);
  };

  const roleDisplayNames = {
    architect: "Architect",
    pm: "Project Manager",
    client: "Client",
    contractor: "Contractor",
  };

  const roleOptions = [
    { value: "architect", label: "Architect" },
    { value: "pm", label: "Project Manager" },
    { value: "client", label: "Client" },
    { value: "contractor", label: "Contractor" },
  ];

  const notificationTypes = [
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

  return (
    <div className="rounded-2xl bg-bg-primary p-6 max-w-lg mx-auto">
      <h2 className="text-xl font-semibold text-fg-primary mb-6">
        Notification Preferences — {roleDisplayNames[prefs.role] || "Client"}
      </h2>

      {/* Role selector */}
      <div className="mb-4">
        <p className="text-sm text-fg-tertiary mb-2">Select your role:</p>
        {roleOptions.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-center px-3 py-1 rounded ${prefs.role === opt.value ? "bg-primary" : "text-fg-secondary hover:bg-bg-secondary transition-colors"}`}
            onClick={() => setPrefs({ ...prefs, role: opt.value })}
          >
            <input
              type="radio"
              value={opt.value}
              checked={prefs.role === opt.value}
              className="mr-2 opacity-0 peer"
            />
            {opt.label}
          </label>
        ))}
      </div>

      {/* Notification type toggles */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {notificationTypes.map((nt) => {
          const isEnabled = enabledTypes.includes(nt.key);
          const defaultValue = DEFAULT_NOTIF_PREFS[prefs.role]?.[nt.key];
          const isDefault = isEnabled === defaultValue;

          return (
            <div
              key={nt.key}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <span className="text-sm text-fg-secondary">{nt.label}</span>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => handleToggle(nt.key)}
                  className="w-4 h-4 rounded bg-primary text-white peer"
                />
                <span className={`text-sm ${isDefault ? "opacity-50" : "opacity-100"}`}>
                  {"- Default"}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end mt-6 gap-3 pt-6 border-t">
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded text-sm text-error hover:bg-error/10"
          disabled={showReset}
        >
          Reset to {roleDisplayNames[prefs.role] || "Client"} Defaults
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded bg-primary text-white hover:bg-primary/90"
        >
          Close
        </button>
        <button
          onClick={() => {
            setSaving(true);
            setTimeout(() => {
              saveNotificationPrefs(prefs);
              setSaving(false);
              typeof onClose === "function" && onClose();
            }, 100);
          }}
          className="px-4 py-2 rounded bg-success text-white hover:bg-success/90"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

/* End of NotificationPreferencesView.jsx */