// SiteTrack Pro — local-timezone date helpers.
// Dates are compared as YYYY-MM-DD strings throughout the app; several places
// used `new Date().toISOString().slice(0,10)` which is UTC — for IST
// (UTC+5:30) that resolves to the PREVIOUS day between 00:00–05:29. These
// helpers use the caller's local time so "today" and "this month" are correct.

/** Today in the local timezone as YYYY-MM-DD. */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** First + last day of the local-timezone month containing `d`, as YYYY-MM-DD. */
export function currentMonthRange(d: Date = new Date()): { from: string; to: string } {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const mm = String(m).padStart(2, "0");
  const lastDay = String(new Date(y, m, 0).getDate()).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${lastDay}` };
}
