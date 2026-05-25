// SiteTrack Pro — Mid-size tenant views (extracted from App.jsx in Batch 6).
//
// What's here:
//   GanttView        — Project timeline SVG
//   AnalyticsView    — Cross-project charts (Recharts)
//   ActivityView     — Architect-only activity feed
//   NotifsView       — User notifications inbox
//   PMView           — PM home dashboard (small)
//   ClientPortal     — Client home (small)
//   CalendarView     — Month grid with milestones / tasks / invoices
//   VendorsView      — Vendor CRUD + GSTIN
//   POsView          — Cross-project purchase orders
//   GlobalSearch     — Top-bar search across projects + milestones + issues + vendors
//
// Skipped this batch:
//   MessagesView — depends on AttachmentInput / AttachmentList atoms that
//     still live in App.jsx. Moves in Batch 7 along with the attachment
//     refactor + DetailView extraction.

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Ic, SC, Badge, PBar, AccessDenied, ROLE_META, fmtDate, fmtTime, fmtCur,
} from "../../components/ui.jsx";
import { can, visibleProjectsForUser } from "../../lib/permissions.js";
import { notifsForUser } from "../../lib/notifications.js";
import { CHART_COLORS, VENDOR_CATS, ACTIVITY_ICONS } from "../../data/lookups.js";
import { t } from "../../lib/i18n.js";

// ── GANTT ───────────────────────────────────────────────────────────────────
export function GanttView({project,milestones}){
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

// ── ANALYTICS ───────────────────────────────────────────────────────────────
export function AnalyticsView({user,projects,expenses,updates,teams}){
  void updates;
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

// ── ACTIVITY FEED (Architect only) ──────────────────────────────────────────
export function ActivityView({user,activity,setActivity,projects}){
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

// ── NOTIFICATIONS ───────────────────────────────────────────────────────────
export function NotifsView({notifs,setNotifs,user,projects}){
  // HIGH-2 fix: notifications scoped to the user's visible projects.
  const visible=notifsForUser(notifs,user,projects);
  const u=visible.filter(n=>!n.read).length;
  return(<div className="p-4 md:p-8 max-w-2xl"><div className="flex items-start justify-between mb-8"><div><h1 className="text-2xl font-black text-slate-800">Site Updates</h1><p className="text-slate-500 text-sm mt-1">{u} unread</p></div>{u>0&&<button onClick={()=>setNotifs(p=>p.map(n=>visible.find(v=>v.id===n.id)?{...n,read:true}:n))} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm"><Ic n="mailCheck" s={15}/>Mark all</button>}</div><div className="space-y-3">{visible.map(n=><div key={n.id} className={`bg-white rounded-2xl border p-5 flex gap-4 ${n.read?"border-slate-100 opacity-70":"border-orange-100 shadow-sm"}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.read?"bg-slate-100":"bg-orange-50"}`}><Ic n="bell" s={18} c={n.read?"text-slate-400":"text-orange-500"}/></div><div className="flex-1"><div className="flex items-start justify-between gap-2"><div className="font-semibold text-slate-800 text-sm">{n.title}</div>{!n.read&&<button onClick={()=>setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x))} className="text-xs text-orange-500 font-semibold flex-shrink-0">Mark read</button>}</div><p className="text-slate-500 text-xs mt-1">{n.message}</p><p className="text-slate-400 text-xs mt-2">{fmtDate(n.created_at)}</p></div></div>)}{visible.length===0&&<div className="text-center py-12 text-slate-400 italic text-sm">No notifications for your projects.</div>}</div></div>);
}

// ── PM HOME ─────────────────────────────────────────────────────────────────
export function PMView({user,projects,setView,setSP,notifs}){
  const unread=notifsForUser(notifs,user,projects).filter(n=>!n.read);
  return(<div className="p-4 md:p-8"><div className="mb-6 flex items-start justify-between"><h1 className="text-2xl font-black text-slate-800">PM Dashboard</h1><div className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-blue-100 text-blue-700"><Ic n="shield" s={12}/>Project Manager</div></div><div className="grid grid-cols-3 gap-4 mb-8"><SC icon="building" label="Projects" value={projects.length} accent="blue"/><SC icon="trend" label="Active" value={projects.filter(p=>p.status==="active").length} accent="orange"/><SC icon="bell" label="Unread" value={unread.length} accent="violet"/></div>{unread.length>0&&<div className="mb-8"><h2 className="font-bold text-slate-800 text-base mb-4">Notifications</h2><div className="space-y-3">{unread.map(n=><div key={n.id} className="bg-white rounded-2xl border border-orange-100 p-4 flex gap-3 shadow-sm"><div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="bell" s={16} c="text-orange-500"/></div><div><div className="font-semibold text-slate-800 text-sm">{n.title}</div><p className="text-slate-500 text-xs mt-0.5">{n.message}</p></div></div>)}</div></div>}<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{projects.map(p=><button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-orange-200 transition-all group"><div className="flex items-start justify-between mb-3"><h3 className="font-bold text-slate-800 text-sm group-hover:text-orange-600">{p.name}</h3><Badge status={p.status}/></div><div className="text-xs text-slate-400 mb-3 flex items-center gap-1.5"><Ic n="map" s={11}/>{p.location}</div><PBar v={p.progress}/><div className="text-xs text-slate-400 mt-1">{p.progress}%</div></button>)}</div></div>);
}

// ── CLIENT PORTAL ───────────────────────────────────────────────────────────
export function ClientPortal({user,projects,notifs,setView,setSP}){
  const mp=projects.filter(p=>p.client_email===user.email);
  const unread=notifsForUser(notifs,user,projects).filter(n=>!n.read);
  return(<div className="p-4 md:p-8"><div className="mb-6 flex items-start justify-between"><h1 className="text-2xl font-black text-slate-800">Client Portal</h1><div className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-emerald-100 text-emerald-700"><Ic n="shield" s={12}/>Client View</div></div><div className="grid grid-cols-3 gap-4 mb-8"><SC icon="building" label="Projects" value={mp.length} accent="blue"/><SC icon="check" label="Milestones" value={3} accent="emerald"/><SC icon="bell" label="Updates" value={unread.length} accent="orange"/></div>{unread.length>0&&<div className="mb-8 bg-orange-50 border border-orange-100 rounded-2xl p-5"><h3 className="font-bold text-orange-800 text-sm mb-3 flex items-center gap-2"><Ic n="bell" s={16} c="text-orange-600"/>{unread.length} New Updates</h3>{unread.map(n=><div key={n.id} className="py-2 border-t border-orange-100 first:border-0"><div className="font-semibold text-orange-900 text-xs">{n.title}</div><div className="text-orange-700 text-xs mt-0.5">{n.message}</div></div>)}</div>}<div className="space-y-4">{mp.map(p=><button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="w-full bg-white rounded-2xl border border-slate-200 p-6 text-left hover:shadow-md hover:border-orange-200 transition-all group"><div className="flex items-start justify-between mb-4"><div><h3 className="font-bold text-slate-800 group-hover:text-orange-600">{p.name}</h3><div className="flex items-center gap-1.5 text-slate-400 text-xs mt-1"><Ic n="map" s={12}/>{p.location}</div></div><Badge status={p.status}/></div><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">Progress</span><span className="font-black">{p.progress}%</span></div><PBar v={p.progress}/></button>)}{mp.length===0&&<div className="text-center py-20 text-slate-400"><Ic n="building" s={32} c="mx-auto mb-3 opacity-30"/><p>No projects assigned to your account</p></div>}</div></div>);
}

// ── CALENDAR (cross-project deadlines) ──────────────────────────────────────
export function CalendarView({user,projects,milestones,tasks,invoices}){
  const[curMonth,setCurMonth]=useState(new Date());
  const visibleProjects=user.role==="client"?projects.filter(p=>p.client_email===user.email):projects;
  const events=useMemo(()=>{
    const arr=[];
    visibleProjects.forEach(p=>{
      (milestones[p.id]||[]).forEach(m=>arr.push({date:m.due_date,type:"milestone",title:m.title,proj:p.name,pid:p.id,status:m.status}));
      (tasks[p.id]||[]).forEach(tk=>arr.push({date:tk.due,type:"task",title:tk.title,proj:p.name,pid:p.id,status:tk.status}));
      (invoices[p.id]||[]).forEach(inv=>arr.push({date:inv.issued,type:"invoice",title:`${inv.no}: ${inv.milestone}`,proj:p.name,pid:p.id,status:inv.status}));
    });
    return arr;
  },[visibleProjects,milestones,tasks,invoices]);
  const y=curMonth.getFullYear(),mo=curMonth.getMonth();
  const firstDay=new Date(y,mo,1).getDay();
  const daysInMonth=new Date(y,mo+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  const evColor={milestone:"bg-orange-100 text-orange-700 border-orange-200",task:"bg-blue-100 text-blue-700 border-blue-200",invoice:"bg-emerald-100 text-emerald-700 border-emerald-200"};
  const today=new Date();
  return(
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Ic n="calendar" s={22} c="text-orange-500"/>Calendar</h1><p className="text-slate-500 text-sm mt-1">Cross-project deadlines</p></div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1">
          <button onClick={()=>setCurMonth(new Date(y,mo-1,1))} className="px-3 py-1.5 text-slate-500 hover:text-slate-800 font-bold">‹</button>
          <div className="px-3 py-1 font-bold text-slate-800 text-sm min-w-32 text-center">{curMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
          <button onClick={()=>setCurMonth(new Date(y,mo+1,1))} className="px-3 py-1.5 text-slate-500 hover:text-slate-800 font-bold">›</button>
          <button onClick={()=>setCurMonth(new Date())} className="ml-2 px-3 py-1 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-lg text-xs">Today</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-3 md:p-5 overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 mb-2 min-w-[700px]">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest p-2">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1 min-w-[700px]">
          {cells.map((d,i)=>{
            if(!d)return <div key={i} className="aspect-square"></div>;
            const ds=new Date(y,mo,d).toISOString().split("T")[0];
            const dayEvents=events.filter(e=>e.date===ds);
            const isToday=today.getFullYear()===y&&today.getMonth()===mo&&today.getDate()===d;
            return(
              <div key={i} className={`aspect-square border rounded-lg p-1.5 min-h-20 ${isToday?"border-orange-400 bg-orange-50":"border-slate-100"}`}>
                <div className={`text-xs font-bold mb-1 ${isToday?"text-orange-600":"text-slate-600"}`}>{d}</div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0,3).map((e,j)=><div key={j} className={`text-[9px] font-semibold px-1 py-0.5 rounded border truncate ${evColor[e.type]}`} title={`${e.proj}: ${e.title}`}>{e.title}</div>)}
                  {dayEvents.length>3&&<div className="text-[9px] text-slate-400 font-bold">+{dayEvents.length-3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-4 text-xs">{Object.entries(evColor).map(([k,v])=><div key={k} className="flex items-center gap-2"><span className={`w-3 h-3 rounded border ${v}`}></span><span className="text-slate-600 capitalize">{k}</span></div>)}</div>
    </div>
  );
}

// ── VENDORS ─────────────────────────────────────────────────────────────────
export function VendorsView({user,vendors,setVendors}){
  // Hooks first (react-hooks/rules-of-hooks).
  const[show,setShow]=useState(false);const[q,setQ]=useState("");
  const[nv,setNv]=useState({name:"",category:"Steel",contact:"",phone:"",gst:"",rating:4});
  if(!can(user,"manageTeam")&&user.role!=="pm") return <div className="p-8"><AccessDenied msg="Vendors visible to Architect & PM only."/></div>;
  const add=()=>{
    if(!nv.name.trim())return;
    setVendors(p=>[...p,{id:"v_"+Date.now(),...nv,rating:+nv.rating,projects:0}]);
    setNv({name:"",category:"Steel",contact:"",phone:"",gst:"",rating:4});setShow(false);
  };
  const del=id=>setVendors(p=>p.filter(v=>v.id!==id));
  const fl=vendors.filter(v=>!q||v.name.toLowerCase().includes(q.toLowerCase())||v.category.toLowerCase().includes(q.toLowerCase()));
  return(
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Ic n="truck" s={22} c="text-orange-500"/>Vendors</h1><p className="text-slate-500 text-sm mt-1">{fl.length} suppliers</p></div>
        {can(user,"manageTeam")&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Add Vendor</button>}
      </div>
      <div className="relative mb-5"><Ic n="search" s={16} c="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search vendor or category..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Vendor</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={nv.name} onChange={e=>setNv(p=>({...p,name:e.target.value}))} placeholder="Vendor name" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <select value={nv.category} onChange={e=>setNv(p=>({...p,category:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{VENDOR_CATS.map(c=><option key={c}>{c}</option>)}</select>
          <input value={nv.contact} onChange={e=>setNv(p=>({...p,contact:e.target.value}))} placeholder="Contact person" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input value={nv.phone} onChange={e=>setNv(p=>({...p,phone:e.target.value}))} placeholder="Phone" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input value={nv.gst} onChange={e=>setNv(p=>({...p,gst:e.target.value}))} placeholder="GSTIN (15 chars)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input type="number" min="1" max="5" step="0.1" value={nv.rating} onChange={e=>setNv(p=>({...p,rating:e.target.value}))} placeholder="Rating /5" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
        </div>
        <button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add</button>
      </div>}
      <div className="grid md:grid-cols-2 gap-4">{fl.map(v=>(
        <div key={v.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-3"><div><div className="font-bold text-slate-800">{v.name}</div><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 mt-1 inline-block">{v.category}</span></div><div className="flex items-center gap-1 text-amber-500 text-sm font-bold">★ {v.rating}</div></div>
          <div className="space-y-1 text-xs text-slate-500">
            {v.contact&&<div className="flex items-center gap-2"><Ic n="users" s={12}/>{v.contact}</div>}
            {v.phone&&<div className="flex items-center gap-2"><Ic n="phone" s={12}/>{v.phone}</div>}
            {v.gst&&<div className="flex items-center gap-2 font-mono"><Ic n="doc" s={12}/>{v.gst}</div>}
            <div className="flex items-center gap-2"><Ic n="folder" s={12}/>{v.projects} project(s)</div>
          </div>
          {can(user,"manageTeam")&&<div className="mt-3 pt-3 border-t border-slate-100 flex justify-end"><button onClick={()=>del(v.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={15}/></button></div>}
        </div>
      ))}{fl.length===0&&(
        <div className="col-span-2 bg-white rounded-2xl p-12 text-center" style={{border:"1px dashed var(--st-line)"}}>
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n={vendors.length===0?"truck":"search"} s={24} c="text-amber-700"/></div>
          <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-2">{vendors.length===0?"No vendors registered yet":"No vendors match your search"}</div>
          <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-4">
            {vendors.length===0
              ? "Add steel, cement, ready-mix concrete, electrical and other suppliers so your purchase orders, GST records and ratings stay in one place."
              : "Try a different keyword or clear the search to see all vendors."}
          </p>
          {vendors.length===0&&can(user,"manageTeam")&&<button onClick={()=>setShow(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={14}/>Add first vendor</button>}
          {vendors.length>0&&<button onClick={()=>setQ("")} className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-300 text-ink-700 font-bold rounded-xl text-sm hover:bg-stone-50"><Ic n="x" s={14}/>Clear search</button>}
        </div>
      )}</div>
    </div>
  );
}

// ── PURCHASE ORDERS (cross-project) ─────────────────────────────────────────
export function POsView({user,projects,pos,vendors,setView,setSP}){
  if(user.role==="client") return <div className="p-8"><AccessDenied/></div>;
  const all=Object.entries(pos).flatMap(([pid,arr])=>(arr||[]).map(po=>({...po,pid,pname:projects.find(p=>p.id===pid)?.name||""})));
  const vendor=id=>vendors.find(v=>v.id===id);
  const total=all.reduce((s,po)=>s+po.amount*(1+po.gst/100),0);
  return(
    <div className="p-4 md:p-8">
      <div className="mb-6"><h1 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Ic n="clipboard" s={22} c="text-orange-500"/>Purchase Orders</h1><p className="text-slate-500 text-sm mt-1">{all.length} POs · Total (incl. GST): {fmtCur(total)}</p></div>
      <div className="space-y-3">{all.map(po=>{const v=vendor(po.vendor_id);return(
        <button key={po.id} onClick={()=>{setSP(po.pid);setView("detail");}} className="w-full bg-white rounded-2xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-orange-200 transition-all">
          <div className="flex items-start justify-between mb-2 gap-3">
            <div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-orange-600">{po.no}</span><Badge status={po.status}/></div><div className="font-bold text-slate-800 text-sm">{po.items}</div></div>
            <div className="text-right flex-shrink-0"><div className="text-base font-black text-slate-800">{fmtCur(po.amount)}</div><div className="text-xs text-slate-400">+ {po.gst}% GST</div></div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
            <span><Ic n="truck" s={11} c="inline mr-1"/>{v?.name||"—"}</span>
            <span><Ic n="folder" s={11} c="inline mr-1"/>{po.pname}</span>
            <span><Ic n="calendar" s={11} c="inline mr-1"/>{fmtDate(po.created)}</span>
            <span>Delivery: {fmtDate(po.delivery)}</span>
          </div>
        </button>
      );})}{all.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="clipboard" s={32} c="mx-auto mb-3 opacity-30"/><p>No purchase orders</p></div>}</div>
    </div>
  );
}

// ── GLOBAL SEARCH ───────────────────────────────────────────────────────────
export function GlobalSearch({projects,milestones,issues,vendors,setView,setSP,lang,user}){
  const[q,setQ]=useState("");const[show,setShow]=useState(false);
  const results=useMemo(()=>{
    if(!q.trim())return[];
    const ql=q.toLowerCase();
    const out=[];
    const visible=visibleProjectsForUser(projects,user);
    const visibleIds=new Set(visible.map(p=>p.id));
    visible.forEach(p=>{if(p.name.toLowerCase().includes(ql)||p.location.toLowerCase().includes(ql)||p.client_name.toLowerCase().includes(ql))out.push({type:"project",title:p.name,sub:p.location,pid:p.id});});
    Object.entries(milestones).forEach(([pid,arr])=>visibleIds.has(pid)&&(arr||[]).forEach(m=>{if(m.title.toLowerCase().includes(ql))out.push({type:"milestone",title:m.title,sub:projects.find(p=>p.id===pid)?.name||"",pid});}));
    Object.entries(issues).forEach(([pid,arr])=>visibleIds.has(pid)&&(arr||[]).forEach(i=>{if(i.title.toLowerCase().includes(ql))out.push({type:"issue",title:i.title,sub:projects.find(p=>p.id===pid)?.name||"",pid});}));
    if(["architect","pm"].includes(user?.role)) vendors.forEach(v=>{if(v.name.toLowerCase().includes(ql))out.push({type:"vendor",title:v.name,sub:v.category,pid:null});});
    return out.slice(0,15);
  },[q,projects,milestones,issues,vendors,user]);
  const typeColor={project:"bg-blue-50 text-blue-600",milestone:"bg-orange-50 text-orange-600",issue:"bg-red-50 text-red-600",vendor:"bg-emerald-50 text-emerald-600"};
  return(
    <div className="relative w-full max-w-md">
      <Ic n="search" s={14} c="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
      <input value={q} onChange={e=>{setQ(e.target.value);setShow(true);}} onFocus={()=>setShow(true)} onBlur={()=>setTimeout(()=>setShow(false),200)} placeholder={t(lang,"search")} className="w-full pl-9 pr-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs outline-none focus:border-orange-400 focus:bg-white"/>
      {show&&q&&<div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-96 overflow-y-auto z-50">
        {results.length===0?<div className="p-4 text-xs text-slate-400 text-center">No results</div>:results.map((r,i)=>(
          <button key={i} onMouseDown={()=>{if(r.pid){setSP(r.pid);setView("detail");}else{setView("vendors");}setQ("");setShow(false);}} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center gap-3">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${typeColor[r.type]}`}>{r.type}</span>
            <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-slate-800 truncate">{r.title}</div><div className="text-[10px] text-slate-400 truncate">{r.sub}</div></div>
          </button>
        ))}
      </div>}
    </div>
  );
}
