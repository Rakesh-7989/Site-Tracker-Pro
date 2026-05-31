// SiteTrack Pro — Export helpers (PDF, CSV, DPR, WhatsApp text).
//
// Extracted from App.jsx in Batch 8. All four are pure (return strings or
// trigger window.open / a.click side effects). Tests can import these and
// assert on the returned HTML / CSV.
//
// All user-supplied content flows through h() (HTML escape) or csvRow()
// (CSV escape with formula-injection defuse). See src/lib/escape.js for
// the escape contract.

import { h, csvRow } from "./escape.js";
import { fmtDate, fmtCur } from "./format.js";

/**
 * Open a print-ready HTML window for a project report. Auto-triggers print
 * dialog after ~600ms (gives the browser time to paint).
 */
export const exportPDF = (proj, ms, us, ex, iss) => {
  // User-supplied text is escaped via h() (see src/lib/escape.js).
  // Numbers + dates come from trusted formatters and need no escaping.
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${h(proj.name)} — Site Report</title>
  <style>body{font-family:Arial,sans-serif;padding:40px;color:#1e293b}h1{color:#f97316;margin-bottom:4px}h2{color:#334155;font-size:16px;margin-top:28px;border-bottom:2px solid #f97316;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}th{background:#f97316;color:white;padding:8px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #e2e8f0}.bar{background:#e2e8f0;border-radius:4px;height:8px;margin:6px 0}.fill{background:#f97316;height:8px;border-radius:4px}.update{padding:12px;background:#f8fafc;border-radius:8px;margin:8px 0;font-size:13px}footer{margin-top:40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}@media print{body{padding:20px}}</style></head>
  <body><div style="display:flex;justify-content:space-between;align-items:start"><div><h1>${h(proj.name)}</h1><p style="color:#64748b;font-size:13px;margin:4px 0">${h(proj.location)} · ${h(proj.client_name)}</p></div><div style="font-size:11px;color:#64748b;text-align:right">Generated ${fmtDate(new Date().toISOString())}<br>SiteTrack Pro</div></div>
  <p style="font-size:13px;color:#475569">${h(proj.description)}</p>
  <p><strong>Progress: ${Number(proj.progress)||0}%</strong></p><div class="bar"><div class="fill" style="width:${Number(proj.progress)||0}%"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0;font-size:13px"><div><strong>Budget:</strong> ${fmtCur(proj.budget)}</div><div><strong>Started:</strong> ${fmtDate(proj.start_date)}</div><div><strong>Expected End:</strong> ${fmtDate(proj.expected_end_date)}</div></div>
  <h2>Milestones</h2><table><tr><th>#</th><th>Milestone</th><th>Due Date</th><th>Status</th></tr>${ms.map((m,i)=>`<tr><td>${i+1}</td><td>${h(m.title)}</td><td>${fmtDate(m.due_date)}</td><td>${m.completed_date?`✓ ${fmtDate(m.completed_date)}`:h((m.status||"").replace("_"," "))}</td></tr>`).join("")}</table>
  <h2>Open Issues</h2><table><tr><th>Issue</th><th>Severity</th><th>Reported</th><th>Status</th></tr>${(iss||[]).map(i=>`<tr><td>${h(i.title)}</td><td>${h(i.severity)}</td><td>${fmtDate(i.reported_date)}</td><td>${h(i.status)}</td></tr>`).join("")}</table>
  <h2>Recent Updates</h2>${us.slice(0,5).map(u=>`<div class="update"><strong>${fmtDate(u.update_date)}</strong>${u.weather?` · ${h(u.weather)}`:""}<p style="margin:6px 0 0">${h(u.notes)}</p>${u.workers_count?`<p style="font-size:12px;color:#64748b;margin:4px 0">👷 ${Number(u.workers_count)||0} workers</p>`:""}</div>`).join("")}
  <h2>Expenses</h2><table><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr>${ex.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${h(e.category)}</td><td>${h(e.description)}</td><td>${fmtCur(e.amount)}</td></tr>`).join("")}<tr style="font-weight:bold;background:#f8fafc"><td colspan="3">Total</td><td>${fmtCur(ex.reduce((s,e)=>s+e.amount,0))}</td></tr></table>
  <footer>SiteTrack Pro · Auto-generated project report</footer></body></html>`;
  const w = window.open("","_blank"); if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);}
};

/** Download a CSV of project expenses. RFC 4180 quoting + formula-injection defuse. */
export const exportCSV = (proj, ex) => {
  const lines = [
    csvRow(["Date","Category","Description","Amount(INR)"]),
    ...ex.map(e=>csvRow([e.date, e.category, e.description, e.amount])),
    csvRow(["","","TOTAL", ex.reduce((s,e)=>s+e.amount,0)]),
  ];
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(lines.join("\n"));
  a.download = `${(proj.name||"project").replace(/[^\w-]+/g,"-")}-expenses.csv`;
  a.click();
};

/**
 * Build the Daily Site Report (DPR) HTML string. Pure — returns the HTML.
 * Caller chooses to print, download, share via WhatsApp, etc.
 *
 * opts = { date?, updates?, issues?, materials?, worklogs?, attendance?, team? }
 */
export const buildDPR = (proj, opts) => {
  const today = opts.date || new Date().toISOString().split("T")[0];
  const dispDate = new Date(today).toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  const todayUpdates = (opts.updates||[]).filter(u=>u.update_date===today);
  const openIssues = (opts.issues||[]).filter(i=>i.status==="open");
  const newIssues = openIssues.filter(i=>i.reported_date===today);
  const todayMats = (opts.materials||[]).filter(m=>m.date===today);
  const todayWorklogs = (opts.worklogs||[]).filter(w=>w.date===today);
  const attMap = (opts.attendance||{})[today]||{};
  const team = opts.team||[];
  const present = Object.values(attMap).filter(v=>v==="present").length;
  const half = Object.values(attMap).filter(v=>v==="half_day").length;
  const absent = Object.values(attMap).filter(v=>v==="absent").length;
  const totalWorkers = todayUpdates.reduce((s,u)=>s+(u.workers_count||0),0) || present + Math.round(half/2);
  const photos = todayUpdates.flatMap(u=>u.photos||[]).slice(0,6);

  // Defensive image src: only allow data: and https: protocols.
  const safePhotoSrc = url => {
    if (typeof url !== "string") return "";
    if (/^(data:|https:)/i.test(url)) return url;
    return "";
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${h(proj.name)} — DPR ${today}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter',sans-serif;color:#1c1917;background:#fdfbf6;padding:40px 56px;}
    .font-display{font-family:'Fraunces',serif;letter-spacing:-.015em;}
    .pre-rule{font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#b45309;margin-bottom:8px;}
    h1{font-family:'Fraunces',serif;font-weight:300;font-size:42px;line-height:1.05;letter-spacing:-.015em;color:#1c1917;margin-bottom:12px;}
    h2{font-family:'Fraunces',serif;font-weight:600;font-size:20px;color:#1c1917;margin:0 0 16px;letter-spacing:-.01em;}
    .masthead{border-bottom:1px solid #e7e5e4;padding-bottom:20px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:end;}
    .brand{display:flex;align-items:center;gap:10px;}
    .brand-mark{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#f59e0b,#d97706);}
    .brand-name{font-family:'Fraunces',serif;font-weight:700;font-size:18px;letter-spacing:-.01em;}
    .brand-sub{font-size:9px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#b45309;}
    .meta{font-size:11px;color:#78716c;text-align:right;}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding:24px 0;border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;margin-bottom:32px;}
    .metric .label{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#78716c;margin-bottom:6px;}
    .metric .value{font-family:'Fraunces',serif;font-size:28px;font-weight:300;letter-spacing:-.015em;}
    .metric .value strong{font-weight:600;color:#b45309;}
    section{margin-bottom:36px;}
    .row{padding:14px 0;border-bottom:1px solid #f5f1e8;}
    .row:last-child{border:0;}
    .row .label{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#b45309;margin-bottom:4px;}
    .row .text{font-size:14px;line-height:1.55;color:#1c1917;}
    .row .meta{font-size:11px;color:#78716c;margin-top:4px;text-align:left;}
    .pill{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:3px 8px;border-radius:999px;margin-right:6px;}
    .pill-high{background:#fef2f2;color:#b91c1c;}
    .pill-med{background:#fffbeb;color:#a16207;}
    .pill-low{background:#eff6ff;color:#2563eb;}
    .pill-amber{background:#fef3c7;color:#92400e;}
    .photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;}
    .photo-grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid #e7e5e4;}
    .footer{margin-top:48px;padding-top:20px;border-top:1px solid #e7e5e4;text-align:center;font-size:10px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#78716c;}
    .empty{font-size:13px;color:#78716c;font-style:italic;padding:14px 0;}
    @media print{body{padding:24px 32px;}}
  </style></head><body>

  <div class="masthead">
    <div class="brand">
      <div class="brand-mark"></div>
      <div>
        <div class="brand-name">SiteTrack</div>
        <div class="brand-sub">Daily Site Report</div>
      </div>
    </div>
    <div class="meta">Generated ${h(new Date().toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}))}<br/>Confidential — for ${h(proj.client_name||"project stakeholders")}</div>
  </div>

  <div class="pre-rule">— ${h(dispDate)}</div>
  <h1>${h(proj.name)}</h1>
  <div style="font-size:13px;color:#78716c;margin-top:6px;">${h(proj.location||"")}</div>

  <div class="metrics">
    <div class="metric"><div class="label">Workers</div><div class="value"><strong>${totalWorkers||"—"}</strong></div></div>
    <div class="metric"><div class="label">Updates</div><div class="value"><strong>${todayUpdates.length}</strong></div></div>
    <div class="metric"><div class="label">New Issues</div><div class="value"><strong>${newIssues.length}</strong><span style="font-size:14px;color:#78716c;"> / ${openIssues.length} open</span></div></div>
    <div class="metric"><div class="label">Progress</div><div class="value"><strong>${Number(proj.progress)||0}</strong>%</div></div>
  </div>

  <section>
    <div class="pre-rule">— Field</div>
    <h2>Today's site activity</h2>
    ${todayUpdates.length===0?'<div class="empty">No updates recorded for today.</div>':todayUpdates.map(u=>`
      <div class="row">
        <div class="label">${h(u.weather||"site notes")}</div>
        <p class="text">"${h(u.notes)}"</p>
        ${u.workers_count?`<div class="meta">${Number(u.workers_count)||0} workers on site</div>`:""}
      </div>
    `).join("")}
  </section>

  ${photos.length>0?`<section>
    <div class="pre-rule">— Photo log</div>
    <h2>${photos.length} photos from today</h2>
    <div class="photo-grid">${photos.map(p=>`<img src="${h(safePhotoSrc(p.url))}" alt=""/>`).join("")}</div>
  </section>`:""}

  <section>
    <div class="pre-rule">— Quality</div>
    <h2>Issues reported today (${newIssues.length})</h2>
    ${newIssues.length===0?'<div class="empty">No new issues today. All open: '+openIssues.length+'.</div>':newIssues.map(i=>`
      <div class="row">
        <span class="pill pill-${i.severity==="high"?"high":i.severity==="medium"?"med":"low"}">${h(i.severity)}</span>
        <span class="text" style="font-weight:600;">${h(i.title)}</span>
        <div class="meta">Reported by ${h(i.reported_by||"—")}</div>
      </div>
    `).join("")}
  </section>

  ${todayMats.length>0?`<section>
    <div class="pre-rule">— Inward</div>
    <h2>Material deliveries today</h2>
    ${todayMats.map(m=>`
      <div class="row">
        <span class="pill pill-amber">${h(m.status)}</span>
        <span class="text" style="font-weight:600;">${h(m.material)}</span>
        <span style="color:#b45309;font-weight:600;"> — ${h(m.quantity||"")}</span>
        <div class="meta">${h(m.supplier||"")}</div>
      </div>
    `).join("")}
  </section>`:""}

  ${todayWorklogs.length>0?`<section>
    <div class="pre-rule">— Worklogs</div>
    <h2>Contractor worklogs (${todayWorklogs.length})</h2>
    ${todayWorklogs.map(w=>`
      <div class="row">
        <div class="label">${h(w.contractor||"contractor")} · ${h(w.location||"")}</div>
        <p class="text">${h(w.work)}</p>
        <div class="meta">${Number(w.workers)||0} workers · ${Number(w.hours)||0} hrs · ${h(w.status)}</div>
      </div>
    `).join("")}
  </section>`:""}

  <section>
    <div class="pre-rule">— Attendance</div>
    <h2>Today's roll-call</h2>
    <div class="row">
      <div class="text">
        <strong style="color:#059669;">${present} present</strong> ·
        <strong style="color:#a16207;">${half} half day</strong> ·
        <strong style="color:#b91c1c;">${absent} absent</strong>
        <span style="color:#78716c;"> · of ${team.length} team members</span>
      </div>
    </div>
  </section>

  <div class="footer">— SiteTrack Pro · Construction Suite · ${h(proj.name)} —</div>

  </body></html>`;
};

/** Open the DPR in a new window and trigger print. */
export const exportDPR = (proj, opts) => {
  const html = buildDPR(proj, opts);
  const w = window.open("","_blank");
  if(!w){ alert("Pop-ups blocked — please allow pop-ups to generate the Daily Report."); return; }
  w.document.write(html); w.document.close();
  setTimeout(()=>w.print(), 700);
};

/**
 * Plain-text DPR summary for WhatsApp (the share link goes to the project,
 * but this body gives the client an immediate readable digest).
 */
export const buildDPRWhatsAppText = (proj, opts) => {
  const today = opts.date || new Date().toISOString().split("T")[0];
  const dispDate = new Date(today).toLocaleDateString("en-IN",{month:"short",day:"numeric",year:"numeric"});
  const todayUpdates = (opts.updates||[]).filter(u=>u.update_date===today);
  const openIssues = (opts.issues||[]).filter(i=>i.status==="open");
  const totalWorkers = todayUpdates.reduce((s,u)=>s+(u.workers_count||0),0);
  const lines = [
    `*${proj.name} — Daily Site Report*`,
    `📅 ${dispDate}`,
    ``,
    `👷 *Workers:* ${totalWorkers||"—"}`,
    `📊 *Progress:* ${proj.progress||0}%`,
    `⚠️ *Open issues:* ${openIssues.length}`,
    ``,
    `📝 *Today's notes:*`,
    ...todayUpdates.map(u=>`• ${u.notes}`),
    todayUpdates.length===0 ? "_No updates recorded._" : "",
    ``,
    `— Sent via SiteTrack Pro`,
  ];
  return lines.filter(l=>l!=="").join("\n");
};

/**
 * Session 25 — printable audit report PDF for compliance / external auditors.
 *
 * Competitor gap fix: Procore gives auditors a printable PDF report; we only
 * had CSV export. CFOs + external auditors want a formatted document with
 * org letterhead, date range, action distribution chart, top actors, and
 * the full table.
 *
 * Args:
 *   rows    — audit_log_v2 records (already filtered by org + date range)
 *   org     — org row for the letterhead
 *   filters — { from?: string, to?: string, actor?: string, action?: string }
 *
 * Opens a print-ready window. User chooses "Save as PDF" in the browser
 * print dialog — works the same way as exportPDF (no PDF library needed).
 */
export const exportAuditPdf = (rows, org, filters = {}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  // Compute distribution + top actors for the summary box
  const byAction = {};
  const byActor = {};
  for (const r of safeRows) {
    byAction[r.action] = (byAction[r.action] || 0) + 1;
    byActor[r.actor_name || "Unknown"] = (byActor[r.actor_name || "Unknown"] || 0) + 1;
  }
  const topActions = Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topActors = Object.entries(byActor).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rangeLabel =
    (filters.from || filters.to)
      ? `${filters.from ? fmtDate(filters.from) : "—"} → ${filters.to ? fmtDate(filters.to) : "today"}`
      : "All time";
  const generated = new Date();

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${h(org?.name || "Org")} — Audit Report</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1c1917; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #d97706; padding-bottom:12px; margin-bottom:18px; }
    h1 { font-weight: 300; font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; }
    .kicker { font-size:10px; font-weight:bold; letter-spacing:0.24em; text-transform:uppercase; color:#d97706; margin-bottom:6px; }
    .meta { font-size:11px; color:#78716c; text-align:right; line-height:1.5; }
    .summary { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin:18px 0 24px; font-size:12px; }
    .card { background:#fffaf0; border:1px solid #e7e5e4; border-radius:8px; padding:12px; }
    .card .label { font-size:9px; font-weight:bold; letter-spacing:0.2em; text-transform:uppercase; color:#78716c; margin-bottom:6px; }
    .card .v { font-family:Arial,sans-serif; font-size:22px; font-weight:600; color:#1c1917; }
    h2 { font-weight:400; font-size:15px; margin-top:24px; margin-bottom:8px; border-bottom:1px solid #e7e5e4; padding-bottom:4px; }
    table { width:100%; border-collapse:collapse; font-family:Arial,sans-serif; font-size:10px; }
    th { background:#1c1917; color:#fbbf24; padding:6px 8px; text-align:left; font-size:9px; letter-spacing:0.1em; }
    td { padding:5px 8px; border-bottom:1px solid #f5f5f4; vertical-align:top; }
    tr:nth-child(even) td { background:#fafaf9; }
    .action-pill { display:inline-block; padding:1px 6px; background:#fef3c7; color:#92400e; font-size:9px; font-weight:bold; border-radius:999px; }
    .signoff { margin-top:36px; display:flex; justify-content:space-between; font-size:10px; color:#78716c; border-top:1px solid #e7e5e4; padding-top:14px; }
    footer { margin-top:14px; font-size:9px; color:#a8a29e; text-align:center; }
  </style></head>
  <body>
    <div class="head">
      <div>
        <div class="kicker">— Audit Report</div>
        <h1>${h(org?.name || "Organisation")}</h1>
        <p style="font-size:11px;color:#78716c;margin:4px 0 0;">${h(org?.city || "")} ${org?.contact_email ? ` · ${h(org.contact_email)}` : ""}</p>
      </div>
      <div class="meta">
        Range: <strong>${h(rangeLabel)}</strong><br>
        ${filters.actor ? `Actor: <strong>${h(filters.actor)}</strong><br>` : ""}
        ${filters.action ? `Action: <strong>${h(filters.action)}</strong><br>` : ""}
        Generated ${fmtDate(generated.toISOString())} by SiteTrack Pro
      </div>
    </div>

    <div class="summary">
      <div class="card"><div class="label">Records</div><div class="v">${safeRows.length}</div></div>
      <div class="card"><div class="label">Unique actors</div><div class="v">${Object.keys(byActor).length}</div></div>
      <div class="card"><div class="label">Distinct actions</div><div class="v">${Object.keys(byAction).length}</div></div>
    </div>

    <h2>Action distribution</h2>
    <table>
      <thead><tr><th>Action</th><th style="text-align:right;width:80px;">Count</th><th style="width:50%;">Share</th></tr></thead>
      <tbody>
        ${topActions.map(([a, n]) => `<tr><td><span class="action-pill">${h(a)}</span></td><td style="text-align:right;">${n}</td><td><div style="background:#f5f5f4;border-radius:3px;height:8px;width:100%;"><div style="background:#d97706;height:8px;width:${Math.round((n / safeRows.length) * 100) || 0}%;border-radius:3px;"></div></div></td></tr>`).join("")}
      </tbody>
    </table>

    <h2>Top actors</h2>
    <table>
      <thead><tr><th>Actor</th><th style="text-align:right;width:80px;">Actions</th></tr></thead>
      <tbody>
        ${topActors.map(([a, n]) => `<tr><td>${h(a)}</td><td style="text-align:right;">${n}</td></tr>`).join("")}
      </tbody>
    </table>

    <h2>Full audit trail (${safeRows.length} ${safeRows.length === 1 ? "row" : "rows"})</h2>
    <table>
      <thead><tr><th style="width:110px;">When</th><th style="width:120px;">Actor</th><th style="width:60px;">Role</th><th style="width:60px;">Action</th><th>Resource</th><th>Message</th></tr></thead>
      <tbody>
        ${safeRows.map(r => `<tr><td>${fmtDate(r.ts)}</td><td>${h(r.actor_name || "")}</td><td>${h(r.actor_role || "")}</td><td><span class="action-pill">${h(r.action)}</span></td><td>${h(r.resource)}${r.resource_id ? ` #${h(String(r.resource_id))}` : ""}</td><td style="font-family:Arial;font-size:10px;color:#44403c;">${h(r.message || "")}</td></tr>`).join("")}
      </tbody>
    </table>

    <div class="signoff">
      <div>
        <strong>Reviewed by</strong><br>
        ______________________________<br>
        Name, designation
      </div>
      <div style="text-align:right;">
        <strong>Date</strong><br>
        ______________________________
      </div>
    </div>

    <footer>SiteTrack Pro — editorial-grade construction record · sitetrack.in</footer>
  </body></html>`;

  if (typeof window !== "undefined") {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return html; // pop-up blocked — return string so caller can show in iframe
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 600);
  }
  return html;
};
