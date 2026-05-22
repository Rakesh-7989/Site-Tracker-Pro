import { useState, useRef, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

// ── PERMISSIONS ───────────────────────────────────────────────────────────────
const PERMS = {
  architect: {
    createProject:true, editProgress:true, addUpdate:true, manageTeam:true,
    markAttendance:true, addExpense:true, deleteExpense:true, export:true,
    share:true, changeMilestone:true, addIssue:true, resolveIssue:true,
    addMaterial:true, deleteMaterial:true, manageDrawings:true, viewActivity:true,
    tabs:["overview","milestones","updates","issues","materials","drawings","team","attendance","budget","gantt"],
    nav:["dashboard","projects","analytics","activity","notifications"],
  },
  pm: {
    createProject:false, editProgress:false, addUpdate:true, manageTeam:false,
    markAttendance:true, addExpense:false, deleteExpense:false, export:true,
    share:false, changeMilestone:true, addIssue:true, resolveIssue:true,
    addMaterial:true, deleteMaterial:false, manageDrawings:false, viewActivity:false,
    tabs:["overview","milestones","updates","issues","materials","drawings","team","attendance","budget","gantt"],
    nav:["dashboard","projects","pm","notifications"],
  },
  client: {
    createProject:false, editProgress:false, addUpdate:false, manageTeam:false,
    markAttendance:false, addExpense:false, deleteExpense:false, export:false,
    share:false, changeMilestone:false, addIssue:false, resolveIssue:false,
    addMaterial:false, deleteMaterial:false, manageDrawings:false, viewActivity:false,
    tabs:["overview","milestones","updates","drawings","gantt"],
    nav:["dashboard","client","notifications"],
  },
};
const can = (user, p) => !!(user && PERMS[user.role]?.[p]);
const ROLE_META = {
  architect:{label:"Architect",bg:"bg-orange-100",text:"text-orange-700",col:"orange"},
  pm:{label:"Project Manager",bg:"bg-blue-100",text:"text-blue-700",col:"blue"},
  client:{label:"Client",bg:"bg-emerald-100",text:"text-emerald-700",col:"emerald"},
};

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
const MOCK_USERS = {
  architect:{id:"u1",name:"Arjun Reddy",email:"arjun@buildco.in",role:"architect",avatar:"AR"},
  pm:{id:"u2",name:"Priya Sharma",email:"priya@buildco.in",role:"pm",avatar:"PS"},
  client:{id:"u3",name:"Vikram Nair",email:"vikram@client.in",role:"client",avatar:"VN"},
};
const INIT_PROJECTS = [
  {id:"p1",name:"Skyline Tower Phase II",client_name:"Nair Holdings",client_email:"vikram@client.in",location:"Jubilee Hills, Hyderabad",status:"active",start_date:"2024-11-01",expected_end_date:"2026-06-30",budget:45000000,description:"28-floor commercial tower with underground parking.",progress:62},
  {id:"p2",name:"Green Valley Residences",client_name:"Greenfield Developers",client_email:"gf@green.in",location:"Gachibowli, Hyderabad",status:"active",start_date:"2025-01-15",expected_end_date:"2026-12-31",budget:18000000,description:"Eco-friendly residential complex with 120 units.",progress:34},
  {id:"p3",name:"Metro Link Office Park",client_name:"TechSpace Corp",client_email:"ts@techspace.in",location:"HITEC City, Hyderabad",status:"completed",start_date:"2023-06-01",expected_end_date:"2024-12-31",budget:32000000,description:"4-building IT campus.",progress:100},
  {id:"p4",name:"Heritage Mall Renovation",client_name:"RetailPlus Ltd",client_email:"rp@retailplus.in",location:"Banjara Hills, Hyderabad",status:"on_hold",start_date:"2025-03-01",expected_end_date:"2025-11-30",budget:8500000,description:"Modernization of 1990s commercial mall.",progress:15},
];
const INIT_MILESTONES = {
  p1:[
    {id:"m1",title:"Foundation Complete",status:"completed",due_date:"2025-01-15",completed_date:"2025-01-10"},
    {id:"m2",title:"Frame Floors 1-10",status:"completed",due_date:"2025-04-01",completed_date:"2025-03-28"},
    {id:"m3",title:"Frame Floors 11-20",status:"completed",due_date:"2025-07-01",completed_date:"2025-06-25"},
    {id:"m4",title:"MEP Rough-In",status:"in_progress",due_date:"2025-10-01",completed_date:null},
    {id:"m5",title:"Facade Installation",status:"pending",due_date:"2026-01-15",completed_date:null},
    {id:"m6",title:"Interior Fit-Out",status:"pending",due_date:"2026-04-01",completed_date:null},
    {id:"m7",title:"Final Handover",status:"pending",due_date:"2026-06-30",completed_date:null},
  ],
  p2:[
    {id:"m8",title:"Site Preparation",status:"completed",due_date:"2025-02-01",completed_date:"2025-01-28"},
    {id:"m9",title:"Foundation",status:"completed",due_date:"2025-05-01",completed_date:"2025-04-20"},
    {id:"m10",title:"Ground Floor Slab",status:"in_progress",due_date:"2025-08-01",completed_date:null},
    {id:"m11",title:"Solar Substructure",status:"pending",due_date:"2025-12-01",completed_date:null},
    {id:"m12",title:"Handover",status:"pending",due_date:"2026-12-31",completed_date:null},
  ],
};
const INIT_UPDATES = {
  p1:[
    {id:"du1",update_date:"2025-04-20",notes:"MEP conduit routing floors 14-16 done. GHMC inspection passed.",weather:"Sunny 34°C",workers_count:67,photos:[]},
    {id:"du2",update_date:"2025-04-18",notes:"Concrete pour floor 21 complete. Mix design approved.",weather:"Cloudy 31°C",workers_count:54,photos:[]},
  ],
  p2:[{id:"du4",update_date:"2025-04-19",notes:"Ground floor columns — 8 of 24 done.",weather:"Overcast 28°C",workers_count:38,photos:[]}],
};
const INIT_EXPENSES = {
  p1:[
    {id:"e1",date:"2025-04-15",category:"Materials",description:"Steel rebar - 40 tons",amount:2800000},
    {id:"e2",date:"2025-04-10",category:"Labour",description:"April week 2 wages",amount:1200000},
    {id:"e3",date:"2025-04-05",category:"Equipment",description:"Crane hire - 2 weeks",amount:850000},
    {id:"e4",date:"2025-03-28",category:"Materials",description:"Cement - 600 bags",amount:420000},
  ],
  p2:[
    {id:"e6",date:"2025-04-18",category:"Materials",description:"Formwork lumber",amount:380000},
    {id:"e7",date:"2025-04-12",category:"Labour",description:"April wages",amount:680000},
  ],
};
const INIT_TEAMS = {
  p1:[
    {id:"t1",name:"Ravi Kumar",role:"Site Engineer",phone:"9876543210",status:"active"},
    {id:"t2",name:"Suresh Babu",role:"Foreman",phone:"9876543211",status:"active"},
    {id:"t3",name:"Kiran Reddy",role:"Safety Officer",phone:"9876543212",status:"active"},
    {id:"t4",name:"Anand Kumar",role:"Electrician",phone:"9876543213",status:"on_leave"},
  ],
  p2:[
    {id:"t5",name:"Mahesh Rao",role:"Site Engineer",phone:"9876543220",status:"active"},
    {id:"t6",name:"Deepak Singh",role:"Foreman",phone:"9876543221",status:"active"},
  ],
};
const INIT_ATTENDANCE = {
  p1:{"2025-04-20":{"t1":"present","t2":"present","t3":"present","t4":"absent"},"2025-04-19":{"t1":"present","t2":"half_day","t3":"present","t4":"absent"}},
  p2:{"2025-04-20":{"t5":"present","t6":"present"}},
};
const INIT_ISSUES = {
  p1:[
    {id:"i1",title:"Crack in column C-12 floor 8",severity:"high",status:"open",reported_date:"2025-04-18",reported_by:"Ravi Kumar",description:"Hairline crack. Structural review needed."},
    {id:"i2",title:"Water seepage near foundation east wing",severity:"medium",status:"resolved",reported_date:"2025-04-10",reported_by:"Suresh Babu",description:"Waterproofing applied.",resolved_date:"2025-04-15"},
    {id:"i3",title:"Safety railing missing floor 14 south",severity:"high",status:"open",reported_date:"2025-04-20",reported_by:"Kiran Reddy",description:"Worker safety risk."},
  ],
  p2:[{id:"i4",title:"Formwork misalignment block B",severity:"low",status:"open",reported_date:"2025-04-17",reported_by:"Mahesh Rao",description:"Minor misalignment before pour."}],
};
const INIT_MATERIALS = {
  p1:[
    {id:"mat1",date:"2025-04-19",material:"TMT Steel - Fe500",quantity:"15 tons",supplier:"Vizag Steel",status:"received",notes:"Inspected, no defects"},
    {id:"mat2",date:"2025-04-17",material:"Ready Mix Concrete M30",quantity:"60 cubic m",supplier:"Ultratech RMC",status:"received",notes:"Slump test passed"},
    {id:"mat3",date:"2025-04-22",material:"Electrical Conduit 25mm",quantity:"500 pcs",supplier:"Havells",status:"expected",notes:"For floors 14-16"},
  ],
  p2:[
    {id:"mat5",date:"2025-04-18",material:"OPC Cement 53 Grade",quantity:"300 bags",supplier:"ACC Cement",status:"received",notes:""},
    {id:"mat6",date:"2025-04-25",material:"River Sand",quantity:"20 tons",supplier:"Local supplier",status:"expected",notes:""},
  ],
};
// NEW: Drawings per project - architect manages releases
const INIT_DRAWINGS = {
  p1:[
    {id:"d1",title:"Foundation Layout",type:"Structural",revision:"Rev A",date:"2025-01-05",released_to:["pm","client"],notes:"Approved for construction",status:"current"},
    {id:"d2",title:"Floor Plan Floors 1-10",type:"Architectural",revision:"Rev B",date:"2025-03-15",released_to:["pm"],notes:"For contractor use only — not for client",status:"current"},
    {id:"d3",title:"MEP Schematic Floors 1-16",type:"MEP",revision:"Rev A",date:"2025-04-01",released_to:["pm"],notes:"Electrical and plumbing layout",status:"current"},
    {id:"d4",title:"Facade Design - Final",type:"Architectural",revision:"Rev C",date:"2025-04-10",released_to:["pm","client"],notes:"Client approved design",status:"current"},
    {id:"d5",title:"Structural Column Schedule",type:"Structural",revision:"Rev A",date:"2025-02-20",released_to:["pm"],notes:"Internal use only",status:"superseded"},
  ],
  p2:[
    {id:"d6",title:"Site Layout Plan",type:"Civil",revision:"Rev A",date:"2025-01-20",released_to:["pm","client"],notes:"Approved layout",status:"current"},
    {id:"d7",title:"Solar Panel Layout",type:"MEP",revision:"Rev A",date:"2025-03-10",released_to:["pm"],notes:"For MEP contractor only",status:"current"},
  ],
};
// NEW: Activity feed - all role changes visible to architect
const INIT_ACTIVITY = [
  {id:"ac1",pid:"p1",pname:"Skyline Tower Phase II",type:"update",by:"Priya Sharma",role:"pm",action:"Added site update",detail:"MEP conduit routing floors 14-16 done",time:"2025-04-20T10:30:00Z",read:false},
  {id:"ac2",pid:"p1",pname:"Skyline Tower Phase II",type:"issue",by:"Kiran Reddy",role:"pm",action:"Reported HIGH severity issue",detail:"Safety railing missing on floor 14 south",time:"2025-04-20T09:15:00Z",read:false},
  {id:"ac3",pid:"p1",pname:"Skyline Tower Phase II",type:"milestone",by:"Priya Sharma",role:"pm",action:"Changed milestone status",detail:"MEP Rough-In → in_progress",time:"2025-04-19T16:00:00Z",read:false},
  {id:"ac4",pid:"p2",pname:"Green Valley Residences",type:"material",by:"Mahesh Rao",role:"pm",action:"Marked material received",detail:"OPC Cement 53 Grade — 300 bags",time:"2025-04-19T14:00:00Z",read:true},
  {id:"ac5",pid:"p2",pname:"Green Valley Residences",type:"update",by:"Priya Sharma",role:"pm",action:"Added site update",detail:"Ground floor columns — 8 of 24 done",time:"2025-04-19T11:00:00Z",read:true},
];
const INIT_NOTIFS = [
  {id:"n1",title:"Update on Skyline Tower Phase II",message:"MEP conduit routing completed floors 14-16.",created_at:"2025-04-20T10:30:00Z",read:false},
  {id:"n2",title:"Milestone: Frame 11-20 complete",message:"Marked complete 6 days ahead of schedule.",created_at:"2025-06-25T09:00:00Z",read:false},
  {id:"n3",title:"Update on Green Valley Residences",message:"Ground floor column casting in progress.",created_at:"2025-04-19T11:00:00Z",read:true},
];

const EXPENSE_CATS = ["Materials","Labour","Equipment","Misc","Consultancy","Permits"];
const DRAW_TYPES = ["Architectural","Structural","MEP","Civil","Landscape","Interior","Electrical"];
const ROLES_LIST = ["Site Engineer","Foreman","Safety Officer","Electrician","Plumber","Mason","Carpenter","Supervisor"];
const SEV_COLOR = {high:{bg:"bg-red-50",text:"text-red-600",border:"border-red-200",dot:"bg-red-500"},medium:{bg:"bg-amber-50",text:"text-amber-700",border:"border-amber-200",dot:"bg-amber-400"},low:{bg:"bg-blue-50",text:"text-blue-600",border:"border-blue-200",dot:"bg-blue-400"}};
const MAT_STATUS = {received:{bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200"},expected:{bg:"bg-blue-50",text:"text-blue-600",border:"border-blue-200"},rejected:{bg:"bg-red-50",text:"text-red-600",border:"border-red-200"}};
const CAT_COLORS = {Materials:"bg-blue-50 text-blue-600",Labour:"bg-violet-50 text-violet-600",Equipment:"bg-amber-50 text-amber-600",Misc:"bg-slate-100 text-slate-500",Consultancy:"bg-emerald-50 text-emerald-600",Permits:"bg-orange-50 text-orange-600"};
const ATT_STATUS = {present:{label:"Present",bg:"bg-emerald-100",text:"text-emerald-700"},absent:{label:"Absent",bg:"bg-red-100",text:"text-red-600"},half_day:{label:"Half Day",bg:"bg-amber-100",text:"text-amber-700"}};
const ACTIVITY_ICONS = {update:"hardhat",issue:"alert",milestone:"flag",material:"truck",drawing:"doc",expense:"wallet",team:"users",general:"bell"};
const CHART_COLORS = ["#f97316","#3b82f6","#10b981","#8b5cf6","#f59e0b","#ef4444"];

const fmtDate = d => { if(!d)return"—"; try{return new Date(d).toLocaleDateString("en-IN",{month:"short",day:"numeric",year:"numeric"});}catch{return"—";} };
const fmtTime = t => { if(!t)return""; try{return new Date(t).toLocaleString("en-IN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}catch{return"";} };
const fmtCur = n => { if(n===undefined||n===null)return"—"; return"₹"+Number(n).toLocaleString("en-IN"); };
const sCol = s => ({active:{bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200",dot:"bg-emerald-500"},completed:{bg:"bg-blue-50",text:"text-blue-700",border:"border-blue-200",dot:"bg-blue-500"},on_hold:{bg:"bg-amber-50",text:"text-amber-700",border:"border-amber-200",dot:"bg-amber-500"},in_progress:{bg:"bg-violet-50",text:"text-violet-700",border:"border-violet-200",dot:"bg-violet-500"},pending:{bg:"bg-slate-50",text:"text-slate-500",border:"border-slate-200",dot:"bg-slate-300"},current:{bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200",dot:"bg-emerald-500"},superseded:{bg:"bg-slate-50",text:"text-slate-400",border:"border-slate-200",dot:"bg-slate-300"}}[s]||{bg:"bg-slate-50",text:"text-slate-600",border:"border-slate-200",dot:"bg-slate-400"});

const exportPDF = (proj,ms,us,ex,iss) => {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${proj.name} — Site Report</title>
  <style>body{font-family:Arial,sans-serif;padding:40px;color:#1e293b}h1{color:#f97316;margin-bottom:4px}h2{color:#334155;font-size:16px;margin-top:28px;border-bottom:2px solid #f97316;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}th{background:#f97316;color:white;padding:8px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #e2e8f0}.bar{background:#e2e8f0;border-radius:4px;height:8px;margin:6px 0}.fill{background:#f97316;height:8px;border-radius:4px}.update{padding:12px;background:#f8fafc;border-radius:8px;margin:8px 0;font-size:13px}footer{margin-top:40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}@media print{body{padding:20px}}</style></head>
  <body><div style="display:flex;justify-content:space-between;align-items:start"><div><h1>${proj.name}</h1><p style="color:#64748b;font-size:13px;margin:4px 0">${proj.location} · ${proj.client_name}</p></div><div style="font-size:11px;color:#64748b;text-align:right">Generated ${new Date().toLocaleDateString("en-IN")}<br>SiteTrack Pro</div></div>
  <p style="font-size:13px;color:#475569">${proj.description}</p>
  <p><strong>Progress: ${proj.progress}%</strong></p><div class="bar"><div class="fill" style="width:${proj.progress}%"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0;font-size:13px"><div><strong>Budget:</strong> ${fmtCur(proj.budget)}</div><div><strong>Started:</strong> ${fmtDate(proj.start_date)}</div><div><strong>Expected End:</strong> ${fmtDate(proj.expected_end_date)}</div></div>
  <h2>Milestones</h2><table><tr><th>#</th><th>Milestone</th><th>Due Date</th><th>Status</th></tr>${ms.map((m,i)=>`<tr><td>${i+1}</td><td>${m.title}</td><td>${fmtDate(m.due_date)}</td><td>${m.completed_date?`✓ ${fmtDate(m.completed_date)}`:m.status.replace("_"," ")}</td></tr>`).join("")}</table>
  <h2>Open Issues</h2><table><tr><th>Issue</th><th>Severity</th><th>Reported</th><th>Status</th></tr>${(iss||[]).map(i=>`<tr><td>${i.title}</td><td>${i.severity}</td><td>${fmtDate(i.reported_date)}</td><td>${i.status}</td></tr>`).join("")}</table>
  <h2>Recent Updates</h2>${us.slice(0,5).map(u=>`<div class="update"><strong>${fmtDate(u.update_date)}</strong>${u.weather?` · ${u.weather}`:""}<p style="margin:6px 0 0">${u.notes}</p>${u.workers_count?`<p style="font-size:12px;color:#64748b;margin:4px 0">👷 ${u.workers_count} workers</p>`:""}</div>`).join("")}
  <h2>Expenses</h2><table><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr>${ex.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${e.category}</td><td>${e.description}</td><td>${fmtCur(e.amount)}</td></tr>`).join("")}<tr style="font-weight:bold;background:#f8fafc"><td colspan="3">Total</td><td>${fmtCur(ex.reduce((s,e)=>s+e.amount,0))}</td></tr></table>
  <footer>SiteTrack Pro · buildco.in · Auto-generated</footer></body></html>`;
  const w = window.open("","_blank"); if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);}
};
const exportCSV = (proj,ex) => {
  const rows = [["Date","Category","Description","Amount(INR)"],...ex.map(e=>[e.date,e.category,`"${e.description}"`,e.amount]),["","","TOTAL",ex.reduce((s,e)=>s+e.amount,0)]];
  const a = document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(rows.map(r=>r.join(",")).join("\n")); a.download=`${proj.name.replace(/\s+/g,"-")}-expenses.csv`; a.click();
};

// ── ICONS ─────────────────────────────────────────────────────────────────────
const Ic = ({n,s=18,c=""}) => {
  const m = {
    building:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>,
    check:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M20 6 9 17l-5-5"/></svg>,
    plus:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M5 12h14"/><path d="M12 5v14"/></svg>,
    bell:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
    calendar:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
    map:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
    arrow:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>,
    users:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    hardhat:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6h0"/><path d="M14 6h0a6 6 0 0 1 6 6v3"/></svg>,
    logout:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
    flag:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>,
    dashboard:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>,
    folder:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    search:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
    x:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
    trend:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
    eye:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    camera:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>,
    wallet:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
    trash:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
    image:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
    mailCheck:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg>,
    pencil:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
    phone:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    share:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>,
    copy:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
    moon:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>,
    sun2:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
    menu:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>,
    barChart:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
    gantt:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M3 3v18h18"/><path d="M7 16h8"/><path d="M7 11h5"/><path d="M7 6h3"/></svg>,
    download:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
    sliders:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>,
    alert:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
    truck:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect width="7" height="7" x="14" y="10" rx="1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    lock:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    shield:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    doc:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>,
    activity:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    send:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
  };
  return m[n]||null;
};

const Av = ({i,sz="md",col="orange"}) => {
  const s={sm:"w-7 h-7 text-xs",md:"w-9 h-9 text-sm",lg:"w-12 h-12 text-base"}[sz];
  const c={orange:"bg-orange-500",blue:"bg-blue-600",violet:"bg-violet-600",emerald:"bg-emerald-600",slate:"bg-slate-500"}[col]||"bg-orange-500";
  return <div className={`${s} ${c} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>{i}</div>;
};
const Badge = ({status}) => { const c=sCol(status); return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>{status.replace("_"," ")}</span>; };
const PBar = ({v,col="orange"}) => { const c={orange:"from-orange-400 to-amber-500",blue:"from-blue-500 to-blue-600",emerald:"from-emerald-400 to-emerald-500",red:"from-red-400 to-red-500",violet:"from-violet-400 to-violet-500"}[col]||"from-orange-400 to-amber-500"; return <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${c} transition-all duration-700`} style={{width:`${Math.min(Math.max(v||0,0),100)}%`}}/></div>; };
const SC = ({icon,label,value,sub,accent="orange"}) => { const a={orange:"text-orange-500 bg-orange-50",blue:"text-blue-600 bg-blue-50",emerald:"text-emerald-600 bg-emerald-50",violet:"text-violet-600 bg-violet-50",red:"text-red-600 bg-red-50"}[accent]||"text-orange-500 bg-orange-50"; return <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${a}`}><Ic n={icon} s={20}/></div><div className="text-2xl font-black text-slate-800">{value}</div><div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mt-1">{label}</div>{sub&&<div className="text-xs text-slate-500 mt-1">{sub}</div>}</div>; };
const AccessDenied = ({msg="You don't have permission."}) => <div className="flex flex-col items-center justify-center py-20 text-center"><div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><Ic n="lock" s={28} c="text-slate-400"/></div><h3 className="font-bold text-slate-600 mb-1">Access Restricted</h3><p className="text-slate-400 text-sm max-w-xs">{msg}</p></div>;

// ── GANTT ─────────────────────────────────────────────────────────────────────
function GanttView({project,milestones}){
  const ms=milestones||[]; if(!ms.length) return <div className="text-center py-16 text-slate-400"><Ic n="gantt" s={32} c="mx-auto mb-3 opacity-30"/><p>No milestones</p></div>;
  const pS=new Date(project.start_date), pE=new Date(project.expected_end_date);
  const W=700,LW=150,BW=W-LW-16,RH=40,HDR=36,SH=HDR+ms.length*RH+24;
  const toX=d=>LW+Math.max(0,Math.min(1,(new Date(d)-pS)/(pE-pS)))*BW;
  const sFill={completed:"#10b981",in_progress:"#f97316",pending:"#e2e8f0"};
  const months=[]; let mc=new Date(pS.getFullYear(),pS.getMonth(),1);
  while(mc<=pE){months.push(new Date(mc));mc=new Date(mc.getFullYear(),mc.getMonth()+1,1);}
  const ranges=ms.map((m,i)=>({...m,s:i===0?pS:new Date(ms[i-1].due_date),e:new Date(m.due_date)}));
  return(
    <div className="bg-white rounded-2xl border border-slate-200 p-6 overflow-x-auto">
      <h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="gantt" s={15} c="text-orange-500"/>Project Timeline</h3>
      <svg width="100%" viewBox={`0 0 ${W} ${SH}`} style={{minWidth:W,display:"block"}}>
        {months.map((m,i)=>{const x=toX(m);if(x<LW||x>W-16)return null;return <g key={i}><line x1={x} y1={HDR-4} x2={x} y2={SH-12} stroke="#e2e8f0" strokeWidth="1"/><text x={x} y={14} fontSize="9" fill="#94a3b8" textAnchor="middle">{m.toLocaleDateString("en-IN",{month:"short",year:"2-digit"})}</text></g>;})}
        {(()=>{const tx=toX(new Date());return tx>LW&&tx<W-16?<line x1={tx} y1={HDR-4} x2={tx} y2={SH-12} stroke="#f97316" strokeWidth="1.5" strokeDasharray="4,3"/>:null;})()}
        {ranges.map((m,i)=>{const y=HDR+i*RH,x1=Math.max(toX(m.s),LW),x2=Math.min(toX(m.e),W-16),bw=Math.max(x2-x1,4),fill=sFill[m.status]||"#e2e8f0",lbl=m.title.length>18?m.title.slice(0,17)+"…":m.title;return <g key={m.id}>{i%2===0&&<rect x={0} y={y} width={W} height={RH} fill="#f8fafc" opacity="0.5"/>}<text x={LW-8} y={y+RH/2+4} fontSize="11" fill="#475569" textAnchor="end">{lbl}</text><rect x={LW} y={y+8} width={BW} height={RH-16} rx="3" fill="#f1f5f9"/><rect x={x1} y={y+8} width={bw} height={RH-16} rx="3" fill={fill} opacity={m.status==="pending"?0.4:1}/>{m.status==="completed"&&bw>20&&<text x={x1+bw/2} y={y+RH/2+4} fontSize="9" fill="white" textAnchor="middle">✓</text>}{m.status==="in_progress"&&bw>30&&<text x={x1+bw/2} y={y+RH/2+4} fontSize="9" fill="white" textAnchor="middle">Active</text>}</g>;})}
      </svg>
      <div className="flex gap-5 mt-3 flex-wrap">{[["completed","#10b981","Completed"],["in_progress","#f97316","In Progress"],["pending","#e2e8f0","Pending"]].map(([k,c,l])=><div key={k} className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded-sm inline-block border border-slate-200" style={{background:c}}></span>{l}</div>)}<div className="flex items-center gap-1.5 text-xs text-slate-500 ml-2"><span className="w-6 border-t-2 border-dashed border-orange-400 inline-block"></span>Today</div></div>
    </div>
  );
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
function AnalyticsView({user,projects,expenses,updates,teams}){
  if(!can(user,"export")) return <div className="p-8"><AccessDenied msg="Analytics available for Architect and PM only."/></div>;
  const progData=projects.filter(p=>p.status!=="completed").map(p=>({name:p.name.split(" ").slice(0,3).join(" "),progress:p.progress,fill:p.progress>=70?"#10b981":p.progress>=40?"#f97316":"#ef4444"}));
  const statusData=[{name:"Active",value:projects.filter(p=>p.status==="active").length},{name:"Completed",value:projects.filter(p=>p.status==="completed").length},{name:"On Hold",value:projects.filter(p=>p.status==="on_hold").length}].filter(d=>d.value>0);
  const budgetData=projects.filter(p=>expenses[p.id]?.length>0).map(p=>({name:p.name.split(" ").slice(0,2).join(" "),Budget:Math.round(p.budget/100000),Spent:Math.round((expenses[p.id]||[]).reduce((s,e)=>s+e.amount,0)/100000)}));
  return(
    <div className="p-4 md:p-8">
      <div className="mb-8"><h1 className="text-2xl font-black text-slate-800">Analytics</h1><p className="text-slate-500 text-sm mt-1">Projects & resources overview</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SC icon="folder" label="Projects" value={projects.length} accent="blue"/>
        <SC icon="wallet" label="Total Budget" value={`₹${Math.round(projects.reduce((s,p)=>s+p.budget,0)/10000000)}Cr`} accent="orange"/>
        <SC icon="trend" label="Spent" value={`₹${Math.round(Object.values(expenses).flat().reduce((s,e)=>s+e.amount,0)/100000)}L`} accent="violet"/>
        <SC icon="users" label="Team" value={Object.values(teams).flat().length} accent="emerald"/>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 text-sm mb-5">Progress</h3><ResponsiveContainer width="100%" height={200}><BarChart data={progData} layout="vertical" margin={{left:10,right:20}}><XAxis type="number" domain={[0,100]} fontSize={10} tick={{fill:"#94a3b8"}}/><YAxis dataKey="name" type="category" fontSize={10} width={120} tick={{fill:"#475569"}}/><Tooltip formatter={v=>`${v}%`} contentStyle={{fontSize:12,borderRadius:8}}/><Bar dataKey="progress" radius={[0,4,4,0]}>{progData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 text-sm mb-5">Status</h3><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} label={({name,value})=>`${name}: ${value}`} labelLine={false}>{statusData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i]}/>)}</Pie><Tooltip contentStyle={{fontSize:12,borderRadius:8}}/></PieChart></ResponsiveContainer></div>
        {budgetData.length>0&&<div className="bg-white rounded-2xl border border-slate-200 p-6 md:col-span-2"><h3 className="font-bold text-slate-800 text-sm mb-5">Budget vs Spent (₹ Lakhs)</h3><ResponsiveContainer width="100%" height={220}><BarChart data={budgetData} margin={{top:5,right:20,bottom:5,left:0}}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" fontSize={11} tick={{fill:"#475569"}}/><YAxis fontSize={10} tick={{fill:"#94a3b8"}}/><Tooltip contentStyle={{fontSize:12,borderRadius:8}}/><Legend wrapperStyle={{fontSize:12}}/><Bar dataKey="Budget" fill="#3b82f6" radius={[4,4,0,0]}/><Bar dataKey="Spent" fill="#f97316" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>}
      </div>
    </div>
  );
}

// ── ACTIVITY FEED (Architect only) ────────────────────────────────────────────
function ActivityView({user,activity,setActivity,projects}){
  if(!can(user,"viewActivity")) return <div className="p-8"><AccessDenied msg="Activity feed is visible to Architect only."/></div>;
  const unread = activity.filter(a=>!a.read).length;
  const typeColor = {update:"bg-orange-50 text-orange-500",issue:"bg-red-50 text-red-500",milestone:"bg-violet-50 text-violet-500",material:"bg-blue-50 text-blue-500",drawing:"bg-emerald-50 text-emerald-500",team:"bg-slate-100 text-slate-500",expense:"bg-amber-50 text-amber-500",general:"bg-slate-100 text-slate-500"};
  const pname = pid => projects.find(p=>p.id===pid)?.name || "Unknown";
  return(
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="flex items-start justify-between mb-8">
        <div><h1 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Ic n="activity" s={22} c="text-orange-500"/>Activity Feed</h1><p className="text-slate-500 text-sm mt-1">{unread} new changes by your team</p></div>
        {unread>0&&<button onClick={()=>setActivity(p=>p.map(a=>({...a,read:true})))} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm"><Ic n="mailCheck" s={15}/>Mark all read</button>}
      </div>
      {activity.length===0&&<div className="text-center py-20 text-slate-400"><Ic n="activity" s={36} c="mx-auto mb-3 opacity-30"/><p>No activity yet</p><p className="text-xs mt-1">PM actions will appear here</p></div>}
      <div className="space-y-3">
        {activity.map(a=>{
          const ic=ACTIVITY_ICONS[a.type]||"bell";
          const tc=typeColor[a.type]||"bg-slate-100 text-slate-500";
          return(
            <div key={a.id} className={`bg-white rounded-2xl border p-5 flex gap-4 transition-all ${a.read?"border-slate-100":"border-orange-100 shadow-sm"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tc}`}><Ic n={ic} s={18}/></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800 text-sm">{a.action}</span>
                    <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_META[a.role]?.bg} ${ROLE_META[a.role]?.text}`}>{a.by}</span>
                  </div>
                  {!a.read&&<button onClick={()=>setActivity(p=>p.map(x=>x.id===a.id?{...x,read:true}:x))} className="text-xs text-orange-500 font-semibold flex-shrink-0">Mark read</button>}
                </div>
                <p className="text-slate-500 text-xs mt-1">{a.detail}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Ic n="folder" s={11}/>{pname(a.pid)}</span>
                  <span className="flex items-center gap-1"><Ic n="calendar" s={11}/>{fmtTime(a.time)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,dark,toggleDark}){
  const[role,setRole]=useState("architect");const[anim,setAnim]=useState(false);
  const roles=[
    {key:"architect",label:"Architect / Admin",sub:"Full control — drawings, team, export, activity feed",ini:"AR",col:"orange",perms:["Release Drawings","Manage Everything","View All Activity","Export & Share"]},
    {key:"pm",label:"Project Manager",sub:"Field ops — updates, attendance, issues, materials",ini:"PS",col:"blue",perms:["Add Site Updates","Mark Attendance","Report Issues","Add Material Logs"]},
    {key:"client",label:"Client",sub:"Read-only — progress, milestones, released drawings",ini:"VN",col:"emerald",perms:["View Progress","View Milestones","View Released Drawings","View Updates"]},
  ];
  return(
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{backgroundImage:"linear-gradient(#f97316 1px,transparent 1px),linear-gradient(90deg,#f97316 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900/80 to-orange-950/40"/>
      <button onClick={toggleDark} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10 p-2 rounded-xl bg-white/10"><Ic n={dark?"sun2":"moon"} s={18}/></button>
      <div className={`relative z-10 w-full max-w-lg transition-all duration-400 ${anim?"opacity-0 scale-95":"opacity-100 scale-100"}`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4"><div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30"><Ic n="hardhat" s={24} c="text-white"/></div><div><div className="text-3xl font-black text-white tracking-tight leading-none">SiteTrack</div><div className="text-xs font-medium text-orange-400 tracking-widest uppercase">Pro</div></div></div>
          <p className="text-slate-400 text-sm">Construction management with role-based access</p>
        </div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-5"><Ic n="shield" s={15} c="text-orange-400"/><h2 className="text-white font-bold text-sm">Select your role — permissions apply automatically</h2></div>
          <div className="space-y-2 mb-6">
            {roles.map(r=>(
              <button key={r.key} onClick={()=>setRole(r.key)} className={`w-full text-left rounded-2xl border-2 transition-all ${role===r.key?"border-orange-500 bg-orange-500/10":"border-white/10 hover:border-white/20 bg-white/5"}`}>
                <div className="flex items-center gap-3 p-4"><Av i={r.ini} col={r.col}/><div className="flex-1 min-w-0"><div className="font-semibold text-white text-sm">{r.label}</div><div className="text-xs text-slate-400 mt-0.5">{r.sub}</div></div>{role===r.key&&<div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0"><Ic n="check" s={12} c="text-white"/></div>}</div>
                {role===r.key&&<div className="px-4 pb-4 border-t border-white/10 pt-3"><div className="flex flex-wrap gap-1.5">{r.perms.map(p=><span key={p} className="text-[10px] font-semibold bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">{p}</span>)}</div></div>}
              </button>
            ))}
          </div>
          <button onClick={()=>{setAnim(true);setTimeout(()=>onLogin(MOCK_USERS[role]),400);}} className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl transition-all hover:shadow-lg hover:shadow-orange-500/30 text-sm">Continue as {roles.find(r=>r.key===role)?.label} →</button>
        </div>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({user,active,setView,uc,ac,mobileOpen,setMobileOpen}){
  const allItems=[
    {id:"dashboard",icon:"dashboard",label:"Dashboard"},
    {id:"projects",icon:"folder",label:"Projects"},
    {id:"analytics",icon:"barChart",label:"Analytics"},
    {id:"activity",icon:"activity",label:"Activity",badge:ac},
    {id:"pm",icon:"users",label:"PM View"},
    {id:"client",icon:"eye",label:"Client Portal"},
    {id:"notifications",icon:"bell",label:"Updates",badge:uc},
  ];
  const items=allItems.filter(i=>PERMS[user.role].nav.includes(i.id));
  const rm=ROLE_META[user.role];
  return(
    <>
      {mobileOpen&&<div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={()=>setMobileOpen(false)}/>}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 w-64 bg-slate-900 min-h-screen flex flex-col border-r border-slate-800 transform transition-transform duration-300 ${mobileOpen?"translate-x-0":"-translate-x-full"} md:translate-x-0`}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center"><Ic n="hardhat" s={18} c="text-white"/></div><div><div className="text-white font-black text-lg leading-none">SiteTrack</div><div className="text-orange-400 text-[10px] font-semibold tracking-widest uppercase">Pro</div></div></div>
          <button onClick={()=>setMobileOpen(false)} className="md:hidden text-slate-400 hover:text-white"><Ic n="x" s={20}/></button>
        </div>
        <div className="mx-4 mt-3"><div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${rm.bg} ${rm.text}`}><Ic n="shield" s={12}/>{rm.label}</div></div>
        <nav className="flex-1 p-4 space-y-1">
          {items.map(it=>(
            <button key={it.id} onClick={()=>{setView(it.id);setMobileOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${active===it.id?"bg-orange-500 text-white shadow-lg shadow-orange-500/20":"text-slate-400 hover:text-white hover:bg-white/5"}`}>
              <Ic n={it.icon} s={17}/><span>{it.label}</span>
              {it.badge>0&&<span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${active===it.id?"bg-white/20 text-white":"bg-orange-500 text-white"}`}>{it.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/5">
            <Av i={user.avatar} sz="sm" col={rm.col}/>
            <div className="flex-1 min-w-0"><div className="text-white text-sm font-semibold truncate">{user.name}</div><div className="text-slate-400 text-xs truncate">{user.email}</div></div>
            <button onClick={()=>setView("logout")} className="text-slate-500 hover:text-slate-300"><Ic n="logout" s={15}/></button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function DashboardView({user,projects,updates,issues,activity,setView,setSP}){
  const mp=user.role==="client"?projects.filter(p=>p.client_email===user.email):projects;
  const openIssues=Object.values(issues).flat().filter(i=>i.status==="open");
  const highIssues=openIssues.filter(i=>i.severity==="high");
  const unreadAc=activity.filter(a=>!a.read).length;
  const ru=Object.values(updates).flat().slice(0,2);
  return(
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-black text-slate-800 mb-1">Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, {user.name.split(" ")[0]} 👋</h1><p className="text-slate-500 text-sm">Your construction overview.</p></div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${ROLE_META[user.role].bg} ${ROLE_META[user.role].text}`}><Ic n="shield" s={12}/>{ROLE_META[user.role].label}</div>
      </div>
      {highIssues.length>0&&user.role!=="client"&&(
        <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="alert" s={18} c="text-red-600"/></div>
          <div className="flex-1"><div className="font-bold text-red-700 text-sm">{highIssues.length} High Severity Issues Need Attention</div><div className="text-red-500 text-xs">{highIssues.map(i=>i.title).slice(0,2).join(" · ")}</div></div>
          <button onClick={()=>setView("projects")} className="text-red-600 font-semibold text-xs">View →</button>
        </div>
      )}
      {user.role==="architect"&&unreadAc>0&&(
        <div className="mb-5 bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="activity" s={18} c="text-orange-600"/></div>
          <div className="flex-1"><div className="font-bold text-orange-700 text-sm">{unreadAc} new team activities</div><div className="text-orange-500 text-xs">PM actions need your review</div></div>
          <button onClick={()=>setView("activity")} className="text-orange-600 font-semibold text-xs">View Feed →</button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SC icon="folder" label="Total" value={mp.length} accent="blue"/>
        <SC icon="building" label="Active" value={mp.filter(p=>p.status==="active").length} accent="orange"/>
        <SC icon="check" label="Done" value={mp.filter(p=>p.status==="completed").length} accent="emerald"/>
        {user.role!=="client"?<SC icon="alert" label="Open Issues" value={openIssues.length} sub={highIssues.length>0?`${highIssues.length} high priority`:""} accent={highIssues.length>0?"red":"violet"}/>:<SC icon="hardhat" label="On Hold" value={mp.filter(p=>p.status==="on_hold").length} accent="violet"/>}
      </div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-slate-800 text-base">Active Projects</h2><button onClick={()=>setView("projects")} className="text-orange-500 text-sm font-semibold">View all →</button></div>
        <div className="grid md:grid-cols-2 gap-4">
          {mp.filter(p=>p.status==="active").map(p=>(
            <button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:shadow-lg hover:border-orange-200 transition-all group">
              <div className="flex items-start justify-between mb-4"><div><h3 className="font-bold text-slate-800 text-sm group-hover:text-orange-600">{p.name}</h3><div className="flex items-center gap-1.5 text-slate-400 text-xs mt-1"><Ic n="map" s={12}/>{p.location}</div></div><Badge status={p.status}/></div>
              <div className="mb-2 flex justify-between text-xs text-slate-500"><span>Progress</span><span className="font-bold text-slate-700">{p.progress}%</span></div><PBar v={p.progress}/>
              <div className="mt-4 flex justify-between text-xs text-slate-400"><span>{p.client_name}</span><span>Due {fmtDate(p.expected_end_date)}</span></div>
            </button>
          ))}
        </div>
      </div>
      {ru.length>0&&<div><h2 className="font-bold text-slate-800 text-base mb-4">Recent Updates</h2><div className="space-y-3">{ru.map(u=><div key={u.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-4"><div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="hardhat" s={18} c="text-orange-500"/></div><div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 text-sm">Skyline Tower Phase II</div><p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{u.notes}</p><div className="flex gap-3 mt-2 text-xs text-slate-400"><span className="flex items-center gap-1"><Ic n="calendar" s={11}/>{fmtDate(u.update_date)}</span><span className="flex items-center gap-1"><Ic n="users" s={11}/>{u.workers_count}</span></div></div></div>)}</div></div>}
    </div>
  );
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────
function ProjectsView({user,projects,setView,setSP}){
  const[q,setQ]=useState("");const[sf,setSF]=useState("all");const[showFilt,setShowFilt]=useState(false);
  const[minP,setMinP]=useState(0);const[sortBy,setSortBy]=useState("name");
  const fl=useMemo(()=>projects.filter(p=>user.role==="client"?p.client_email===user.email:true).filter(p=>sf==="all"||p.status===sf).filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.location.toLowerCase().includes(q.toLowerCase())||p.client_name.toLowerCase().includes(q.toLowerCase())).filter(p=>p.progress>=minP).sort((a,b)=>sortBy==="progress"?b.progress-a.progress:sortBy==="budget"?b.budget-a.budget:a.name.localeCompare(b.name)),[projects,user,q,sf,minP,sortBy]);
  return(
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-black text-slate-800">Projects</h1><p className="text-slate-500 text-sm mt-1">{fl.length} found</p></div>{can(user,"createProject")&&<button onClick={()=>setView("create")} className="flex items-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>New</button>}</div>
      <div className="flex gap-2 mb-3 flex-wrap"><div className="relative flex-1 min-w-48"><Ic n="search" s={16} c="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><button onClick={()=>setShowFilt(p=>!p)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${showFilt?"bg-orange-500 text-white border-orange-500":"bg-white text-slate-600 border-slate-200"}`}><Ic n="sliders" s={15}/>Filters</button></div>
      <div className="flex gap-2 mb-4 flex-wrap">{["all","active","completed","on_hold"].map(s=><button key={s} onClick={()=>setSF(s)} className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${sf===s?"bg-slate-800 text-white border-slate-800":"bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>{s==="all"?"All":s.replace("_"," ")}</button>)}</div>
      {showFilt&&<div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 grid sm:grid-cols-3 gap-4"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 block">Min Progress %</label><div className="flex items-center gap-2"><input type="range" min="0" max="100" value={minP} onChange={e=>setMinP(+e.target.value)} className="flex-1 accent-orange-500"/><span className="text-xs font-bold text-slate-600 w-8">{minP}%</span></div></div><div className="sm:col-span-2"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 block">Sort By</label><select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="name">Name (A-Z)</option><option value="progress">Progress (High-Low)</option><option value="budget">Budget (High-Low)</option></select></div></div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{fl.map(p=><button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="bg-white rounded-2xl border border-slate-200 p-6 text-left hover:shadow-lg hover:border-orange-200 transition-all group"><h3 className="font-bold text-slate-800 text-sm group-hover:text-orange-600 line-clamp-2 mb-2">{p.name}</h3><Badge status={p.status}/><div className="mt-3 space-y-1.5"><div className="flex items-center gap-2 text-xs text-slate-400"><Ic n="map" s={12}/><span className="truncate">{p.location}</span></div><div className="flex items-center gap-2 text-xs text-slate-400"><Ic n="users" s={12}/>{p.client_name}</div></div>{p.status!=="completed"&&<div className="mt-4"><div className="flex justify-between text-xs text-slate-500 mb-1.5"><span>Progress</span><span className="font-bold text-slate-700">{p.progress}%</span></div><PBar v={p.progress} col={p.status==="on_hold"?"violet":"orange"}/></div>}</button>)}{fl.length===0&&<div className="col-span-3 text-center py-20 text-slate-400"><Ic n="search" s={32} c="mx-auto mb-3 opacity-30"/><p>No projects match</p></div>}</div>
    </div>
  );
}

// ── PROJECT DETAIL ────────────────────────────────────────────────────────────
function DetailView({pid,user,setView,projects,setProjects,milestones,setMilestones,updates,setUpdates,expenses,setExpenses,teams,setTeams,attendance,setAttendance,issues,setIssues,materials,setMaterials,drawings,setDrawings,addActivity}){
  const proj=projects.find(p=>p.id===pid);
  const ms=milestones[pid]||[], us=updates[pid]||[], ex=expenses[pid]||[];
  const tm=teams[pid]||[], att=attendance[pid]||{};
  const iss=issues[pid]||[], mats=materials[pid]||[], drws=drawings[pid]||[];
  const[tab,setTab]=useState("overview");
  const[showUpd,setShowUpd]=useState(false);const[nu,setNu]=useState({notes:"",weather:"",workers:""});const[nph,setNph]=useState([]);
  const[showEx,setShowEx]=useState(false);const[ne,setNe]=useState({date:"",cat:"Materials",desc:"",amt:""});
  const[showMember,setShowMember]=useState(false);const[nm,setNm]=useState({name:"",role:"Site Engineer",phone:""});
  const[lb,setLb]=useState(null);const[editProg,setEditProg]=useState(false);const[tp,setTp]=useState(0);
  const[shareModal,setShareModal]=useState(false);const[copied,setCopied]=useState(false);
  const[attDate,setAttDate]=useState(new Date().toISOString().split("T")[0]);
  const[showIssue,setShowIssue]=useState(false);const[ni,setNi]=useState({title:"",severity:"high",description:""});
  const[showMat,setShowMat]=useState(false);const[nmat,setNmat]=useState({date:"",material:"",quantity:"",supplier:"",status:"expected",notes:""});
  // Drawing release state
  const[showDrawing,setShowDrawing]=useState(false);const[ndraw,setNdraw]=useState({title:"",type:"Architectural",revision:"Rev A",notes:"",released_to:["pm"]});
  const fRef=useRef();
  if(!proj) return <div className="p-8 text-slate-500">Project not found.</div>;
  const totEx=ex.reduce((s,e)=>s+e.amount,0);const bpct=Math.round((totEx/proj.budget)*100)||0;
  const allPh=us.flatMap(u=>u.photos||[]);
  const todayAtt=att[attDate]||{};const attDates=Object.keys(att).sort().reverse();
  const openIss=iss.filter(i=>i.status==="open").length;const highIss=iss.filter(i=>i.severity==="high"&&i.status==="open").length;
  const myDrawings=user.role==="architect"?drws:drws.filter(d=>d.released_to.includes(user.role));
  const pendingMats=mats.filter(m=>m.status==="expected").length;
  const tabs=PERMS[user.role].tabs;
  const saveProg=()=>{setProjects(p=>p.map(x=>x.id===pid?{...x,progress:Math.min(100,Math.max(0,parseInt(tp)||0))}:x));addActivity(pid,proj.name,"milestone","Updated project progress",`Progress set to ${tp}%`,user.name,user.role);setEditProg(false);};
  const cyclMs=mid=>{
    const cy={pending:"in_progress",in_progress:"completed",completed:"pending"};
    const m=ms.find(x=>x.id===mid);if(!m)return;
    const ns=cy[m.status];
    setMilestones(p=>({...p,[pid]:p[pid].map(x=>x.id===mid?{...x,status:ns,completed_date:ns==="completed"?new Date().toISOString().split("T")[0]:null}:x)}));
    addActivity(pid,proj.name,"milestone",`Milestone status changed`,`${m.title} → ${ns.replace("_"," ")}`,user.name,user.role);
  };
  const phUp=e=>Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>setNph(p=>[...p,{url:ev.target.result}]);r.readAsDataURL(f);});
  const addUpd=()=>{
    if(!nu.notes.trim())return;
    setUpdates(p=>({...p,[pid]:[{id:"u_"+Date.now(),update_date:new Date().toISOString().split("T")[0],notes:nu.notes,weather:nu.weather||"—",workers_count:parseInt(nu.workers)||null,photos:nph},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"update","Added site update",nu.notes.slice(0,80)+(nu.notes.length>80?"…":""),user.name,user.role);
    setNu({notes:"",weather:"",workers:""});setNph([]);setShowUpd(false);
  };
  const addEx=()=>{
    if(!ne.desc.trim()||!ne.amt)return;
    setExpenses(p=>({...p,[pid]:[{id:"ex_"+Date.now(),date:ne.date||new Date().toISOString().split("T")[0],category:ne.cat,description:ne.desc,amount:parseFloat(ne.amt)},...(p[pid]||[])]}));
    setNe({date:"",cat:"Materials",desc:"",amt:""});setShowEx(false);
  };
  const delEx=id=>setExpenses(p=>({...p,[pid]:p[pid].filter(e=>e.id!==id)}));
  const addMember=()=>{
    if(!nm.name.trim())return;
    setTeams(p=>({...p,[pid]:[...(p[pid]||[]),{id:"t_"+Date.now(),...nm,status:"active"}]}));
    setNm({name:"",role:"Site Engineer",phone:""});setShowMember(false);
  };
  const setAtt=(mid,st)=>setAttendance(p=>({...p,[pid]:{...(p[pid]||{}),[attDate]:{...(p[pid]?.[attDate]||{}),[mid]:st}}}));
  const addIssue=()=>{
    if(!ni.title.trim())return;
    setIssues(p=>({...p,[pid]:[{id:"i_"+Date.now(),...ni,status:"open",reported_date:new Date().toISOString().split("T")[0],reported_by:user.name},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"issue",`Reported ${ni.severity.toUpperCase()} issue`,ni.title,user.name,user.role);
    setNi({title:"",severity:"high",description:""});setShowIssue(false);
  };
  const resolveIssue=id=>{
    const iss_item=iss.find(i=>i.id===id);
    setIssues(p=>({...p,[pid]:p[pid].map(i=>i.id===id?{...i,status:"resolved",resolved_date:new Date().toISOString().split("T")[0]}:i)}));
    if(iss_item) addActivity(pid,proj.name,"issue","Resolved issue",iss_item.title,user.name,user.role);
  };
  const addMat=()=>{
    if(!nmat.material.trim())return;
    setMaterials(p=>({...p,[pid]:[{id:"mat_"+Date.now(),...nmat,date:nmat.date||new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"material","Logged material delivery",`${nmat.material} — ${nmat.quantity}`,user.name,user.role);
    setNmat({date:"",material:"",quantity:"",supplier:"",status:"expected",notes:""});setShowMat(false);
  };
  const markMatReceived=id=>{
    const mat=mats.find(m=>m.id===id);
    setMaterials(p=>({...p,[pid]:p[pid].map(x=>x.id===id?{...x,status:"received"}:x)}));
    if(mat) addActivity(pid,proj.name,"material","Marked material received",`${mat.material} — ${mat.quantity}`,user.name,user.role);
  };
  // Drawing release
  const addDrawing=()=>{
    if(!ndraw.title.trim())return;
    const d={id:"d_"+Date.now(),...ndraw,date:new Date().toISOString().split("T")[0],status:"current"};
    setDrawings(p=>({...p,[pid]:[...(p[pid]||[]),d]}));
    addActivity(pid,proj.name,"drawing",`Released drawing to ${ndraw.released_to.map(r=>r==="pm"?"PM":"Client").join(" & ")}`,`${ndraw.title} (${ndraw.revision})`,user.name,user.role);
    setNdraw({title:"",type:"Architectural",revision:"Rev A",notes:"",released_to:["pm"]});setShowDrawing(false);
  };
  const toggleRelease=(id,role)=>{
    setDrawings(p=>({...p,[pid]:p[pid].map(d=>d.id===id?{...d,released_to:d.released_to.includes(role)?d.released_to.filter(r=>r!==role):[...d.released_to,role]}:d)}));
  };
  const shareUrl=`${window.location.href.split("?")[0]}?share=${pid}`;
  const copyLink=()=>{navigator.clipboard.writeText(shareUrl).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const catTot=EXPENSE_CATS.map(c=>({c,t:ex.filter(e=>e.category===c).reduce((s,e)=>s+e.amount,0)})).filter(x=>x.t>0);
  return(
    <div className="p-4 md:p-8">
      {lb&&<div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={()=>setLb(null)}><button className="absolute top-4 right-4 text-white/60 hover:text-white"><Ic n="x" s={28}/></button><img src={lb} className="max-w-full max-h-[90vh] rounded-xl object-contain" alt="site"/></div>}
      {shareModal&&<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setShareModal(false);}}><div className="bg-white rounded-2xl p-7 max-w-md w-full shadow-2xl"><div className="flex justify-between mb-5"><h3 className="font-black text-slate-800">Share with Client</h3><button onClick={()=>setShareModal(false)}><Ic n="x" s={20} c="text-slate-400"/></button></div><div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-5"><p className="text-orange-800 text-sm">🔗 Client login లేకుండా project progress చూడగలరు</p></div><div className="flex gap-2"><input value={shareUrl} readOnly className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none"/><button onClick={copyLink} className={`px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${copied?"bg-emerald-500 text-white":"bg-orange-500 hover:bg-orange-400 text-white"}`}><Ic n="copy" s={15}/>{copied?"✓":"Copy"}</button></div></div></div>}

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <button onClick={()=>setView("projects")} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium"><Ic n="arrow" s={16}/>Back</button>
        <div className="flex gap-2 flex-wrap">
          {can(user,"export")&&<><button onClick={()=>exportPDF(proj,ms,us,ex,iss)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs"><Ic n="download" s={14}/>PDF</button><button onClick={()=>exportCSV(proj,ex)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs"><Ic n="download" s={14}/>CSV</button></>}
          {can(user,"share")&&<button onClick={()=>setShareModal(true)} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs"><Ic n="share" s={14}/>Share</button>}
        </div>
      </div>

      {/* Project card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-7 mb-5">
        <div className="flex items-start justify-between mb-5 gap-4">
          <div><h1 className="text-xl font-black text-slate-800 mb-2">{proj.name}</h1><p className="text-slate-500 text-sm mb-3">{proj.description}</p><div className="flex flex-wrap gap-3 text-sm text-slate-400"><span className="flex items-center gap-2"><Ic n="map" s={14}/>{proj.location}</span><span className="flex items-center gap-2"><Ic n="calendar" s={14}/>{fmtDate(proj.start_date)}</span></div></div>
          <Badge status={proj.status}/>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-5 border-t border-slate-100 text-xs">
          <div><div className="font-semibold uppercase tracking-widest text-slate-400 mb-1">Client</div><div className="font-semibold text-slate-700">{proj.client_name}</div></div>
          {user.role!=="client"&&<div><div className="font-semibold uppercase tracking-widest text-slate-400 mb-1">Budget</div><div className="font-semibold text-slate-700">{fmtCur(proj.budget)}</div></div>}
          <div><div className="font-semibold uppercase tracking-widest text-slate-400 mb-1">Deadline</div><div className="font-semibold text-slate-700">{fmtDate(proj.expected_end_date)}</div></div>
        </div>
        {/* Progress */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold text-slate-600">Progress</span>
            {editProg
              ?<div className="flex items-center gap-2"><input type="number" min="0" max="100" value={tp} onChange={e=>setTp(e.target.value)} className="w-14 p-1 border border-orange-300 rounded-lg text-sm text-center outline-none font-bold"/><span className="text-slate-400 text-xs">%</span><button onClick={saveProg} className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-lg">Save</button><button onClick={()=>setEditProg(false)} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg">Cancel</button></div>
              :<div className="flex items-center gap-2"><span className="font-black text-slate-800">{proj.progress}%</span>{can(user,"editProgress")&&<button onClick={()=>{setTp(proj.progress);setEditProg(true);}} className="text-xs text-orange-500 font-semibold flex items-center gap-1"><Ic n="pencil" s={11}/>Edit</button>}</div>}
          </div>
          {editProg?<input type="range" min="0" max="100" value={tp} onChange={e=>setTp(e.target.value)} className="w-full accent-orange-500 cursor-pointer"/>:<PBar v={proj.progress}/>}
          <div className="text-xs text-slate-400 mt-1">{ms.filter(m=>m.status==="completed").length}/{ms.length} milestones · {openIss} issues{highIss>0&&<span className="text-red-500 font-semibold"> ({highIss} high)</span>} · {myDrawings.length} drawings</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold capitalize transition-all whitespace-nowrap flex items-center gap-1 ${tab===t?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
            {t}
            {t==="issues"&&openIss>0&&<span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${highIss>0?"bg-red-500 text-white":"bg-amber-400 text-white"}`}>{openIss}</span>}
            {t==="materials"&&pendingMats>0&&<span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-500 text-white">{pendingMats}</span>}
            {t==="drawings"&&<span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">{myDrawings.length}</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab==="overview"&&(
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="flag" s={16} c="text-orange-500"/>Next Milestone</h3>{(()=>{const nx=ms.find(m=>m.status!=="completed");return nx?<div><div className="font-semibold text-slate-700 mb-1">{nx.title}</div><div className="text-xs text-slate-400">Due {fmtDate(nx.due_date)}</div><div className="mt-2"><Badge status={nx.status}/></div></div>:<div className="text-slate-400 text-sm">All milestones done 🎉</div>;})()}</div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="hardhat" s={16} c="text-orange-500"/>Last Update</h3>{us[0]?<div><div className="text-xs text-slate-400 mb-1">{fmtDate(us[0].update_date)}</div><p className="text-slate-600 text-sm line-clamp-3">{us[0].notes}</p>{us[0].photos?.length>0&&<div className="flex gap-2 mt-2">{us[0].photos.slice(0,3).map((ph,i)=><img key={i} src={ph.url} onClick={()=>setLb(ph.url)} className="w-12 h-12 rounded-lg object-cover cursor-pointer hover:opacity-80" alt=""/>)}</div>}</div>:<div className="text-slate-400 text-sm">No updates yet</div>}</div>
          {user.role!=="client"&&<>
            <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="alert" s={16} c="text-orange-500"/>Issues Summary</h3><div className="grid grid-cols-3 gap-2 mb-3">{[["Open",openIss,"text-slate-700"],["High",highIss,"text-red-600"],["Fixed",iss.filter(i=>i.status==="resolved").length,"text-emerald-600"]].map(([l,v,t])=><div key={l} className="text-center"><div className={`text-xl font-black ${t}`}>{v}</div><div className="text-xs text-slate-400">{l}</div></div>)}</div>{iss.filter(i=>i.status==="open"&&i.severity==="high").slice(0,2).map(i=><div key={i.id} className="flex items-center gap-2 py-1.5 border-t border-slate-100 first:border-0"><span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span><span className="text-xs text-slate-600 truncate">{i.title}</span></div>)}</div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="wallet" s={16} c="text-orange-500"/>Budget</h3><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">Spent</span><span className="font-bold">{fmtCur(totEx)}</span></div><PBar v={bpct} col={bpct>90?"red":bpct>70?"orange":"emerald"}/><div className="text-xs text-slate-400 mt-1">{bpct}% used · Remaining: <span className="font-semibold text-slate-700">{fmtCur(proj.budget-totEx)}</span></div></div>
          </>}
          {allPh.length>0&&<div className="bg-white rounded-2xl border border-slate-200 p-6 md:col-span-2"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="image" s={16} c="text-orange-500"/>Recent Photos</h3><div className="grid grid-cols-4 md:grid-cols-6 gap-2">{allPh.slice(0,6).map((ph,i)=><img key={i} src={ph.url} onClick={()=>setLb(ph.url)} className="w-full aspect-square rounded-lg object-cover cursor-pointer hover:opacity-80 hover:scale-105 transition-all" alt=""/>)}</div></div>}
        </div>
      )}

      {/* ── MILESTONES ── */}
      {tab==="milestones"&&(
        <div className="space-y-3">
          {can(user,"changeMilestone")&&<p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-3 py-2 rounded-xl w-fit"><Ic n="pencil" s={12} c="text-orange-400"/>Badge click → status change</p>}
          {ms.map((m,i)=>(
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${m.status==="completed"?"bg-emerald-500 border-emerald-500":m.status==="in_progress"?"bg-orange-500 border-orange-500":"bg-white border-slate-200"}`}>{m.status==="completed"?<Ic n="check" s={14} c="text-white"/>:<span className="text-xs font-bold text-slate-400">{i+1}</span>}</div>
              <div className="flex-1"><div className="font-semibold text-slate-800 text-sm">{m.title}</div><div className="text-xs text-slate-400 mt-0.5">Due {fmtDate(m.due_date)}{m.completed_date?` · Done ${fmtDate(m.completed_date)}`:""}</div></div>
              {can(user,"changeMilestone")?<button onClick={()=>cyclMs(m.id)} className="hover:scale-105 transition-transform active:scale-95"><Badge status={m.status}/></button>:<Badge status={m.status}/>}
            </div>
          ))}
          {ms.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="flag" s={32} c="mx-auto mb-3 opacity-30"/><p>No milestones added</p></div>}
        </div>
      )}

      {/* ── UPDATES ── */}
      {tab==="updates"&&(
        <div>
          {can(user,"addUpdate")?<div className="mb-5">{!showUpd?<button onClick={()=>setShowUpd(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Add Update</button>:(
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
              <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Site Update</h3><button onClick={()=>{setShowUpd(false);setNph([]);}}><Ic n="x" s={18} c="text-slate-400"/></button></div>
              <div className="space-y-3">
                <textarea value={nu.notes} onChange={e=>setNu(p=>({...p,notes:e.target.value}))} placeholder="Today's site activities..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
                <div className="grid grid-cols-2 gap-3"><input value={nu.weather} onChange={e=>setNu(p=>({...p,weather:e.target.value}))} placeholder="Weather (e.g. Sunny 34°C)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={nu.workers} onChange={e=>setNu(p=>({...p,workers:e.target.value}))} placeholder="Workers on site" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
                <input ref={fRef} type="file" accept="image/*" multiple onChange={phUp} className="hidden"/>
                <button onClick={()=>fRef.current.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 hover:border-orange-300 rounded-xl text-sm text-slate-500 hover:text-orange-500 w-full justify-center"><Ic n="camera" s={16}/>Add Photos {nph.length>0&&`(${nph.length})`}</button>
                {nph.length>0&&<div className="flex gap-2 flex-wrap">{nph.map((ph,i)=><div key={i} className="relative"><img src={ph.url} className="w-16 h-16 rounded-xl object-cover" alt=""/><button onClick={()=>setNph(p=>p.filter((_,j)=>j!==i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"><Ic n="x" s={10}/></button></div>)}</div>}
                <button onClick={addUpd} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Post Update</button>
              </div>
            </div>
          )}</div>:<div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 text-xs text-slate-500"><Ic n="lock" s={14}/>Client role — view only</div>}
          <div className="space-y-4">
            {us.map(u=>(
              <div key={u.id} className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-3"><div className="font-bold text-slate-700 text-sm">{new Date(u.update_date).toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>{u.weather&&<span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full">{u.weather}</span>}</div>
                <p className="text-slate-600 text-sm mb-3">{u.notes}</p>
                {u.workers_count&&<div className="flex items-center gap-2 text-xs text-slate-400 mb-3"><Ic n="users" s={13}/><strong className="text-slate-700">{u.workers_count}</strong> workers on site</div>}
                {u.photos?.length>0&&<div><div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Ic n="camera" s={12}/>{u.photos.length} Photos</div><div className="flex gap-2 flex-wrap">{u.photos.map((ph,i)=><img key={i} src={ph.url} onClick={()=>setLb(ph.url)} className="w-20 h-20 rounded-xl object-cover cursor-pointer hover:opacity-80 hover:scale-105 transition-all" alt=""/>)}</div></div>}
              </div>
            ))}
            {us.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="hardhat" s={32} c="mx-auto mb-3 opacity-30"/><p>No updates yet</p></div>}
          </div>
        </div>
      )}

      {/* ── ISSUES ── */}
      {tab==="issues"&&(
        <div>
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Issues & Punch List</h2><p className="text-xs text-slate-400 mt-0.5">{openIss} open · {iss.filter(i=>i.status==="resolved").length} resolved</p></div>{can(user,"addIssue")&&<button onClick={()=>setShowIssue(true)} className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Report Issue</button>}</div>
          {showIssue&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Report Issue</h3><button onClick={()=>setShowIssue(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="space-y-3"><input value={ni.title} onChange={e=>setNi(p=>({...p,title:e.target.value}))} placeholder="Issue title..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-2">{["high","medium","low"].map(s=>{const sc=SEV_COLOR[s];return<button key={s} onClick={()=>setNi(p=>({...p,severity:s}))} className={`p-2.5 rounded-xl text-xs font-bold border-2 capitalize transition-all ${ni.severity===s?`${sc.bg} ${sc.text} ${sc.border}`:"border-slate-200 text-slate-500"}`}>{s}</button>;})}</div><textarea value={ni.description} onChange={e=>setNi(p=>({...p,description:e.target.value}))} placeholder="Describe the issue..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/><button onClick={addIssue} className="px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm">Report</button></div></div>}
          <div className="space-y-3">{iss.map(i=>{const sc=SEV_COLOR[i.severity];return(
            <div key={i.id} className={`bg-white rounded-2xl border p-5 ${i.status==="resolved"?"border-slate-100 opacity-70":"border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>{i.severity}</span>{i.status==="resolved"&&<span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Resolved</span>}</div><div className="font-semibold text-slate-800 text-sm">{i.title}</div><div className="text-xs text-slate-400 mt-0.5">By {i.reported_by} · {fmtDate(i.reported_date)}{i.resolved_date&&` · Fixed ${fmtDate(i.resolved_date)}`}</div></div>
                {i.status==="open"&&can(user,"resolveIssue")&&<button onClick={()=>resolveIssue(i.id)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition-all flex-shrink-0"><Ic n="check" s={12}/>Resolve</button>}
              </div>
              {i.description&&<p className="text-slate-500 text-sm">{i.description}</p>}
            </div>
          );})}{iss.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="alert" s={32} c="mx-auto mb-3 opacity-30"/><p>No issues reported</p></div>}</div>
        </div>
      )}

      {/* ── MATERIALS ── */}
      {tab==="materials"&&(
        <div>
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Material Deliveries</h2><p className="text-xs text-slate-400 mt-0.5">{mats.filter(m=>m.status==="received").length} received · {pendingMats} expected</p></div>{can(user,"addMaterial")&&<button onClick={()=>setShowMat(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Log Delivery</button>}</div>
          {showMat&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Delivery Log</h3><button onClick={()=>setShowMat(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Material</label><input value={nmat.material} onChange={e=>setNmat(p=>({...p,material:e.target.value}))} placeholder="TMT Steel - Fe500" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Quantity</label><input value={nmat.quantity} onChange={e=>setNmat(p=>({...p,quantity:e.target.value}))} placeholder="15 tons" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widests mb-1 block">Supplier</label><input value={nmat.supplier} onChange={e=>setNmat(p=>({...p,supplier:e.target.value}))} placeholder="Vizag Steel" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Status</label><select value={nmat.status} onChange={e=>setNmat(p=>({...p,status:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="expected">Expected</option><option value="received">Received</option><option value="rejected">Rejected</option></select></div></div><div className="mb-3"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label><input value={nmat.notes} onChange={e=>setNmat(p=>({...p,notes:e.target.value}))} placeholder="Inspection notes..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><button onClick={addMat} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Log</button></div>}
          <div className="space-y-3">{mats.map(m=>{const sc=MAT_STATUS[m.status]||MAT_STATUS.expected;return(
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="truck" s={18} c="text-blue-600"/></div>
              <div className="flex-1 min-w-0"><div className="flex items-start justify-between gap-2 mb-1"><div className="font-semibold text-slate-800 text-sm">{m.material}</div><span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${sc.bg} ${sc.text} ${sc.border}`}>{m.status}</span></div><div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-1"><span>{m.quantity}</span><span>{m.supplier}</span><span>{fmtDate(m.date)}</span></div>{m.notes&&<p className="text-xs text-slate-500">{m.notes}</p>}</div>
              {can(user,"addMaterial")&&m.status==="expected"&&<button onClick={()=>markMatReceived(m.id)} className="text-xs font-bold px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 flex-shrink-0"><Ic n="check" s={11} c="inline mr-1"/>Received</button>}
            </div>
          );})}
          {mats.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="truck" s={32} c="mx-auto mb-3 opacity-30"/><p>No deliveries logged</p></div>}
          </div>
        </div>
      )}

      {/* ── DRAWINGS (NEW MAJOR FEATURE) ── */}
      {tab==="drawings"&&(
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-slate-800">Drawing Releases</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {user.role==="architect"?"Architect controls who sees each drawing":"Drawings released to you by Architect"}
              </p>
            </div>
            {can(user,"manageDrawings")&&<button onClick={()=>setShowDrawing(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Release Drawing</button>}
          </div>

          {/* Architect: release form */}
          {showDrawing&&can(user,"manageDrawings")&&(
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
              <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Release Drawing / Document</h3><button onClick={()=>setShowDrawing(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Drawing Title</label><input value={ndraw.title} onChange={e=>setNdraw(p=>({...p,title:e.target.value}))} placeholder="Foundation Layout - Rev A" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
                <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Type</label><select value={ndraw.type} onChange={e=>setNdraw(p=>({...p,type:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{DRAW_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Revision</label><input value={ndraw.revision} onChange={e=>setNdraw(p=>({...p,revision:e.target.value}))} placeholder="Rev A" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 block">Release To — Select who can see this drawing</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{role:"pm",label:"Project Manager",sub:"Site team access",col:"blue"},{role:"client",label:"Client",sub:"Client portal access",col:"emerald"}].map(r=>(
                    <button key={r.role} onClick={()=>setNdraw(p=>({...p,released_to:p.released_to.includes(r.role)?p.released_to.filter(x=>x!==r.role):[...p.released_to,r.role]}))} className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${ndraw.released_to.includes(r.role)?"border-orange-500 bg-orange-50":"border-slate-200 hover:border-slate-300"}`}>
                      <Av i={r.role==="pm"?"PS":"VN"} sz="sm" col={r.col}/>
                      <div><div className="font-semibold text-slate-800 text-sm">{r.label}</div><div className="text-xs text-slate-400">{r.sub}</div></div>
                      {ndraw.released_to.includes(r.role)&&<div className="ml-auto w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center"><Ic n="check" s={12} c="text-white"/></div>}
                    </button>
                  ))}
                </div>
                {ndraw.released_to.length===0&&<p className="text-xs text-red-500 mt-2">⚠️ Select at least one recipient</p>}
              </div>
              <div className="mb-4"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label><input value={ndraw.notes} onChange={e=>setNdraw(p=>({...p,notes:e.target.value}))} placeholder="For contractor use only, approved for construction..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
              <button onClick={addDrawing} disabled={ndraw.released_to.length===0||!ndraw.title.trim()} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm flex items-center gap-2"><Ic n="send" s={15}/>Release Drawing</button>
            </div>
          )}

          {/* Drawing list */}
          {myDrawings.length===0
            ?<div className="text-center py-16 text-slate-400"><Ic n="doc" s={32} c="mx-auto mb-3 opacity-30"/><p>{user.role==="architect"?"No drawings released yet — click 'Release Drawing' to start":"No drawings have been released to you yet"}</p></div>
            :<div className="space-y-3">
              {myDrawings.map(d=>(
                <div key={d.id} className={`bg-white rounded-2xl border p-5 ${d.status==="superseded"?"border-slate-100 opacity-60":"border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="doc" s={18} c="text-orange-500"/></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <div className="font-bold text-slate-800 text-sm">{d.title}</div>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{d.revision}</span>
                          <Badge status={d.status}/>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-2">
                          <span className="font-semibold text-orange-600">{d.type}</span>
                          <span>Released {fmtDate(d.date)}</span>
                        </div>
                        {d.notes&&<p className="text-xs text-slate-500 mb-2">{d.notes}</p>}
                        {/* Who it's released to */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-400 font-semibold">Released to:</span>
                          {user.role==="architect"
                            ?[{role:"pm",label:"PM",col:"blue"},{role:"client",label:"Client",col:"emerald"}].map(r=>(
                              <button key={r.role} onClick={()=>toggleRelease(d.id,r.role)} className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${d.released_to.includes(r.role)?`bg-${r.col}-50 text-${r.col}-700 border-${r.col}-200`:"bg-slate-50 text-slate-400 border-slate-200 line-through"}`}>
                                {r.label} {d.released_to.includes(r.role)?"✓":"✗"}
                              </button>
                            ))
                            :<span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200">You</span>
                          }
                        </div>
                      </div>
                    </div>
                    {user.role==="architect"&&(
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={()=>setDrawings(p=>({...p,[pid]:p[pid].map(x=>x.id===d.id?{...x,status:x.status==="current"?"superseded":"current"}:x)}))} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all">{d.status==="current"?"Supersede":"Reinstate"}</button>
                        <button onClick={()=>setDrawings(p=>({...p,[pid]:p[pid].filter(x=>x.id!==d.id)}))} className="text-slate-300 hover:text-red-400 transition-colors p-1"><Ic n="trash" s={15}/></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          }

          {/* Architect summary */}
          {user.role==="architect"&&drws.length>0&&(
            <div className="mt-5 bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2"><Ic n="shield" s={14} c="text-orange-500"/>Release Summary</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[["Total",drws.length,"text-slate-700"],["To PM",drws.filter(d=>d.released_to.includes("pm")).length,"text-blue-600"],["To Client",drws.filter(d=>d.released_to.includes("client")).length,"text-emerald-600"]].map(([l,v,t])=><div key={l}><div className={`text-2xl font-black ${t}`}>{v}</div><div className="text-xs text-slate-400 mt-0.5">{l}</div></div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TEAM ── */}
      {tab==="team"&&(
        <div>
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Team Members</h2><p className="text-xs text-slate-400 mt-0.5">{tm.filter(m=>m.status==="active").length} active · {tm.filter(m=>m.status==="on_leave").length} on leave</p></div>{can(user,"manageTeam")&&<button onClick={()=>setShowMember(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Add Member</button>}</div>
          {showMember&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Add Team Member</h3><button onClick={()=>setShowMember(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-3 gap-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Name</label><input value={nm.name} onChange={e=>setNm(p=>({...p,name:e.target.value}))} placeholder="Ravi Kumar" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Role</label><select value={nm.role} onChange={e=>setNm(p=>({...p,role:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{ROLES_LIST.map(r=><option key={r}>{r}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Phone</label><input value={nm.phone} onChange={e=>setNm(p=>({...p,phone:e.target.value}))} placeholder="98765 43210" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><button onClick={addMember} className="mt-4 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add</button></div>}
          <div className="grid md:grid-cols-2 gap-3">{tm.map(m=>(
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold flex-shrink-0">{m.name[0]}</div>
              <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 text-sm">{m.name}</div><div className="text-xs text-slate-400">{m.role}</div>{m.phone&&<div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Ic n="phone" s={10}/>{m.phone}</div>}</div>
              {can(user,"manageTeam")&&<div className="flex items-center gap-2"><button onClick={()=>setTeams(p=>({...p,[pid]:p[pid].map(x=>x.id===m.id?{...x,status:x.status==="active"?"on_leave":"active"}:x)}))} className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${m.status==="active"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200"}`}>{m.status==="active"?"Active":"On Leave"}</button><button onClick={()=>setTeams(p=>({...p,[pid]:p[pid].filter(x=>x.id!==m.id)}))} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={15}/></button></div>}
            </div>
          ))}{tm.length===0&&<div className="col-span-2 text-center py-16 text-slate-400"><Ic n="users" s={32} c="mx-auto mb-3 opacity-30"/><p>No team members</p></div>}</div>
        </div>
      )}

      {/* ── ATTENDANCE ── */}
      {tab==="attendance"&&(can(user,"markAttendance")?<div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
          <div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-slate-800">Daily Attendance</h2></div><input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)} className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
          <div className="flex gap-3 mb-5">{[["Present",Object.values(todayAtt).filter(s=>s==="present").length,"bg-emerald-50 border-emerald-100 text-emerald-700"],["Half Day",Object.values(todayAtt).filter(s=>s==="half_day").length,"bg-amber-50 border-amber-100 text-amber-700"],["Absent",tm.length-Object.values(todayAtt).filter(s=>s==="present"||s==="half_day").length,"bg-red-50 border-red-100 text-red-600"]].map(([l,v,cls])=><div key={l} className={`border rounded-xl p-3 flex-1 text-center ${cls}`}><div className="text-xl font-black">{v}</div><div className="text-xs font-semibold">{l}</div></div>)}</div>
          {tm.length===0?<div className="text-center py-8 text-slate-400 text-sm">Team tab లో members add చేయండి</div>:<div className="space-y-2">{tm.map(m=>{const cur=todayAtt[m.id]||"absent";return(<div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{m.name[0]}</div><div className="flex-1"><div className="font-semibold text-slate-800 text-sm">{m.name}</div><div className="text-xs text-slate-400">{m.role}</div></div><div className="flex gap-1">{["present","half_day","absent"].map(st=>{const a=ATT_STATUS[st];return<button key={st} onClick={()=>setAtt(m.id,st)} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${cur===st?`${a.bg} ${a.text} border-transparent shadow-sm`:"bg-white text-slate-400 border-slate-200"}`}>{a.label}</button>;})}</div></div>);})} </div>}
        </div>
        {attDates.length>0&&<div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="p-5 border-b border-slate-100"><h3 className="font-bold text-slate-800 text-sm">History</h3></div><div className="divide-y divide-slate-50">{attDates.slice(0,7).map(d=>{const da=att[d]||{};const p=Object.values(da).filter(s=>s==="present").length;const h=Object.values(da).filter(s=>s==="half_day").length;return(<div key={d} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50"><div className="text-sm font-semibold text-slate-700 w-32">{fmtDate(d)}</div><div className="flex gap-3 text-xs flex-1"><span className="text-emerald-600 font-bold">{p} present</span><span className="text-amber-600 font-bold">{h} half</span><span className="text-red-500 font-bold">{tm.length-p-h} absent</span></div><div className="w-24"><PBar v={tm.length>0?Math.round(((p+h*0.5)/tm.length)*100):0} col="emerald"/></div></div>);})} </div></div>}
      </div>:<AccessDenied/>)}

      {/* ── BUDGET ── */}
      {tab==="budget"&&(user.role!=="client"?<div>
        <div className="grid grid-cols-3 gap-4 mb-5"><SC icon="wallet" label="Budget" value={fmtCur(proj.budget)} accent="blue"/><SC icon="trend" label="Spent" value={fmtCur(totEx)} accent={bpct>90?"red":"orange"}/><SC icon="check" label="Remaining" value={fmtCur(proj.budget-totEx)} accent={proj.budget-totEx<0?"red":"emerald"}/></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between text-sm mb-2"><span className="font-semibold text-slate-600">Budget Used</span><span className="font-black text-slate-800">{bpct}%</span></div><PBar v={bpct} col={bpct>90?"red":bpct>70?"orange":"emerald"}/>{bpct>90&&<p className="text-xs text-red-500 mt-2 font-semibold">⚠️ Budget nearly exhausted!</p>}{catTot.length>0&&<div className="mt-5 pt-4 border-t border-slate-100"><div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">By Category</div><div className="grid grid-cols-2 gap-2">{catTot.map(({c,t})=><div key={c} className="flex justify-between items-center py-1"><span className={`text-xs font-bold px-2 py-0.5 rounded-md ${CAT_COLORS[c]||"bg-slate-100 text-slate-500"}`}>{c}</span><span className="text-xs font-bold text-slate-700">{fmtCur(t)}</span></div>)}</div></div>}</div>
        {can(user,"addExpense")&&<div className="mb-4">{!showEx?<button onClick={()=>setShowEx(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Add Expense</button>:<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Expense</h3><button onClick={()=>setShowEx(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Category</label><select value={ne.cat} onChange={e=>setNe(p=>({...p,cat:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Date</label><input type="date" value={ne.date} onChange={e=>setNe(p=>({...p,date:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Description</label><input value={ne.desc} onChange={e=>setNe(p=>({...p,desc:e.target.value}))} placeholder="Cement - 200 bags" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Amount (₹)</label><input type="number" value={ne.amt} onChange={e=>setNe(p=>({...p,amt:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><button onClick={addEx} className="mt-4 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Expense</button></div>}</div>}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="p-5 border-b border-slate-100"><h3 className="font-bold text-slate-800 text-sm">Expense Log</h3></div>{ex.length===0?<div className="text-center py-12 text-slate-400 text-sm">No expenses recorded</div>:<div className="divide-y divide-slate-50">{ex.map(e=><div key={e.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50"><span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${CAT_COLORS[e.category]||"bg-slate-100 text-slate-500"}`}>{e.category}</span><div className="flex-1 min-w-0"><div className="font-semibold text-slate-700 text-sm truncate">{e.description}</div><div className="text-xs text-slate-400">{fmtDate(e.date)}</div></div><div className="font-bold text-slate-800 text-sm">{fmtCur(e.amount)}</div>{can(user,"deleteExpense")&&<button onClick={()=>delEx(e.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={15}/></button>}</div>)}</div>}</div>
      </div>:<AccessDenied msg="Budget information is not available in client view."/>)}

      {/* ── GANTT ── */}
      {tab==="gantt"&&<GanttView project={proj} milestones={ms}/>}
    </div>
  );
}

// ── OTHER VIEWS ───────────────────────────────────────────────────────────────
function CreateView({user,setView,setProjects}){
  if(!can(user,"createProject")) return <div className="p-8"><AccessDenied msg="Only Architects can create new projects."/></div>;
  const[f,setF]=useState({name:"",cn:"",ce:"",loc:"",sd:"",ed:"",budget:"",desc:""});const[done,setDone]=useState(false);const[err,setErr]=useState({});
  const val=()=>{const e={};if(!f.name.trim())e.name="Required";if(!f.cn.trim())e.cn="Required";if(!f.loc.trim())e.loc="Required";if(!f.sd)e.sd="Required";return e;};
  const sub=()=>{const e=val();if(Object.keys(e).length){setErr(e);return;}setProjects(p=>[...p,{id:"p_"+Date.now(),name:f.name,client_name:f.cn,client_email:f.ce,location:f.loc,start_date:f.sd,expected_end_date:f.ed,budget:parseFloat(f.budget)||0,description:f.desc,status:"active",progress:0}]);setDone(true);setTimeout(()=>setView("projects"),1800);};
  if(done) return <div className="p-8 flex items-center justify-center min-h-96"><div className="text-center"><div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><Ic n="check" s={28} c="text-emerald-600"/></div><h2 className="text-xl font-black text-slate-800 mb-2">Project Created!</h2></div></div>;
  const inp=(key,lbl,type="text",ph="",fk)=>{const k=fk||key;return<div><label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">{lbl}</label><input type={type} value={f[k]} onChange={e=>{setF(p=>({...p,[k]:e.target.value}));setErr(p=>({...p,[key]:""}));}} placeholder={ph} className={`w-full p-3.5 border rounded-xl text-sm outline-none transition-all ${err[key]?"border-red-300 bg-red-50":"border-slate-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-50"}`}/>{err[key]&&<p className="text-red-500 text-xs mt-1">{err[key]}</p>}</div>;};
  return(<div className="p-4 md:p-8 max-w-2xl"><button onClick={()=>setView("projects")} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm mb-6"><Ic n="arrow" s={16}/>Back</button><h1 className="text-2xl font-black text-slate-800 mb-6">Create New Project</h1><div className="bg-white rounded-2xl border border-slate-200 p-7 space-y-5">{inp("name","Project Name","text","Skyline Tower Phase III")}<div className="grid grid-cols-2 gap-4">{inp("cn","Client Name","text","Nair Holdings","cn")}{inp("ce","Client Email","email","client@co.in","ce")}</div>{inp("loc","Location","text","Jubilee Hills, Hyderabad","loc")}<div className="grid grid-cols-2 gap-4">{inp("sd","Start Date","date","","sd")}{inp("ed","End Date","date","","ed")}</div>{inp("budget","Budget (₹)","number","45000000")}<div><label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">Description</label><textarea value={f.desc} onChange={e=>setF(p=>({...p,desc:e.target.value}))} className="w-full p-3.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/></div><button onClick={sub} className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all">Create Project →</button></div></div>);
}
function NotifsView({notifs,setNotifs}){const u=notifs.filter(n=>!n.read).length;return(<div className="p-4 md:p-8 max-w-2xl"><div className="flex items-start justify-between mb-8"><div><h1 className="text-2xl font-black text-slate-800">Site Updates</h1><p className="text-slate-500 text-sm mt-1">{u} unread</p></div>{u>0&&<button onClick={()=>setNotifs(p=>p.map(n=>({...n,read:true})))} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm"><Ic n="mailCheck" s={15}/>Mark all</button>}</div><div className="space-y-3">{notifs.map(n=><div key={n.id} className={`bg-white rounded-2xl border p-5 flex gap-4 ${n.read?"border-slate-100 opacity-70":"border-orange-100 shadow-sm"}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.read?"bg-slate-100":"bg-orange-50"}`}><Ic n="bell" s={18} c={n.read?"text-slate-400":"text-orange-500"}/></div><div className="flex-1"><div className="flex items-start justify-between gap-2"><div className="font-semibold text-slate-800 text-sm">{n.title}</div>{!n.read&&<button onClick={()=>setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x))} className="text-xs text-orange-500 font-semibold flex-shrink-0">Mark read</button>}</div><p className="text-slate-500 text-xs mt-1">{n.message}</p><p className="text-slate-400 text-xs mt-2">{fmtDate(n.created_at)}</p></div></div>)}</div></div>);}
function PMView({user,projects,setView,setSP,notifs}){const unread=notifs.filter(n=>!n.read);return(<div className="p-4 md:p-8"><div className="mb-6 flex items-start justify-between"><h1 className="text-2xl font-black text-slate-800">PM Dashboard</h1><div className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-blue-100 text-blue-700"><Ic n="shield" s={12}/>Project Manager</div></div><div className="grid grid-cols-3 gap-4 mb-8"><SC icon="building" label="Projects" value={projects.length} accent="blue"/><SC icon="trend" label="Active" value={projects.filter(p=>p.status==="active").length} accent="orange"/><SC icon="bell" label="Unread" value={unread.length} accent="violet"/></div>{unread.length>0&&<div className="mb-8"><h2 className="font-bold text-slate-800 text-base mb-4">Notifications</h2><div className="space-y-3">{unread.map(n=><div key={n.id} className="bg-white rounded-2xl border border-orange-100 p-4 flex gap-3 shadow-sm"><div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="bell" s={16} c="text-orange-500"/></div><div><div className="font-semibold text-slate-800 text-sm">{n.title}</div><p className="text-slate-500 text-xs mt-0.5">{n.message}</p></div></div>)}</div></div>}<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{projects.map(p=><button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-orange-200 transition-all group"><div className="flex items-start justify-between mb-3"><h3 className="font-bold text-slate-800 text-sm group-hover:text-orange-600">{p.name}</h3><Badge status={p.status}/></div><div className="text-xs text-slate-400 mb-3 flex items-center gap-1.5"><Ic n="map" s={11}/>{p.location}</div><PBar v={p.progress}/><div className="text-xs text-slate-400 mt-1">{p.progress}%</div></button>)}</div></div>);}
function ClientPortal({user,projects,notifs,setView,setSP}){const mp=projects.filter(p=>p.client_email===user.email);const unread=notifs.filter(n=>!n.read);return(<div className="p-4 md:p-8"><div className="mb-6 flex items-start justify-between"><h1 className="text-2xl font-black text-slate-800">Client Portal</h1><div className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-emerald-100 text-emerald-700"><Ic n="shield" s={12}/>Client View</div></div><div className="grid grid-cols-3 gap-4 mb-8"><SC icon="building" label="Projects" value={mp.length} accent="blue"/><SC icon="check" label="Milestones" value={3} accent="emerald"/><SC icon="bell" label="Updates" value={unread.length} accent="orange"/></div>{unread.length>0&&<div className="mb-8 bg-orange-50 border border-orange-100 rounded-2xl p-5"><h3 className="font-bold text-orange-800 text-sm mb-3 flex items-center gap-2"><Ic n="bell" s={16} c="text-orange-600"/>{unread.length} New Updates</h3>{unread.map(n=><div key={n.id} className="py-2 border-t border-orange-100 first:border-0"><div className="font-semibold text-orange-900 text-xs">{n.title}</div><div className="text-orange-700 text-xs mt-0.5">{n.message}</div></div>)}</div>}<div className="space-y-4">{mp.map(p=><button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="w-full bg-white rounded-2xl border border-slate-200 p-6 text-left hover:shadow-md hover:border-orange-200 transition-all group"><div className="flex items-start justify-between mb-4"><div><h3 className="font-bold text-slate-800 group-hover:text-orange-600">{p.name}</h3><div className="flex items-center gap-1.5 text-slate-400 text-xs mt-1"><Ic n="map" s={12}/>{p.location}</div></div><Badge status={p.status}/></div><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">Progress</span><span className="font-black">{p.progress}%</span></div><PBar v={p.progress}/></button>)}{mp.length===0&&<div className="text-center py-20 text-slate-400"><Ic n="building" s={32} c="mx-auto mb-3 opacity-30"/><p>No projects assigned to your account</p></div>}</div></div>);}

// ── CLIENT SHARE VIEW ─────────────────────────────────────────────────────────
function ClientShareView({project,milestones,updates,drawings}){
  if(!project) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center text-slate-400"><Ic n="building" s={40} c="mx-auto mb-4 opacity-30"/><p>Project not found</p></div></div>;
  const ms=milestones||[];const us=updates||[];const done=ms.filter(m=>m.status==="completed").length;
  const clientDrawings=(drawings||[]).filter(d=>d.released_to.includes("client"));
  return(<div className="min-h-screen bg-slate-50"><div className="bg-slate-900 px-6 py-4 flex items-center gap-3"><div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center"><Ic n="hardhat" s={16} c="text-white"/></div><div><div className="font-black text-white text-sm">SiteTrack</div><div className="text-orange-400 text-xs">Client View — Read Only</div></div></div>
  <div className="max-w-2xl mx-auto p-6 space-y-5">
    <div className="bg-white rounded-2xl border border-slate-200 p-6"><div className="flex items-start justify-between mb-4"><div><h1 className="text-lg font-black text-slate-800">{project.name}</h1><div className="flex items-center gap-1.5 text-slate-400 text-xs mt-1"><Ic n="map" s={12}/>{project.location}</div></div><Badge status={project.status}/></div><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">Progress</span><span className="font-black text-slate-800">{project.progress}%</span></div><PBar v={project.progress}/><div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-xs"><div><div className="font-semibold text-slate-600 mb-0.5">Expected End</div>{fmtDate(project.expected_end_date)}</div><div><div className="font-semibold text-slate-600 mb-0.5">Milestones</div>{done} of {ms.length}</div></div></div>
    {ms.length>0&&<div className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="flag" s={15} c="text-orange-500"/>Milestones</h2><div className="space-y-3">{ms.map((m,i)=><div key={m.id} className="flex items-center gap-3"><div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs ${m.status==="completed"?"bg-emerald-500 border-emerald-500":m.status==="in_progress"?"bg-orange-500 border-orange-500":"bg-white border-slate-200"}`}>{m.status==="completed"?<Ic n="check" s={12} c="text-white"/>:<span className="font-bold text-slate-400">{i+1}</span>}</div><div className="flex-1"><div className="text-sm font-medium text-slate-700">{m.title}</div><div className="text-xs text-slate-400">Due {fmtDate(m.due_date)}</div></div><Badge status={m.status}/></div>)}</div></div>}
    {clientDrawings.length>0&&<div className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="doc" s={15} c="text-orange-500"/>Released Drawings</h2><div className="space-y-3">{clientDrawings.map(d=><div key={d.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="doc" s={16} c="text-orange-500"/></div><div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 text-sm">{d.title}</div><div className="flex gap-2 text-xs text-slate-400 mt-0.5"><span className="text-orange-600 font-semibold">{d.type}</span><span>{d.revision}</span><span>{fmtDate(d.date)}</span></div>{d.notes&&<p className="text-xs text-slate-500 mt-1">{d.notes}</p>}</div><Badge status={d.status}/></div>)}</div></div>}
    {us.length>0&&<div className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="hardhat" s={15} c="text-orange-500"/>Recent Updates</h2><div className="space-y-4">{us.slice(0,3).map(u=><div key={u.id} className="pb-4 border-b border-slate-100 last:border-0"><div className="flex justify-between mb-2"><span className="font-semibold text-slate-700 text-sm">{fmtDate(u.update_date)}</span>{u.weather&&<span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{u.weather}</span>}</div><p className="text-slate-600 text-sm">{u.notes}</p></div>)}</div></div>}
    <p className="text-center text-xs text-slate-400 pb-4">Powered by SiteTrack Pro · buildco.in</p>
  </div></div>);
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App(){
  const[user,setUser]=useState(null);const[view,setViewRaw]=useState("dashboard");const[sp,setSP]=useState(null);
  const[projects,setProjects]=useState(INIT_PROJECTS);
  const[milestones,setMilestones]=useState(INIT_MILESTONES);
  const[updates,setUpdates]=useState(INIT_UPDATES);
  const[expenses,setExpenses]=useState(INIT_EXPENSES);
  const[notifs,setNotifs]=useState(INIT_NOTIFS);
  const[teams,setTeams]=useState(INIT_TEAMS);
  const[attendance,setAttendance]=useState(INIT_ATTENDANCE);
  const[issues,setIssues]=useState(INIT_ISSUES);
  const[materials,setMaterials]=useState(INIT_MATERIALS);
  const[drawings,setDrawings]=useState(INIT_DRAWINGS);
  const[activity,setActivity]=useState(INIT_ACTIVITY);
  const[dark,setDark]=useState(false);const[mobileOpen,setMobileOpen]=useState(false);

  // Share view
  const urlParams=new URLSearchParams(window.location.search);const shareId=urlParams.get("share");
  if(shareId){const shp=projects.find(p=>p.id===shareId);return <ClientShareView project={shp} milestones={milestones[shareId]||[]} updates={updates[shareId]||[]} drawings={drawings[shareId]||[]}/>;}

  // Activity logger - all PM/client actions visible to architect
  const addActivity=(pid,pname,type,action,detail,byName,byRole)=>{
    if(byRole==="architect") return; // architect actions don't log to feed
    setActivity(p=>[{id:"ac_"+Date.now(),pid,pname,type,by:byName,role:byRole,action,detail,time:new Date().toISOString(),read:false},...p]);
  };

  const setView=v=>{if(v==="logout"){setUser(null);return;}setViewRaw(v);setMobileOpen(false);};
  if(!user) return <LoginScreen onLogin={u=>{setUser(u);setViewRaw("dashboard");}} dark={dark} toggleDark={()=>setDark(p=>!p)}/>;

  const uc=notifs.filter(n=>!n.read).length;
  const ac=activity.filter(a=>!a.read).length;
  const dp={projects,setProjects,milestones,setMilestones,updates,setUpdates,expenses,setExpenses,teams,setTeams,attendance,setAttendance,issues,setIssues,materials,setMaterials,drawings,setDrawings,addActivity};

  const renderView=()=>{
    switch(view){
      case"dashboard": return <DashboardView user={user} projects={projects} updates={updates} issues={issues} activity={activity} setView={setView} setSP={setSP}/>;
      case"projects": return <ProjectsView user={user} projects={projects} setView={setView} setSP={setSP}/>;
      case"analytics": return <AnalyticsView user={user} projects={projects} expenses={expenses} updates={updates} teams={teams}/>;
      case"activity": return <ActivityView user={user} activity={activity} setActivity={setActivity} projects={projects}/>;
      case"detail": return <DetailView pid={sp} user={user} setView={setView} {...dp}/>;
      case"create": return <CreateView user={user} setView={setView} setProjects={setProjects}/>;
      case"notifications": return <NotifsView notifs={notifs} setNotifs={setNotifs}/>;
      case"pm": return <PMView user={user} projects={projects} setView={setView} setSP={setSP} notifs={notifs}/>;
      case"client": return <ClientPortal user={user} projects={projects} notifs={notifs} setView={setView} setSP={setSP}/>;
      default: return <DashboardView user={user} projects={projects} updates={updates} issues={issues} activity={activity} setView={setView} setSP={setSP}/>;
    }
  };

  const DCSS=`.dark .bg-white{background-color:#1e293b!important}.dark .bg-slate-50{background-color:#0f172a!important}.dark .bg-slate-100{background-color:#1e293b!important}.dark .border-slate-200{border-color:#334155!important}.dark .border-slate-100{border-color:#293548!important}.dark .text-slate-800{color:#f1f5f9!important}.dark .text-slate-700{color:#e2e8f0!important}.dark .text-slate-600{color:#cbd5e1!important}.dark .text-slate-500{color:#94a3b8!important}.dark .text-slate-400{color:#64748b!important}.dark .divide-slate-50>*+*{border-color:#1e293b!important}.dark input,.dark textarea,.dark select{background-color:#1e293b!important;color:#f1f5f9!important;border-color:#334155!important}.dark .hover\\:bg-slate-50:hover{background-color:#1e293b!important}`;

  return(
    <div className={`flex min-h-screen ${dark?"dark bg-slate-950":"bg-slate-50"}`} style={{fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');*{box-sizing:border-box;}::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:#f1f5f9;}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}.line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}.line-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}${DCSS}`}</style>
      <Sidebar user={user} active={view} setView={setView} uc={uc} ac={user.role==="architect"?ac:0} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <button onClick={()=>setMobileOpen(true)} className="text-slate-400 hover:text-white p-1"><Ic n="menu" s={22}/></button>
          <div className="flex items-center gap-2"><div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center"><Ic n="hardhat" s={14} c="text-white"/></div><span className="text-white font-black">SiteTrack</span></div>
          <button onClick={()=>setDark(p=>!p)} className="text-slate-400 hover:text-white p-1"><Ic n={dark?"sun2":"moon"} s={18}/></button>
        </div>
        {/* Desktop top bar */}
        <div className="hidden md:flex items-center justify-between px-6 py-2.5 bg-white border-b border-slate-100">
          <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full ${ROLE_META[user.role].bg} ${ROLE_META[user.role].text}`}><Ic n="shield" s={12}/>{ROLE_META[user.role].label} — {user.name}</div>
          <button onClick={()=>setDark(p=>!p)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dark?"bg-slate-800 text-orange-400":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><Ic n={dark?"sun2":"moon"} s={14}/>{dark?"Light":"Dark"} Mode</button>
        </div>
        <main className="flex-1 overflow-y-auto">{renderView()}</main>
      </div>
    </div>
  );
}
