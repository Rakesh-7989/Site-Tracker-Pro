// SiteTrack Pro — Vendor Portal (Session 28).
//
// Why this exists: the v2 role expansion added `vendor` as a login role but
// the actual view shipping with it was deferred. Without a view, vendor
// accounts can log in but see only an empty sidebar. This portal fills that
// gap with 4 tabs every vendor cares about:
//
//   • Dashboard  — POs awaiting acknowledgement, recent payments, ratings
//   • POs        — full list with filter + accept/decline actions
//   • Materials  — material prices the vendor has quoted vs current market
//   • Messages   — project-scoped DMs (read-only inbox + reply box)
//
// Editorial-cream theme parity. Pure-function lib calls only — no Supabase
// imports here; the orchestrator wires data in.
//
// Lazy-loaded by App.jsx in the 'org' chunk (vendors are tenant users, not
// per-project, so 'org' chunk is the right home — adjust later if needed).

import React, { useState, useMemo } from "react";

/**
 * Top-level VendorPortal — renders the active tab.
 *
 * Props:
 *   user           : current logged-in vendor profile { id, name, org_id }
 *   pos            : array of purchase_orders rows where vendor_id === user.vendor_id
 *   materialPrices : org material_prices rows
 *   messages       : array of message rows scoped to projects this vendor is on
 *   onAccept(po)   : called when vendor accepts a PO
 *   onDecline(po, reason) : called when vendor declines a PO
 *   onSendReply(msg) : called when vendor sends a reply
 */
export function VendorPortal({
  user, pos = [], materialPrices = [], messages = [],
  onAccept = () => {}, onDecline = () => {}, onSendReply = () => {},
  fmtCur = (n) => `₹${(n ?? 0).toLocaleString("en-IN")}`,
}) {
  const [tab, setTab] = useState("dashboard");

  const summary = useMemo(() => ({
    pendingPos: pos.filter(p => p.status === "pending").length,
    approvedPos: pos.filter(p => p.status === "approved").length,
    deliveredPos: pos.filter(p => p.status === "delivered").length,
    pendingAmount: pos.filter(p => p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0),
    deliveredAmount: pos.filter(p => p.status === "delivered").reduce((s, p) => s + (p.amount || 0), 0),
    unreadMessages: messages.filter(m => !(m.read_by || []).some(r => r.user_id === user?.id)).length,
  }), [pos, messages, user?.id]);

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "pos",       label: `POs (${summary.pendingPos})` },
    { id: "materials", label: `Materials (${materialPrices.length})` },
    { id: "messages",  label: `Messages (${summary.unreadMessages})` },
  ];

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto" style={{ fontFamily: "Georgia, serif" }}>
      <div className="mb-6">
        <div className="text-[11px] tracking-widest text-amber-700 font-bold uppercase">— Vendor portal</div>
        <h1 className="text-3xl font-light text-stone-900 mt-1">
          Hello, {user?.name || "Vendor"}.
        </h1>
        <p className="text-stone-600 mt-1 text-sm">
          Your work with this firm at a glance.
        </p>
      </div>

      <nav className="flex gap-2 border-b border-stone-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-amber-600 text-stone-900"
                : "text-stone-500 hover:text-stone-700"
            }`}
            aria-pressed={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && (
        <DashboardPanel summary={summary} fmtCur={fmtCur} recentPos={pos.slice(0, 5)} />
      )}
      {tab === "pos" && (
        <POsPanel pos={pos} onAccept={onAccept} onDecline={onDecline} fmtCur={fmtCur} />
      )}
      {tab === "materials" && (
        <MaterialsPanel prices={materialPrices} fmtCur={fmtCur} />
      )}
      {tab === "messages" && (
        <MessagesPanel messages={messages} userId={user?.id} onSendReply={onSendReply} />
      )}
    </div>
  );
}

// ── Panels ───────────────────────────────────────────────────────────────

function DashboardPanel({ summary, recentPos, fmtCur }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Tile label="Pending POs" value={summary.pendingPos} caption={fmtCur(summary.pendingAmount)} />
      <Tile label="Approved POs" value={summary.approvedPos} />
      <Tile label="Delivered (revenue)" value={summary.deliveredPos} caption={fmtCur(summary.deliveredAmount)} />
      <div className="md:col-span-3 mt-4">
        <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">
          Recent purchase orders
        </h3>
        {recentPos.length === 0 ? (
          <p className="text-stone-500 italic text-sm">No POs yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-stone-500 text-xs uppercase">
                <th className="py-2 border-b border-stone-200">PO #</th>
                <th className="py-2 border-b border-stone-200">Project</th>
                <th className="py-2 border-b border-stone-200">Amount</th>
                <th className="py-2 border-b border-stone-200">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentPos.map(po => (
                <tr key={po.id}>
                  <td className="py-2 border-b border-stone-100 font-mono text-xs">{po.po_no}</td>
                  <td className="py-2 border-b border-stone-100">{po.project_name || po.project_id}</td>
                  <td className="py-2 border-b border-stone-100">{fmtCur(po.amount)}</td>
                  <td className="py-2 border-b border-stone-100">
                    <StatusBadge status={po.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function POsPanel({ pos, onAccept, onDecline, fmtCur }) {
  const [filter, setFilter] = useState("all");
  const filtered = pos.filter(p => filter === "all" || p.status === filter);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {["all", "pending", "approved", "delivered", "cancelled"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded ${
              filter === f
                ? "bg-amber-600 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-stone-500 italic text-sm">No POs in this view.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map(po => (
            <li
              key={po.id}
              className="p-4 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-between"
            >
              <div>
                <div className="font-mono text-xs text-stone-500">{po.po_no}</div>
                <div className="text-stone-900">{po.items || "Items unspecified"}</div>
                <div className="text-xs text-stone-500 mt-1">
                  {po.project_name} · {fmtCur(po.amount)} · GST {po.gst}%
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={po.status} />
                {po.status === "pending" && (
                  <>
                    <button
                      onClick={() => onAccept(po)}
                      className="text-xs px-3 py-1 bg-stone-900 text-white rounded hover:bg-stone-800"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => onDecline(po, "Vendor declined")}
                      className="text-xs px-3 py-1 bg-white border border-stone-300 rounded hover:bg-stone-50"
                    >
                      Decline
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MaterialsPanel({ prices, fmtCur }) {
  if (!prices || prices.length === 0) {
    return <p className="text-stone-500 italic text-sm">No material prices recorded.</p>;
  }
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-stone-500 text-xs uppercase">
          <th className="py-2 border-b border-stone-200">Material</th>
          <th className="py-2 border-b border-stone-200">Unit</th>
          <th className="py-2 border-b border-stone-200">Your rate</th>
          <th className="py-2 border-b border-stone-200">Effective</th>
        </tr>
      </thead>
      <tbody>
        {prices.map(p => (
          <tr key={p.id}>
            <td className="py-2 border-b border-stone-100">{p.display_name || p.material}</td>
            <td className="py-2 border-b border-stone-100 font-mono text-xs">{p.unit}</td>
            <td className="py-2 border-b border-stone-100">{fmtCur(p.rate)}</td>
            <td className="py-2 border-b border-stone-100 text-xs text-stone-500">
              {p.effective_at?.slice(0, 10)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MessagesPanel({ messages, userId, onSendReply }) {
  const [reply, setReply] = useState("");
  const sorted = [...(messages || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      <ul className="space-y-2 max-h-[400px] overflow-auto mb-4">
        {sorted.length === 0 ? (
          <li className="text-stone-500 italic text-sm">No messages.</li>
        ) : (
          sorted.map(m => {
            const isUnread = !(m.read_by || []).some(r => r.user_id === userId);
            return (
              <li
                key={m.id}
                className={`p-3 rounded ${isUnread ? "bg-amber-50 border-l-4 border-amber-600" : "bg-stone-50"}`}
              >
                <div className="text-xs text-stone-500 flex justify-between">
                  <span>{m.sender_name}</span>
                  <span>{m.created_at?.slice(0, 16).replace("T", " ")}</span>
                </div>
                <div className="text-sm text-stone-900 mt-1">{m.body}</div>
              </li>
            );
          })
        )}
      </ul>
      <div className="flex gap-2">
        <input
          type="text"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type a reply..."
          className="flex-1 px-3 py-2 border border-stone-300 rounded text-sm"
        />
        <button
          onClick={() => {
            if (reply.trim()) {
              onSendReply({ body: reply, at: new Date().toISOString() });
              setReply("");
            }
          }}
          className="px-4 py-2 bg-stone-900 text-white text-sm rounded hover:bg-stone-800"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Atoms ────────────────────────────────────────────────────────────────

function Tile({ label, value, caption }) {
  return (
    <div className="p-4 border border-stone-200 rounded-lg bg-white">
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-3xl font-light text-stone-900 mt-1">{value}</div>
      {caption && <div className="text-xs text-stone-500 mt-1">{caption}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-blue-100 text-blue-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-stone-100 text-stone-700",
  }[status] || "bg-stone-100 text-stone-700";
  return <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>{status}</span>;
}

export default VendorPortal;
