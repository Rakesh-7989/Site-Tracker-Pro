// SiteTrack Pro — v5 Phase B2: Client Portal project depth (/client/:projectId).
// A read-mostly surface for the logged-in client (identity role `client`,
// email-matching RLS): payments + invoices, upcoming milestones, approved
// drawings with the B1 comment surface, and an activity feed.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import type { IconName } from "@/components/ui/icons";
import { getClient } from "@/lib/supabase";
import {
  getClientProject, listClientInvoices, listClientMilestones, listClientDrawings,
  listClientUpdates, listClientActivity, buildActivityFeed, clientPaymentRollup,
  upcomingMilestones, approvedDrawings,
  type ClientProjectHeader, type ClientInvoice, type ClientMilestone,
  type ClientDrawing, type ClientActivityRow,
} from "@/app/clientPortalQueries";
import { listDrawingComments, addDrawingComment, type DrawingComment } from "@/app/approvalQueries";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

const PAY_LABEL: Record<string, string> = { paid: "Paid", partial: "Partial", pending: "Pending", overdue: "Overdue" };
const PAY_TONE: Record<string, "success" | "warning" | "info" | "danger"> = { paid: "success", partial: "warning", pending: "info", overdue: "danger" };

type Tab = "payments" | "milestones" | "drawings" | "activity";

export function ClientPortalProjectView(): JSX.Element {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const email = session?.user.email ?? "";

  const [tab, setTab] = useState<Tab>("payments");
  const [project, setProject] = useState<ClientProjectHeader | null>(null);
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [milestones, setMilestones] = useState<ClientMilestone[]>([]);
  const [drawings, setDrawings] = useState<ClientDrawing[]>([]);
  const [feed, setFeed] = useState<ClientActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawing comment surface state
  const [comments, setComments] = useState<Record<string, DrawingComment[]>>({});
  const [replyBox, setReplyBox] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [pRes, iRes, mRes, dRes, uRes, aRes] = await Promise.all([
      getClientProject(client, projectId, email),
      listClientInvoices(client, projectId),
      listClientMilestones(client, projectId),
      listClientDrawings(client, projectId),
      listClientUpdates(client, projectId),
      listClientActivity(client, projectId),
    ]);
    if (!pRes.ok) { setError(pRes.error); setLoading(false); return; }
    setProject(pRes.data);
    if (iRes.ok) setInvoices(iRes.data); else setError(iRes.error);
    if (mRes.ok) setMilestones(mRes.data); else setError(mRes.error);
    if (dRes.ok) setDrawings(dRes.data); else setError(dRes.error);
    if (uRes.ok && aRes.ok) setFeed(buildActivityFeed(uRes.data, aRes.data));
    else if (uRes.ok) setFeed(buildActivityFeed(uRes.data, []));
    else if (aRes.ok) setFeed(buildActivityFeed([], aRes.data));
    setLoading(false);
  }, [projectId, email]);

  useEffect(() => { void load(); }, [load]);

  const submitReply = async (drawingId: string) => {
    const body = (replyBox[drawingId] ?? "").trim();
    if (!body || !session?.user.id) return;
    const client = await getClient();
    if (!client) return;
    setBusy(`reply-${drawingId}`);
    const res = await addDrawingComment(client, { drawingId, authorId: session.user.id, body });
    setBusy(null);
    if (!res.ok) return;
    const cRes = await listDrawingComments(client, drawingId);
    if (cRes.ok) { setComments(prev => ({ ...prev, [drawingId]: cRes.data })); setReplyBox(prev => ({ ...prev, [drawingId]: "" })); }
  };

  if (loading) return <div className="grid place-items-center p-12"><Spinner size={24} /></div>;
  if (error) return <div className="p-8 max-w-3xl mx-auto"><Alert variant="danger">{error}</Alert></div>;
  if (!project) return <div className="p-8"><Alert variant="danger">Project not found.</Alert></div>;

  const rollup = clientPaymentRollup(invoices);
  const upcoming = upcomingMilestones(milestones);
  const approved = approvedDrawings(drawings);

  const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
    { id: "payments", label: "Payments", icon: "wallet" },
    { id: "milestones", label: "Milestones", icon: "flag" },
    { id: "drawings", label: "Drawings", icon: "doc" },
    { id: "activity", label: "Activity", icon: "activity" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <button onClick={() => navigate("/client")} className="text-sm text-fg-tertiary hover:text-accent flex items-center gap-1 mb-4">
        <Icon name="chevron" size={14} className="rotate-180" /> Back to projects
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-fg-primary">{project.name}</h1>
          <p className="text-fg-tertiary text-sm mt-1">
            {project.location || "—"}{project.expectedEndDate ? ` · Target completion ${fmtDate(project.expectedEndDate)}` : ""}
          </p>
        </div>
        <Badge tone={project.status === "active" ? "success" : project.status === "completed" ? "info" : "neutral"}>{project.status}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <Card className="p-4"><div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">Progress</div><div className="text-3xl font-black text-fg-primary">{project.progress}%</div></Card>
        <Card className="p-4"><div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">Net billed</div><div className="text-3xl font-black text-accent">{fmtMoney(rollup.net)}</div></Card>
        <Card className="p-4"><div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">Paid</div><div className="text-3xl font-black text-success">{fmtMoney(rollup.received)}</div></Card>
        <Card className="p-4"><div className="text-fg-tertiary text-xs font-semibold uppercase tracking-wider mb-1">Outstanding</div><div className="text-3xl font-black text-error">{fmtMoney(rollup.outstanding)}</div></Card>
      </div>

      <div className="flex gap-1 border-b border-default mb-6 overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-fg-tertiary hover:text-fg-primary"}`}>
            <span className="inline-flex items-center gap-1.5"><Icon name={t.icon} size={14} />{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "payments" && (
        <div className="space-y-3">
          {invoices.length === 0 && <Card className="p-8 text-center text-fg-tertiary"><Icon name="wallet" size={28} className="mx-auto mb-3 opacity-30" /><p>No invoices yet.</p></Card>}
          {invoices.map(inv => (
            <Card key={inv.id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="font-bold text-fg-primary">{inv.no}</div>
                  <div className="text-fg-tertiary text-xs">{fmtDate(inv.issuedDate)}</div>
                </div>
                <div className="text-right">
                  <div className="font-black text-fg-primary">{fmtMoney(inv.netReceivable)}</div>
                  <Badge tone={PAY_TONE[inv.paymentStatus]} className="mt-1">{PAY_LABEL[inv.paymentStatus]}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-tertiary">
                <span>Net receivable {fmtMoney(inv.netReceivable)}</span>
                <span className="text-success">Received {fmtMoney(inv.received)}</span>
                <span className="text-error">Outstanding {fmtMoney(inv.outstanding)}</span>
              </div>
              {inv.payments.length > 0 && (
                <div className="mt-3 border-t border-default pt-3 space-y-1.5">
                  {inv.payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-fg-tertiary">{fmtDate(p.receivedOn)}{p.reference ? ` · ${p.reference}` : ""}</span>
                      <span className="font-semibold text-success">{fmtMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === "milestones" && (
        <div className="space-y-3">
          {upcoming.length === 0 && <Card className="p-8 text-center text-fg-tertiary"><Icon name="flag" size={28} className="mx-auto mb-3 opacity-30" /><p>No upcoming milestones.</p></Card>}
          {upcoming.map(m => (
            <Card key={m.id} className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-fg-primary">{m.title}</div>
                <div className="text-fg-tertiary text-xs">Due {fmtDate(m.dueDate)}</div>
              </div>
              <Badge tone={m.status === "in_progress" ? "info" : "neutral"}>{m.status}</Badge>
            </Card>
          ))}
        </div>
      )}

      {tab === "drawings" && (
        <div className="space-y-4">
          {approved.length === 0 && <Card className="p-8 text-center text-fg-tertiary"><Icon name="doc" size={28} className="mx-auto mb-3 opacity-30" /><p>No approved drawings released to you yet.</p></Card>}
          {approved.map(d => {
            const c = comments[d.id] ?? [];
            const pins = c.filter(x => x.x != null);
            const thread = c.filter(x => x.x == null);
            return (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-bold text-fg-primary">{d.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge tone="neutral" className="text-xs">{d.type}</Badge>
                      <Badge tone="info" className="text-xs">{d.revision}</Badge>
                      <Badge tone="success" className="text-xs">Approved</Badge>
                    </div>
                  </div>
                  <div className="text-right text-fg-tertiary text-xs">{fmtDate(d.releaseDate)}</div>
                </div>
                {d.notes && <p className="text-sm text-fg-tertiary mb-2">{d.notes}</p>}
                {pins.length > 0 && (
                  <div className="mb-2 border-t border-default pt-2 space-y-1">
                    {pins.map(pin => (
                      <div key={pin.id} className="flex items-start gap-2 text-sm">
                        <Icon name="map" size={14} className="mt-0.5 text-accent" />
                        <div>
                          <span className="text-fg-tertiary text-xs">{pin.authorName ?? "Reviewer"}</span>
                          <span className="text-fg-primary">: {pin.body}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {thread.length > 0 && (
                  <div className="mb-2 border-t border-default pt-2 space-y-1.5">
                    {thread.map(r => (
                      <div key={r.id} className="text-sm">
                        <span className="text-fg-tertiary text-xs">{r.authorName ?? "Reviewer"} · {fmtDate(r.createdAt)}</span>
                        <div className="text-fg-primary">{r.body}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Input value={replyBox[d.id] ?? ""} onChange={e => setReplyBox(prev => ({ ...prev, [d.id]: e.target.value }))}
                    placeholder="Reply on this drawing…" className="flex-1" />
                  <Button onClick={() => void submitReply(d.id)} disabled={busy !== null || !(replyBox[d.id] ?? "").trim()}>Reply</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-3">
          {feed.length === 0 && <Card className="p-8 text-center text-fg-tertiary"><Icon name="activity" size={28} className="mx-auto mb-3 opacity-30" /><p>No activity yet.</p></Card>}
          {feed.map(row => (
            <Card key={row.id} className="p-4 flex items-start gap-3">
              <Icon name={row.kind === "update" ? "activity" : "clipboard"} size={16} className="mt-0.5 text-accent" />
              <div className="min-w-0">
                <div className="font-semibold text-fg-primary text-sm">{row.title}</div>
                {row.body && <div className="text-fg-secondary text-sm">{row.body}</div>}
                <div className="text-fg-tertiary text-xs mt-0.5">{row.byName ?? "System"} · {fmtDate(row.date)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}