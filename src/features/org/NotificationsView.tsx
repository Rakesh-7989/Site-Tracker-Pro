// SiteTrack Pro — Notifications inbox (/notifications). The current user's
// in-app notifications (RLS-scoped). Mark read + deep-link navigation.
// Includes notification type preferences persisted to localStorage.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Button, Spinner, Alert, Icon,
} from "@/components/ui/atoms";
import { listNotifications, markRead, markAllRead, type Notification } from "@/app/queries/notificationQueries";

 
import { getClient } from "@/lib/supabase/supabase";
import { loadNotificationPrefs, saveNotificationPrefs, getEnabledNotificationTypes, DEFAULT_NOTIF_PREFS } from "@/lib/integrations/notificationPrefs";

const fmtTs = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };

export function NotificationsView(): JSX.Element {
  const navigate = useNavigate();

  // --- Notification preferences ---
  const [prefs] = useState(() => {
    const loaded = loadNotificationPrefs();
    return loaded || { role: "client" as const, ...DEFAULT_NOTIF_PREFS.client };
  });

  // Auto-save preferences on change
  useEffect(() => {
    saveNotificationPrefs(prefs);
  }, [prefs]);

  const enabledTypes = getEnabledNotificationTypes(prefs, prefs.role);

  // --- Notifications data ---
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listNotifications(client); if (res.ok) { setRows(res.data.filter(n => enabledTypes.includes(n.kind))); }
    else { setError(res.error); }
  }, [enabledTypes]);

  useEffect(() => { void reload(); }, [reload]);

  const open = async (n: Notification) => {
    if (!n.readAt) { const client = await getClient(); if (client) await markRead(client, n.id); }
    if (n.link && n.link.startsWith("/")) navigate(n.link);
    else void reload();
  };
  const allRead = async () => {
    setBusy(true); const client = await getClient(); if (client) await markAllRead(client); await reload(); setBusy(false);
  };

  const unread = rows.filter(r => !r.readAt).length;

  // --- UI ---
  return (
    <div className="max-w-2xl mx-auto space-y-4 p-4 md:p-6">
      {/* Preferences bar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <Button
          title="Notification preferences"
          onClick={() => navigate("/org/notification-preferences")}
          className="flex items-center gap-1"
        >
          <Icon name="bell" size={18} />
        </Button>
        {unread > 0 && (
          <Button size="sm" variant="secondary" onClick={() => void allRead()} disabled={busy}>
            {busy ? <Spinner size={14} /> : `Mark all read (${unread})`}
          </Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
        : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-fg-secondary">
            <Icon name="bell" size={24} className="mx-auto text-fg-tertiary mb-2" />
            You're all caught up.
          </Card>
        ) : <div className="space-y-2">{rows.map(n => (
          <button type="button" key={n.id} onClick={() => void open(n)} className="w-full text-left block">
            <Card className={`p-3 flex items-start gap-3 transition ${n.link ? "hover:border-accent" : ""} ${n.readAt ? "" : "border-accent bg-accent-tint"}`}>
              <div className="w-8 h-8 rounded-lg bg-secondary text-fg-secondary grid place-items-center flex-shrink-0 mt-0.5">
                <Icon name="bell" size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-fg-primary flex items-center gap-2">{n.title}{!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />}</div>
                {n.body && <div className="text-[12px] text-fg-secondary">{n.body}</div>}
                <div className="text-[11px] text-fg-tertiary mt-0.5">{fmtTs(n.createdAt)}{n.link ? " · tap to open" : ""}</div>
              </div>
            </Card>
          </button>
        ))}</div>}
    </div>
  );
}