// SiteTrack Pro — project Labour register tab (v3 port, DB-wired). Statutory
// register; Aadhaar is shown masked (last 4 only) and RLS confines rows to the
// project's org/members.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listLabour, createLabour, deleteLabour, type LabourEntry } from "@/app/siteAdminQueries";
import { listAttendance, type AttendanceRow } from "@/app/attendanceQueries";
import { attendanceTally, wageSlip, SHIFT_BASE_HOURS, OVER_TIME_MULTIPLIER } from "@/app/shiftQueries";

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
export function LabourTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("labour:manage", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<LabourEntry[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(""); const [trade, setTrade] = useState(""); const [wage, setWage] = useState(""); const [aadhaar, setAadhaar] = useState(""); const [epf, setEpf] = useState(""); const [esi, setEsi] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLabour(client, projectId); if (res.ok) setRows(res.data); else setError(res.error);
    const at = await listAttendance(client, projectId); if (at.ok) setAttendance(at.data);
    setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    if (!name.trim()) return;
    const w = wage.trim() ? Number(wage) : undefined;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createLabour(c, { projectId, name: name.trim(), trade: trade.trim() || undefined, wage: Number.isFinite(w) ? w : undefined, aadhaar: aadhaar.trim() || undefined, epf: epf.trim() || undefined, esi: esi.trim() || undefined }), {
      apply: () => setRows(prev => [{ id: tmpId, name: name.trim(), trade: trade.trim() || undefined, wage: Number.isFinite(w) ? w : undefined, aadhaarMasked: aadhaar.trim() ? "•••• •••• " + aadhaar.trim().slice(-4) : undefined, joined: new Date().toISOString().slice(0, 10), epf: epf.trim() || undefined, esi: esi.trim() || undefined } as LabourEntry, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setName(""); setTrade(""); setWage(""); setAadhaar(""); setEpf(""); setEsi("");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Labour register</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Worker name</span><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Trade</span><Input fit className="mt-1 w-28" placeholder="Mason" value={trade} onChange={e => setTrade(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Daily wage ₹</span><Input fit className="mt-1 w-24" type="number" value={wage} onChange={e => setWage(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Aadhaar</span><Input fit className="mt-1 w-36" placeholder="optional" value={aadhaar} onChange={e => setAadhaar(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">EPF no.</span><Input fit className="mt-1 w-28" placeholder="optional" value={epf} onChange={e => setEpf(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">ESI no.</span><Input fit className="mt-1 w-28" placeholder="optional" value={esi} onChange={e => setEsi(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !name.trim()}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-center py-20 text-fg-secondary">
          <span className="text-4xl mb-3">👷</span>
          <p>No workers registered yet.</p>
          <p className="text-[12px] text-fg-tertiary">Add the first worker using the form above.</p>
        </div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{r.name}{r.trade ? <span className="text-fg-tertiary font-normal"> · {r.trade}</span> : null}</div>
                <div className="text-[11px] text-fg-tertiary">{[r.aadhaarMasked, r.joined && `joined ${r.joined}`, r.epf && `EPF ${r.epf}`, r.esi && `ESI ${r.esi}`].filter(Boolean).join(" · ") || "—"}</div></div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {r.wage != null && <span className="text-sm font-semibold text-fg-primary">{fmtRupees(r.wage)}<span className="text-[11px] text-fg-tertiary font-normal">/day</span></span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteLabour(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><span className="text-error">✕</span></Button>}
              </div>
            </Card>))}</div>}
      <WageSummary labour={rows} attendance={attendance} />
    </div>
  );
}

function WageSummary({ labour, attendance }: { labour: LabourEntry[]; attendance: AttendanceRow[] }): JSX.Element {
  const tally = attendanceTally(attendance);
  const wageBy = new Map<string, number>();
  for (const l of labour) if (l.wage != null) wageBy.set(l.name, l.wage);
  let gross = 0, ot = 0, epf = 0, esi = 0;
  for (const row of attendance) {
    const w = wageBy.get(row.attendeeName);
    if (w == null) continue;
    const t = tally[row.attendeeName];
    if (!t) continue;
    const slip = wageSlip({ dailyWage: w, presentDays: t.presentDays, overtimeHours: t.overtimeHours });
    gross += slip.gross; ot += slip.otHours; epf += slip.epf; esi += slip.esi;
  }
  const net = Math.max(0, gross - epf - esi);
  return (
    <Card padding="sm" title={<h3 className="text-sm font-bold text-fg-primary">Wages estimate</h3>}>
      {gross === 0 ? <div className="text-xs text-fg-secondary">No workers with a daily wage + attendance yet.</div> : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <div><div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Gross</div><div className="text-fg-primary font-semibold">{fmtRupees(gross)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">OT hrs</div><div className="text-fg-primary font-semibold">{ot}h</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">EPF (12%)</div><div className="text-fg-primary">{fmtRupees(epf)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">ESI (0.75%)</div><div className="text-fg-primary">{fmtRupees(esi)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Net</div><div className="text-success font-semibold">{fmtRupees(net)}</div></div>
          <div className="col-span-full text-[11px] text-fg-tertiary">Escalated attendance (Σ days &amp; OT across records) × daily wage. OT at {OVER_TIME_MULTIPLIER}× over {SHIFT_BASE_HOURS}h base. Statutory % are estimates — verify against slabs.</div>
        </div>
      )}
    </Card>
  );
}
