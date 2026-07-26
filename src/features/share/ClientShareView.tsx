// SiteTrack Pro — ClientShareView (v3 port).
// Public read-only project report rendered at /share/:id.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Icon, Spinner, StatusBadge, ProgressBar } from "@/components/ui/atoms";
import type { ShareProjectData, ShareMilestone, ShareUpdate, ShareDrawing } from "@/app/shareQueries";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(d);
  }
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; project: ShareProjectData; milestones: ShareMilestone[]; updates: ShareUpdate[]; drawings: ShareDrawing[] }
  | { kind: "error"; message: string };

export function ClientShareView(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!id) { setState({ kind: "error", message: "No project specified." }); return; }
      setState({ kind: "loading" });
      try {
        const mod = await import("../../lib/supabase");
        const client = await mod.getSupabaseClient();
        if (!client) { setState({ kind: "error", message: "Backend not configured." }); return; }
        const { getShareData } = await import("@/app/shareQueries");
        const res = await getShareData(client, id);
        if (cancelled) return;
        if (!res.ok) { setState({ kind: "error", message: res.error }); return; }
        setState({ kind: "ready", ...res });
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: String(err instanceof Error ? err.message : err) });
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (state.kind === "loading") {
    return <div className="min-h-screen bg-cream grid place-items-center"><Spinner size={28} /></div>;
  }
  if (state.kind === "error") {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center max-w-md">
          <Icon name="alert" size={40} className="mx-auto mb-4 text-ink-300" />
          <p className="font-display text-lg text-ink-700 mb-2">Project could not be loaded</p>
          <p className="text-sm text-ink-500">{state.message}</p>
          <Link to="/" className="inline-block mt-4 text-sm font-semibold text-safety-600 hover:text-safety-700">← Back to home</Link>
        </div>
      </div>
    );
  }

  const { project, milestones, updates, drawings } = state;
  const doneMs = milestones.filter(m => m.status === "completed").length;

  return (
    <div className="min-h-screen bg-cream font-sans">
      <header className="relative bg-ink-900 text-cream overflow-hidden">
        <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(217,119,6,.18) 0%, transparent 65%)" }} />
        <div className="absolute -bottom-20 -right-20 w-[28rem] h-[28rem] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(245,158,11,.12) 0%, transparent 65%)" }} />
        <div className="relative max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg">
                <Icon name="hardhat" size={20} className="text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold tracking-editorial leading-none">SiteTrack</div>
                <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-amber-500 mt-1">Client Report</div>
              </div>
            </div>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-500/80">Read-only</div>
          </div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-4">
            — Project Progress · {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-light leading-[1.05] tracking-editorial mb-4">{project.name}</h1>
          {project.location && <div className="flex items-center gap-2 text-cream/60 text-sm"><Icon name="map" size={14} />{project.location}</div>}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 pt-6" style={{ borderTop: "1px solid rgba(255,251,235,.1)" }}>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Progress</div>
              <div className="font-display text-3xl font-light tracking-editorial">{project.progress ?? "—"}<span className="text-amber-500 text-xl">%</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Milestones</div>
              <div className="font-display text-3xl font-light tracking-editorial">{doneMs}<span className="text-cream/50 text-xl"> / {milestones.length}</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Handover</div>
              <div className="font-display text-base font-medium tracking-editorial leading-snug pt-2">{fmtDate(project.expectedEndDate)}</div>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial border-st-line">
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Overall completion</div>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Project Progress</h2>
            <StatusBadge status={project.status ?? ""} />
          </div>
          <ProgressBar value={project.progress ?? 0} />
          {project.description && <p className="text-ink-600 text-sm mt-4 leading-relaxed">{project.description}</p>}
        </section>

        {milestones.length > 0 && (
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial border-st-line">
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Phases</div>
            <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Milestones</h2>
            <div className="space-y-4">
              {milestones.map((m, i) => (
                <div key={m.id} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs ${m.status === "completed" ? "bg-gradient-gold border-transparent" : m.status === "in_progress" ? "bg-amber-500 border-amber-500" : "bg-white border-stone-200"}`}>
                    {m.status === "completed" ? <Icon name="check" size={13} className="text-white" /> : <span className="font-bold text-ink-500">{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base font-medium text-ink-900 tracking-editorial leading-tight">{m.title}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5">
                      Due {fmtDate(m.dueDate)}{m.completedDate ? ` · Completed ${fmtDate(m.completedDate)}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          </section>
        )}

        {drawings.length > 0 && (
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial border-st-line">
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Documents</div>
            <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Released Drawings</h2>
            <div className="space-y-3">
              {drawings.map(d => (
                <div key={d.id} className="p-4 bg-cream-200/50 rounded-xl border-st-line">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Icon name="image" size={18} className="text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base font-semibold text-ink-900 tracking-editorial leading-tight">{d.title}</div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-ink-500 mt-1">
                        <span className="text-amber-700 font-bold tracking-wider uppercase">{d.type}</span>
                        {d.revision && <><span>·</span><span>{d.revision}</span></>}
                        {d.date && <><span>·</span><span>{fmtDate(d.date)}</span></>}
                        {d.files && (d.files as unknown[]).length > 0 && <><span>·</span><span>{(d.files as unknown[]).length} file(s)</span></>}
                      </div>
                      {d.notes && <p className="text-xs text-ink-600 mt-2">{d.notes}</p>}
                    </div>
                    <StatusBadge status={d.status ?? "released"} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {updates.length > 0 && (
          <section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial border-st-line">
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Field</div>
            <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Recent Updates</h2>
            <div className="space-y-5">
              {updates.slice(0, 3).map(u => (
                <article key={u.id} className="pb-5 last:pb-0 border-b-st-line">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-amber-700">{fmtDate(u.updateDate)}</div>
                    {u.weather && <span className="text-[10px] bg-amber-50 text-amber-800 font-semibold px-2 py-1 rounded-full tracking-wider">{u.weather}</span>}
                  </div>
                  <p className="text-ink-700 text-base leading-relaxed font-display tracking-editorial">"{u.notes}"</p>
                  {u.workersCount != null && (
                    <div className="text-[11px] text-ink-500 mt-3 flex items-center gap-1.5">
                      <Icon name="users" size={11} />{u.workersCount} workers on site
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="text-center pt-4 pb-2">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.32em] uppercase text-ink-500">
            <span>—</span>
            <span>SiteTrack Pro · Construction Suite</span>
            <span>—</span>
          </div>
          {project.clientName && (
            <p className="text-[11px] text-ink-500 mt-2">A confidential project record prepared for {project.clientName}.</p>
          )}
        </footer>
      </main>
    </div>
  );
}
