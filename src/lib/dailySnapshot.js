// SiteTrack Pro — Daily KPI snapshot.
//
// Inspired by TripGZio's `daily-snapshot.ts` cron: nightly job freezes hotel
// occupancy/ADR/RevPAR into an immutable row → reports load instantly.
//
// For construction the freezable KPIs are:
//   - progress_pct       — project.progress
//   - workers_on_site    — sum of LabourLog rows for today
//   - materials_consumed — sum of Ledger outward rows for today
//   - cumulative_bill    — sum of all RA bill amounts so far
//   - open_issues        — count of issue rows with status="open"
//   - high_issues        — open + severity="high"
//   - weather            — from update rows (if captured)
//   - photos_uploaded    — count of update rows with photo
//
// Snapshots are stored keyed by project_id → ISO date. Once written, never
// overwritten — re-running just no-ops (idempotent). Use `forceRefresh` to
// recompute (admin only).

/** Compute today's snapshot for one project. Pure function — no side effects. */
export function computeSnapshot(projectId, ctx) {
  const today = todayISO();
  const updatesArr = ctx.updates?.[projectId] || [];
  const issuesArr  = ctx.issues?.[projectId] || [];
  const raArr      = ctx.ra?.[projectId] || [];
  const ledgerArr  = ctx.ledger?.[projectId] || [];
  const labourArr  = ctx.labour?.[projectId] || [];

  const todayUpdates = updatesArr.filter(u => (u.update_date || "").startsWith(today));
  const workersOnSite = todayUpdates.reduce((s, u) => s + (Number(u.workers_count) || 0), 0)
                     || labourArr.filter(l => (l.date || "").startsWith(today)).reduce((s, l) => s + (Number(l.workers) || 0), 0);

  const materialsConsumed = ledgerArr
    .filter(l => l.direction === "outward" && (l.date || "").startsWith(today))
    .reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const cumulativeBill = raArr.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const openIssues = issuesArr.filter(i => i.status === "open");
  const highIssues = openIssues.filter(i => i.severity === "high");

  const photosUploaded = todayUpdates.filter(u => Array.isArray(u.photos) && u.photos.length > 0).length;
  const weather = todayUpdates[0]?.weather || "";

  const project = (ctx.projects || []).find(p => p.id === projectId) || {};

  return {
    date: today,
    project_id: projectId,
    project_name: project.name || "",
    progress_pct: Number(project.progress) || 0,
    workers_on_site: workersOnSite,
    materials_consumed: materialsConsumed,
    cumulative_bill: cumulativeBill,
    open_issues: openIssues.length,
    high_issues: highIssues.length,
    photos_uploaded: photosUploaded,
    weather,
    frozen_at: new Date().toISOString(),
  };
}

/**
 * Add (or refresh) today's snapshot in the bucket.
 * Returns NEW snapshot bucket. No-op if a snapshot for today exists unless
 * forceRefresh=true.
 */
export function freezeSnapshot(snapshots, projectId, ctx, opts = {}) {
  const today = todayISO();
  const existing = snapshots?.[projectId]?.[today];
  if (existing && !opts.forceRefresh) return snapshots;
  const snap = computeSnapshot(projectId, ctx);
  return {
    ...snapshots,
    [projectId]: { ...(snapshots?.[projectId] || {}), [today]: snap },
  };
}

/** Freeze snapshots for ALL projects in one shot — used by the nightly cron. */
export function freezeAll(snapshots, ctx, opts = {}) {
  let out = snapshots;
  for (const p of ctx.projects || []) {
    out = freezeSnapshot(out, p.id, ctx, opts);
  }
  return out;
}

/** Compare today vs yesterday for one project — used by the trend arrows. */
export function snapshotDelta(snapshots, projectId) {
  const bucket = snapshots?.[projectId] || {};
  const dates = Object.keys(bucket).sort();
  if (dates.length < 2) return null;
  const today = bucket[dates[dates.length - 1]];
  const yest  = bucket[dates[dates.length - 2]];
  return {
    progress:   today.progress_pct - yest.progress_pct,
    workers:    today.workers_on_site - yest.workers_on_site,
    bill:       today.cumulative_bill - yest.cumulative_bill,
    open:       today.open_issues - yest.open_issues,
  };
}

/** Series for charts — last N days. */
export function snapshotSeries(snapshots, projectId, days = 30) {
  const bucket = snapshots?.[projectId] || {};
  const sorted = Object.keys(bucket).sort();
  const slice = sorted.slice(-days);
  return slice.map(d => ({ date: d, ...bucket[d] }));
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
