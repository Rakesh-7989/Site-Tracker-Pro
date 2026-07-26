import { useState, useEffect, useCallback } from "react";
import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { delegationStatus } from "@/lib/delegations";
import { getClient } from "@/lib/supabase";
import {
  listDelegations, listOrgMembers,
  createDelegation, revokeDelegation as revokeDelegationQuery,
  type DelegationRow, type OrgMemberRow,
} from "@/app/delegationQueries";


export function DelegationsView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const can = useCan("org:members:manage", { orgId: activeOrg?.orgId });
  if (!can) return <AccessDenied message="You don't have permission to manage delegations." />;
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  return <Inner user={session.user} orgId={activeOrg.orgId} />;
}

function Inner({ user, orgId }: { user: any; orgId: string }): JSX.Element {
  const [show, setShow] = useState(false);
  const [delegations, setDelegations] = useState<DelegationRow[]>([]);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [nd, setNd] = useState({ to_user_id: "", scope: "all", start: "", end: "", reason: "" });

  const fetchData = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const [dRes, mRes] = await Promise.all([
      listDelegations(client, user.id),
      listOrgMembers(client, orgId),
    ]);
    if (dRes.ok) setDelegations(dRes.data);
    if (mRes.ok) setMembers(mRes.data);
  }, [user.id, orgId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const myDelegations = delegations.filter(d => d.fromUserId === user.id);
  const otherUsers = members.filter(m => m.id !== user.id && m.status === "active");

  const create = async () => {
    if (!nd.to_user_id || !nd.start || !nd.end) { alert("Pick a delegate + start + end date."); return; }
    const target = otherUsers.find(u => u.id === nd.to_user_id);
    if (!target) { alert("Delegate not found."); return; }
    const client = await getClient();
    if (!client) return;
    const res = await createDelegation(client, {
      orgId,
      fromUserId: user.id,
      toUserId: target.id,
      scope: nd.scope,
      start: new Date(nd.start).toISOString(),
      end: new Date(nd.end + "T23:59:59").toISOString(),
      reason: nd.reason,
      createdBy: user.id,
    });
    if (res.ok) {
      setNd({ to_user_id: "", scope: "all", start: "", end: "", reason: "" });
      setShow(false);
      await fetchData();
    } else {
      alert(res.error);
    }
  };
  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this delegation? Audit trail is preserved.")) return;
    const client = await getClient();
    if (!client) return;
    const res = await revokeDelegationQuery(client, id, user.id);
    if (res.ok) await fetchData();
    else alert(res.error);
  };

  return (
    <div className="p-4 md:p-10 max-w-4xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3 border-b-st-line">
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Workflow</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Approval Delegation</h1>
          <p className="text-ink-500 text-sm mt-2">Site visit lo unnappudu approvals ni another person ki auto-route cheyandi. Audit trail keeps both original + delegate names.</p>
        </div>
        <button onClick={() => setShow(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide"><Icon name="plus" size={14} />Delegate</button>
      </div>
      {show && <div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial border-st-line">
        <div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New delegation</h3><button onClick={() => setShow(false)}><Icon name="x" size={18} /></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <select value={nd.to_user_id} onChange={e => setNd(p => ({ ...p, to_user_id: e.target.value }))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">— Delegate to —</option>{otherUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select>
          <select value={nd.scope} onChange={e => setNd(p => ({ ...p, scope: e.target.value }))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="all">All approvals</option><option value="ra_bills">RA Bills only</option><option value="drawings">Drawings only</option><option value="change_orders">Change Orders only</option><option value="expenses">Expenses only</option></select>
          <input type="date" value={nd.start} onChange={e => setNd(p => ({ ...p, start: e.target.value }))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600" />
          <input type="date" value={nd.end} onChange={e => setNd(p => ({ ...p, end: e.target.value }))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600" />
        </div>
        <input value={nd.reason} onChange={e => setNd(p => ({ ...p, reason: e.target.value }))} placeholder="Reason (e.g. site visit Vizag)" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-3" />
        <button onClick={create} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Create delegation</button>
      </div>}
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial border-st-line">
        {myDelegations.length === 0 ? <div className="p-12 text-center text-ink-500"><Icon name="users" size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No delegations yet.</p></div> : myDelegations.map(d => {
          const st = delegationStatus(d);
          const color: Record<string, string> = { active: "emerald", scheduled: "amber", expired: "stone", revoked: "red" };
          const c = color[st] || "stone";
          return (<div key={d.id} className="p-4 flex items-center gap-3 flex-wrap border-b-st-line">
            <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-${c}-50 text-${c}-700`}>{st}</span>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-ink-900">→ {d.toUserName} <span className="text-[10px] font-mono text-ink-500">({d.scope})</span></div><div className="text-[11px] text-ink-500">{fmtDate(d.start)} → {fmtDate(d.end)}{d.reason && ` · ${d.reason}`}</div></div>
            {d.active !== false && st !== "expired" && <button onClick={() => revoke(d.id)} className="text-[11px] font-bold text-ink-500 hover:text-red-600">Revoke</button>}
          </div>);
        })}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
