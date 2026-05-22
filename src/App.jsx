import { useState, useRef, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  PERMS,
  can,
  visibleProjectsForUser,
  canAccessProject,
  fallbackViewForUser,
  canOpenView,
  canUseQuickCapture,
  drawingKey,
  isReleasedCurrentDrawing,
} from "./lib/permissions.js";
import { isOnline, onConnectivityChange, queueLength, queueOpAdd } from "./lib/offline.js";
import { computeRiskScore, fetchLLMInsight, getProviderConfig, saveProviderConfig, clearProviderConfig } from "./lib/ai.js";
import { getRazorpayConfig, saveRazorpayConfig, buildUpiDeepLink } from "./lib/razorpay.js";

// ── PERSISTENCE (localStorage) ───────────────────────────────────────────────
const LS_KEY = "sitetrack_v2";
const useLS = (k, def) => {
  const [v, setV] = useState(() => {
    try { const all = JSON.parse(localStorage.getItem(LS_KEY)||"{}"); return all[k]!==undefined ? all[k] : def; }
    catch { return def; }
  });
  useEffect(() => {
    try { const all = JSON.parse(localStorage.getItem(LS_KEY)||"{}"); all[k]=v; localStorage.setItem(LS_KEY, JSON.stringify(all)); }
    catch {}
  }, [k, v]);
  return [v, setV];
};

// ── i18n (Telugu / Hindi / English) ──────────────────────────────────────────
const I18N = {
  en: { dashboard:"Dashboard", projects:"Projects", analytics:"Analytics", activity:"Activity", calendar:"Calendar", vendors:"Vendors", purchaseOrders:"Purchase Orders", notifications:"Updates", search:"Search anything...", language:"Language", lightMode:"Light Mode", darkMode:"Dark Mode" },
  te: { dashboard:"డాష్‌బోర్డ్", projects:"ప్రాజెక్ట్‌లు", analytics:"విశ్లేషణ", activity:"కార్యకలాపం", calendar:"క్యాలెండర్", vendors:"సరఫరాదారులు", purchaseOrders:"కొనుగోలు ఆర్డర్‌లు", notifications:"నవీకరణలు", search:"ఏదైనా శోధించండి...", language:"భాష", lightMode:"లైట్ మోడ్", darkMode:"డార్క్ మోడ్" },
  hi: { dashboard:"डैशबोर्ड", projects:"परियोजनाएं", analytics:"विश्लेषण", activity:"गतिविधि", calendar:"कैलेंडर", vendors:"विक्रेता", purchaseOrders:"खरीद आदेश", notifications:"अपडेट", search:"कुछ भी खोजें...", language:"भाषा", lightMode:"लाइट मोड", darkMode:"डार्क मोड" },
};
const t = (lang, k) => I18N[lang]?.[k] || I18N.en[k] || k;

// ── PERMISSIONS ───────────────────────────────────────────────────────────────
// Single source of truth: src/lib/permissions.js (imported at top).
// Vitest covers role boundaries, so any drift breaks tests immediately.
const ROLE_META = {
  superadmin:{label:"Super Admin",bg:"bg-slate-900",text:"text-amber-400",col:"slate"},
  architect:{label:"Architect",bg:"bg-orange-100",text:"text-orange-700",col:"orange"},
  pm:{label:"Project Manager",bg:"bg-blue-100",text:"text-blue-700",col:"blue"},
  contractor:{label:"Contractor",bg:"bg-violet-100",text:"text-violet-700",col:"violet"},
  client:{label:"Client",bg:"bg-emerald-100",text:"text-emerald-700",col:"emerald"},
};

// ── MOCK DATA ─────────────────────────────────────────────────────────────────
const MOCK_USERS = {
  architect:{id:"u1",name:"Arjun Reddy",email:"arjun@buildco.in",role:"architect",avatar:"AR",org_id:"org1"},
  pm:{id:"u2",name:"Priya Sharma",email:"priya@buildco.in",role:"pm",avatar:"PS",org_id:"org1"},
  contractor:{id:"u4",name:"Karthik Builders",email:"site@karthikbuilders.in",role:"contractor",avatar:"KB",org_id:"org1"},
  client:{id:"u3",name:"Vikram Nair",email:"vikram@client.in",role:"client",avatar:"VN",org_id:"org1"},
  superadmin:{id:"u100",name:"Rakesh Boyapati",email:"admin@sitetrack.in",role:"superadmin",avatar:"RB",org_id:null},
};
// Multi-tenant customer organizations — what the super admin coordinates.
const INIT_ORGS = [
  {id:"org1",name:"BuildCo India",slug:"buildco",plan:"business",mrr:7999,users_count:4,projects_count:4,created:"2024-10-01",contact_email:"arjun@buildco.in",status:"active",trial_ends:null,city:"Hyderabad"},
  {id:"org2",name:"Skyline Architects",slug:"skyline-arch",plan:"pro",mrr:2999,users_count:3,projects_count:2,created:"2025-02-15",contact_email:"anika@skyline.in",status:"active",trial_ends:null,city:"Bangalore"},
  {id:"org3",name:"Premier Builders & Co.",slug:"premier",plan:"basic",mrr:999,users_count:2,projects_count:1,created:"2025-04-20",contact_email:"suresh@premier.in",status:"active",trial_ends:null,city:"Chennai"},
  {id:"org4",name:"Nair Holdings Construction",slug:"nair-holdings",plan:"pro",mrr:2999,users_count:5,projects_count:3,created:"2024-12-10",contact_email:"head@nair.in",status:"active",trial_ends:null,city:"Kochi"},
  {id:"org5",name:"Greenfield Developers",slug:"greenfield",plan:"basic",mrr:999,users_count:2,projects_count:1,created:"2025-05-05",contact_email:"gf@green.in",status:"trial",trial_ends:"2025-06-04",city:"Pune"},
];
// Cross-tenant user list — admin uses this for CRUD; demo users still log in via MOCK_USERS picker.
const INIT_ADMIN_USERS = [
  {id:"u1",name:"Arjun Reddy",email:"arjun@buildco.in",role:"architect",org_id:"org1",status:"active",joined:"2024-10-01",last_seen:"2025-04-21T09:30:00Z"},
  {id:"u2",name:"Priya Sharma",email:"priya@buildco.in",role:"pm",org_id:"org1",status:"active",joined:"2024-10-15",last_seen:"2025-04-20T18:12:00Z"},
  {id:"u3",name:"Vikram Nair",email:"vikram@client.in",role:"client",org_id:"org1",status:"active",joined:"2024-11-10",last_seen:"2025-04-19T11:00:00Z"},
  {id:"u4",name:"Karthik Builders",email:"site@karthikbuilders.in",role:"contractor",org_id:"org1",status:"active",joined:"2024-11-01",last_seen:"2025-04-21T07:45:00Z"},
  {id:"u5",name:"Anika Iyer",email:"anika@skyline.in",role:"architect",org_id:"org2",status:"active",joined:"2025-02-15",last_seen:"2025-04-18T16:22:00Z"},
  {id:"u6",name:"Raj Mehta",email:"raj@skyline.in",role:"pm",org_id:"org2",status:"active",joined:"2025-02-20",last_seen:"2025-04-20T10:08:00Z"},
  {id:"u7",name:"Maya Pillai",email:"maya@skylineclients.in",role:"client",org_id:"org2",status:"active",joined:"2025-03-01",last_seen:"2025-04-15T13:30:00Z"},
  {id:"u8",name:"Suresh Reddy",email:"suresh@premier.in",role:"architect",org_id:"org3",status:"active",joined:"2025-04-20",last_seen:"2025-04-20T20:15:00Z"},
  {id:"u9",name:"Manoj Kumar",email:"manoj@premier.in",role:"pm",org_id:"org3",status:"inactive",joined:"2025-04-25",last_seen:"2025-04-26T09:00:00Z"},
  {id:"u10",name:"Lakshmi Krishnan",email:"lakshmi@nair.in",role:"architect",org_id:"org4",status:"active",joined:"2024-12-10",last_seen:"2025-04-21T08:00:00Z"},
  {id:"u11",name:"Deepak Singh",email:"deepak@nair.in",role:"pm",org_id:"org4",status:"active",joined:"2024-12-20",last_seen:"2025-04-20T17:30:00Z"},
  {id:"u12",name:"Sandeep Rao",email:"sandeep@nair.in",role:"contractor",org_id:"org4",status:"active",joined:"2025-01-05",last_seen:"2025-04-20T15:00:00Z"},
  {id:"u13",name:"Ravi Menon",email:"head@nair.in",role:"client",org_id:"org4",status:"active",joined:"2024-12-10",last_seen:"2025-04-19T10:00:00Z"},
  {id:"u14",name:"Greenfield Owner",email:"gf@green.in",role:"architect",org_id:"org5",status:"active",joined:"2025-05-05",last_seen:"2025-05-05T11:00:00Z"},
  {id:"u100",name:"Rakesh Boyapati",email:"admin@sitetrack.in",role:"superadmin",org_id:null,status:"active",joined:"2024-09-01",last_seen:"2025-04-21T10:00:00Z"},
];
const PLAN_META = {
  basic:{label:"Basic",price:999,color:"slate"},
  pro:{label:"Pro",price:2999,color:"blue"},
  business:{label:"Business",price:7999,color:"orange"},
  custom:{label:"Custom",price:0,color:"violet"},
};
const INIT_PROJECTS = [
  {id:"p1",name:"Skyline Tower Phase II",client_name:"Nair Holdings",client_email:"vikram@client.in",location:"Jubilee Hills, Hyderabad",lat:17.4326,lng:78.4071,status:"active",start_date:"2024-11-01",expected_end_date:"2026-06-30",budget:45000000,description:"28-floor commercial tower with underground parking.",progress:62},
  {id:"p2",name:"Green Valley Residences",client_name:"Greenfield Developers",client_email:"gf@green.in",location:"Gachibowli, Hyderabad",lat:17.4401,lng:78.3489,status:"active",start_date:"2025-01-15",expected_end_date:"2026-12-31",budget:18000000,description:"Eco-friendly residential complex with 120 units.",progress:34},
  {id:"p3",name:"Metro Link Office Park",client_name:"TechSpace Corp",client_email:"ts@techspace.in",location:"HITEC City, Hyderabad",lat:17.4504,lng:78.3800,status:"completed",start_date:"2023-06-01",expected_end_date:"2024-12-31",budget:32000000,description:"4-building IT campus.",progress:100},
  {id:"p4",name:"Heritage Mall Renovation",client_name:"RetailPlus Ltd",client_email:"rp@retailplus.in",location:"Banjara Hills, Hyderabad",lat:17.4126,lng:78.4483,status:"on_hold",start_date:"2025-03-01",expected_end_date:"2025-11-30",budget:8500000,description:"Modernization of 1990s commercial mall.",progress:15},
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

// ── NEW: Tasks under milestones ───────────────────────────────────────────────
const INIT_TASKS = {
  p1:[
    {id:"tk1",mid:"m4",title:"Electrical conduit floors 14-16",assignee:"Ravi Kumar",due:"2025-09-15",status:"in_progress",priority:"high"},
    {id:"tk2",mid:"m4",title:"Plumbing rough-in floor 12",assignee:"Anand Kumar",due:"2025-09-20",status:"pending",priority:"medium"},
    {id:"tk3",mid:"m5",title:"Facade sample approval",assignee:"Suresh Babu",due:"2025-12-10",status:"pending",priority:"high"},
  ],
  p2:[{id:"tk4",mid:"m10",title:"Column reinforcement check",assignee:"Mahesh Rao",due:"2025-07-25",status:"in_progress",priority:"high"}],
};
// ── NEW: Punch List (close-out items) ─────────────────────────────────────────
const INIT_PUNCH = {
  p1:[
    {id:"pn1",title:"Door handle alignment - 1402",room:"Floor 14 Unit 02",trade:"Carpentry",assignee:"Suresh Babu",status:"open",created:"2025-04-19"},
    {id:"pn2",title:"Paint touch-up lobby",room:"Ground Lobby",trade:"Painting",assignee:"Suresh Babu",status:"in_progress",created:"2025-04-18"},
  ],
  p2:[],
};
// ── NEW: RFI (Request for Information) ───────────────────────────────────────
const INIT_RFI = {
  p1:[
    {id:"rfi1",no:"RFI-001",subject:"Beam B-14 reinforcement clarification",question:"Drawing shows 8#16 but BBS says 6#16. Please clarify.",from:"Priya Sharma",to:"Architect",status:"open",created:"2025-04-15",response:""},
    {id:"rfi2",no:"RFI-002",subject:"Window opening dimensions floor 12",question:"Variance of 50mm between architect and structural drawings.",from:"Priya Sharma",to:"Architect",status:"answered",created:"2025-04-10",response:"Use architect dimensions. Structural updated in Rev B.",responded:"2025-04-12"},
  ],
  p2:[],
};
// ── NEW: Change Orders ───────────────────────────────────────────────────────
const INIT_CO = {
  p1:[
    {id:"co1",no:"CO-001",title:"Upgrade lobby flooring to Italian marble",reason:"Client request - premium upgrade",cost_impact:850000,time_impact:14,status:"pending_approval",created:"2025-04-16",created_by:"Priya Sharma"},
    {id:"co2",no:"CO-002",title:"Additional power outlets per floor",reason:"Revised electrical load requirements",cost_impact:340000,time_impact:7,status:"approved",created:"2025-03-20",created_by:"Priya Sharma",approved_date:"2025-03-25"},
  ],
  p2:[],
};
// ── NEW: Inspections / Quality Checklists ────────────────────────────────────
const INIT_INSPECTIONS = {
  p1:[
    {id:"ins1",title:"Pre-pour concrete inspection - Floor 22",date:"2025-04-22",type:"Quality",inspector:"Ravi Kumar",status:"scheduled",items:[
      {q:"Reinforcement as per drawing",ok:null},{q:"Cover blocks placed",ok:null},{q:"Form work cleaned",ok:null},{q:"Approval by structural consultant",ok:null}
    ]},
    {id:"ins2",title:"MEP rough-in QC Floor 14",date:"2025-04-18",type:"Quality",inspector:"Kiran Reddy",status:"passed",items:[
      {q:"Conduit routing correct",ok:true},{q:"Box positioning verified",ok:true},{q:"Plumbing slope OK",ok:true},{q:"Fire stops installed",ok:true}
    ]},
  ],
  p2:[],
};
// ── NEW: Safety Incidents (separate from issues) ─────────────────────────────
const INIT_SAFETY = {
  p1:[
    {id:"sf1",date:"2025-04-15",type:"near_miss",description:"Falling debris near entrance — no injury",severity:"medium",worker:"N/A",action:"Toolbox talk + helmet awareness",reported_by:"Kiran Reddy",status:"closed"},
  ],
  p2:[],
};
// ── NEW: Vendors / Suppliers DB (global) ─────────────────────────────────────
const INIT_VENDORS = [
  {id:"v1",name:"Vizag Steel Ltd",category:"Steel",contact:"Mr. Rao",phone:"9876512340",gst:"36AABCV1234A1Z5",rating:4.5,projects:2},
  {id:"v2",name:"Ultratech RMC",category:"Concrete",contact:"Mr. Krishna",phone:"9876512341",gst:"36AABCU5678B1Z3",rating:4.2,projects:3},
  {id:"v3",name:"Havells India",category:"Electrical",contact:"Mr. Sharma",phone:"9876512342",gst:"36AABCH9876C1Z1",rating:4.7,projects:1},
  {id:"v4",name:"ACC Cement",category:"Cement",contact:"Mr. Reddy",phone:"9876512343",gst:"36AABCA4567D1Z9",rating:4.4,projects:2},
];
// ── NEW: Purchase Orders ─────────────────────────────────────────────────────
const INIT_POS = {
  p1:[
    {id:"po1",no:"PO-001",vendor_id:"v1",items:"TMT Steel Fe500 - 25 tons",amount:1750000,gst:18,status:"approved",created:"2025-04-10",delivery:"2025-04-25"},
    {id:"po2",no:"PO-002",vendor_id:"v3",items:"Electrical conduit + boxes",amount:280000,gst:18,status:"pending",created:"2025-04-18",delivery:"2025-04-28"},
  ],
  p2:[],
};
// ── NEW: Invoices (client billing tied to milestones) ────────────────────────
const INIT_INVOICES = {
  p1:[
    {id:"inv1",no:"INV-001",milestone:"Foundation Complete",amount:6750000,gst:18,tds:2,status:"paid",issued:"2025-01-15",paid:"2025-02-10"},
    {id:"inv2",no:"INV-002",milestone:"Frame Floors 1-10",amount:11250000,gst:18,tds:2,status:"paid",issued:"2025-04-05",paid:"2025-04-25"},
    {id:"inv3",no:"INV-003",milestone:"Frame Floors 11-20",amount:11250000,gst:18,tds:2,status:"sent",issued:"2025-06-28",paid:null},
  ],
  p2:[],
};
// ── NEW: Labour Register (statutory) ─────────────────────────────────────────
const INIT_LABOUR = {
  p1:[
    {id:"lb1",name:"Ramesh Yadav",aadhaar:"XXXX-XXXX-1234",epf:"AP/HYD/1234567",esi:"4198765432",trade:"Mason",wage:850,joined:"2024-12-01"},
    {id:"lb2",name:"Sunita Devi",aadhaar:"XXXX-XXXX-5678",epf:"AP/HYD/1234568",esi:"4198765433",trade:"Helper",wage:550,joined:"2024-12-01"},
  ],
  p2:[],
};
// ── NEW: RA Bills (Subcontractor Running Account) ────────────────────────────
const INIT_RA = {
  p1:[
    {id:"ra1",no:"RA-01",subcontractor:"BuildMax Civil Works",scope:"Structural work floors 1-10",bill_amount:8500000,cumulative:8500000,retention_pct:5,paid_amount:8075000,status:"paid",bill_date:"2025-04-01",mb:[
      {id:"mb1",location:"Floor 1-5 columns",item:"RCC M30",unit:"cum",qty:240,rate:8200,amount:1968000},
      {id:"mb2",location:"Floor 1-5 slabs",item:"RCC M30",unit:"cum",qty:180,rate:8200,amount:1476000},
      {id:"mb3",location:"Floor 6-10 columns",item:"RCC M30",unit:"cum",qty:240,rate:8200,amount:1968000},
      {id:"mb4",location:"Floor 6-10 slabs",item:"RCC M30",unit:"cum",qty:180,rate:8200,amount:1476000},
      {id:"mb5",location:"Reinforcement floors 1-10",item:"TMT Fe500",unit:"ton",qty:22,rate:71500,amount:1573000},
    ]},
    {id:"ra2",no:"RA-02",subcontractor:"BuildMax Civil Works",scope:"Structural work floors 11-20",bill_amount:9200000,cumulative:17700000,retention_pct:5,paid_amount:0,status:"submitted",bill_date:"2025-07-05",mb:[
      {id:"mb6",location:"Floor 11-20 columns + slabs",item:"RCC M30",unit:"cum",qty:840,rate:8200,amount:6888000},
      {id:"mb7",location:"Reinforcement floors 11-20",item:"TMT Fe500",unit:"ton",qty:32.4,rate:71500,amount:2316600},
    ]},
  ],
  p2:[],
};
// ── NEW: Comments (flat list keyed by entity) ────────────────────────────────
const INIT_COMMENTS = [
  {id:"cm1",entity:"i1",text:"Structural consultant visiting tomorrow",by:"Priya Sharma",role:"pm",time:"2025-04-19T11:00:00Z"},
  {id:"cm2",entity:"i3",text:"Need urgent action — work stopped on F14",by:"Kiran Reddy",role:"pm",time:"2025-04-20T09:30:00Z"},
];
// ── NEW: BOQ (Bill of Quantities) per project ────────────────────────────────
const INIT_BOQ = {
  p1:[
    {id:"bq1",code:"1.1",description:"Earthwork excavation in foundation",category:"Civil",unit:"cum",qty:1850,rate:240,sort:1},
    {id:"bq2",code:"1.2",description:"PCC 1:4:8 below foundation",category:"Civil",unit:"cum",qty:120,rate:5400,sort:2},
    {id:"bq3",code:"2.1",description:"RCC M30 footings",category:"Civil",unit:"cum",qty:480,rate:8200,sort:3},
    {id:"bq4",code:"2.2",description:"TMT Fe500 reinforcement",category:"Civil",unit:"ton",qty:185,rate:71500,sort:4},
    {id:"bq5",code:"3.1",description:"Brickwork in superstructure",category:"Civil",unit:"cum",qty:920,rate:6800,sort:5},
    {id:"bq6",code:"4.1",description:"Internal plastering 12mm",category:"Finishing",unit:"sqm",qty:8400,rate:280,sort:6},
    {id:"bq7",code:"5.1",description:"Electrical conduit + wiring",category:"MEP",unit:"sqft",qty:21500,rate:185,sort:7},
    {id:"bq8",code:"5.2",description:"Plumbing GI pipes + fittings",category:"MEP",unit:"rmt",qty:1800,rate:420,sort:8},
  ],
  p2:[
    {id:"bq9",code:"1.1",description:"Site clearance and grading",category:"Civil",unit:"sqm",qty:6200,rate:85,sort:1},
    {id:"bq10",code:"2.1",description:"RCC M25 columns",category:"Civil",unit:"cum",qty:140,rate:7800,sort:2},
  ],
};
// ── NEW: Estimate (versioned client-facing quote on top of BOQ) ──────────────
const INIT_ESTIMATE = {
  p1:{markup:12,overhead:8,contingency:5,gst:18,note:"Initial estimate for client approval — premium fit-out included",version:1,updated:"2025-04-10"},
  p2:{markup:10,overhead:7,contingency:4,gst:18,note:"",version:1,updated:"2025-04-12"},
};
// ── NEW: Inventory ledger (inward / outward / GRN) ───────────────────────────
const INIT_LEDGER = {
  p1:[
    {id:"lg1",date:"2025-04-19",material:"TMT Steel Fe500",unit:"ton",qty:15,direction:"inward",source:"Vizag Steel",ref_no:"GRN-001",notes:"Inspected, no defects",by:"Ravi Kumar"},
    {id:"lg2",date:"2025-04-19",material:"TMT Steel Fe500",unit:"ton",qty:6,direction:"outward",source:"Floor 22 reinforcement",ref_no:"ISS-001",notes:"Issued to bar bender team",by:"Suresh Babu"},
    {id:"lg3",date:"2025-04-17",material:"Ready Mix Concrete M30",unit:"cum",qty:60,direction:"inward",source:"Ultratech RMC",ref_no:"GRN-002",notes:"Slump test passed",by:"Ravi Kumar"},
    {id:"lg4",date:"2025-04-17",material:"Ready Mix Concrete M30",unit:"cum",qty:58,direction:"outward",source:"Floor 21 slab pour",ref_no:"ISS-002",notes:"Used; 2 cum surplus returned",by:"Suresh Babu"},
    {id:"lg5",date:"2025-04-18",material:"Cement OPC 53",unit:"bag",qty:300,direction:"inward",source:"ACC Cement",ref_no:"GRN-003",notes:"",by:"Ravi Kumar"},
  ],
  p2:[
    {id:"lg6",date:"2025-04-18",material:"Cement OPC 53",unit:"bag",qty:300,direction:"inward",source:"ACC Cement",ref_no:"GRN-101",notes:"",by:"Mahesh Rao"},
  ],
};

const INIT_EQUIPMENT = {
  p1:[
    {id:"eq1",name:"Tower Crane TC-01",type:"Crane",reg_no:"TC-01",supplier:"Own",hired:false,status:"on_site",entry_date:"2024-12-15",exit_date:null,notes:"Annual inspection valid till Dec 2026",attachments:[]},
    {id:"eq2",name:"Concrete Pump CP-01",type:"Concrete Pump",reg_no:"TS07CD5678",supplier:"Hyd Equipment Rental",hired:true,status:"on_site",entry_date:"2025-01-10",exit_date:null,notes:"Operator assigned for slab pours",attachments:[]},
  ],
  p2:[],
};
const INIT_DIARY = {
  p1:[{id:"di1",date:"2025-04-20",weather:"Sunny 34C",visitors:"GHMC Inspector Mr. Reddy",instructions:"Ensure safety nets on floor 22 before next pour",work_done:"MEP conduit routing floors 14-16. Concrete pour floor 21. Safety audit.",workers_total:67,remarks:"Inspection passed. No non-compliance.",attachments:[]}],
  p2:[],
};
const INIT_WORKLOGS = {
  p1:[
    {id:"wl1",date:"2025-04-20",contractor:"Karthik Builders",location:"Floor 21 slab",work:"Concrete pour and finishing",workers:24,hours:9,status:"approved",attachments:[]},
    {id:"wl2",date:"2025-04-21",contractor:"Prime MEP",location:"Floors 14-16",work:"Electrical conduit routing",workers:12,hours:8,status:"submitted",attachments:[]},
  ],
  p2:[],
};
const INIT_CHECKLISTS = {
  p1:[
    {id:"cl1",title:"Foundation Inspection",type:"Quality",milestone_ref:"Foundation Complete",status:"passed",items:["Rebar spacing as per drawing","Cover blocks placed","Waterproofing applied"],checked_by:"Arjun Reddy",date:"2025-01-10",attachments:[]},
    {id:"cl2",title:"MEP Rough-in Inspection",type:"Quality",milestone_ref:"MEP Rough-In",status:"pending",items:["Conduit routes as per drawing","Pipe sizes correct","Pressure test passed"],checked_by:"",date:"",attachments:[]},
  ],
  p2:[],
};
const INIT_SUBMITTALS = {
  p1:[
    {id:"sub1",no:"SUB-001",title:"TMT Steel Mill Certificate",trade:"Structural",package:"Rebar",due_date:"2025-04-22",status:"approved",bic:"Architect",notes:"Approved for current batch",attachments:[]},
    {id:"sub2",no:"SUB-002",title:"Facade Glass Sample",trade:"Facade",package:"Exterior",due_date:"2025-05-05",status:"submitted",bic:"Architect",notes:"Sample board pending review",attachments:[]},
  ],
  p2:[],
};
const INIT_PERMITS = {
  p1:[
    {id:"per1",title:"GHMC Work Permit",authority:"GHMC",status:"approved",due_date:"2024-10-25",expiry:"2026-06-30",notes:"Main construction permit",attachments:[]},
    {id:"per2",title:"Fire NOC Renewal",authority:"Fire Department",status:"pending",due_date:"2025-05-15",expiry:"",notes:"Submit updated fire drawings",attachments:[]},
  ],
  p2:[],
};
const INIT_MESSAGES = {
  p1:[
    {id:"msg1",by:"Priya Sharma",role:"pm",text:"Floor 21 pour completed. Uploaded photos in site update.",time:"2025-04-20T11:00:00Z",attachments:[]},
    {id:"msg2",by:"Karthik Builders",role:"contractor",text:"Need confirmation on B-14 reinforcement before bar bending.",time:"2025-04-20T14:30:00Z",attachments:[]},
  ],
  p2:[],
};
const EXPENSE_CATS = ["Materials","Labour","Equipment","Misc","Consultancy","Permits"];
const VENDOR_CATS = ["Steel","Cement","Concrete","Electrical","Plumbing","Tiles","Paint","Glass","Wood","Sand","Aggregate","Tools","Other"];
const TRADES = ["Mason","Helper","Carpenter","Electrician","Plumber","Painter","Welder","Steel Fixer","Tile Worker","Operator"];
const PUNCH_TRADES = ["Carpentry","Painting","Plumbing","Electrical","Tiling","Glazing","HVAC","Civil","Other"];
const DRAW_TYPES = ["Architectural","Structural","MEP","Civil","Landscape","Interior","Electrical"];
const ROLES_LIST = ["Site Engineer","Foreman","Safety Officer","Electrician","Plumber","Mason","Carpenter","Supervisor"];
const SEV_COLOR = {high:{bg:"bg-red-50",text:"text-red-600",border:"border-red-200",dot:"bg-red-500"},medium:{bg:"bg-amber-50",text:"text-amber-700",border:"border-amber-200",dot:"bg-amber-400"},low:{bg:"bg-blue-50",text:"text-blue-600",border:"border-blue-200",dot:"bg-blue-400"}};
const MAT_STATUS = {received:{bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200"},expected:{bg:"bg-blue-50",text:"text-blue-600",border:"border-blue-200"},rejected:{bg:"bg-red-50",text:"text-red-600",border:"border-red-200"}};
const CAT_COLORS = {Materials:"bg-blue-50 text-blue-600",Labour:"bg-violet-50 text-violet-600",Equipment:"bg-amber-50 text-amber-600",Misc:"bg-slate-100 text-slate-500",Consultancy:"bg-emerald-50 text-emerald-600",Permits:"bg-orange-50 text-orange-600"};
const ATT_STATUS = {present:{label:"Present",bg:"bg-emerald-100",text:"text-emerald-700"},absent:{label:"Absent",bg:"bg-red-100",text:"text-red-600"},half_day:{label:"Half Day",bg:"bg-amber-100",text:"text-amber-700"}};
const ACTIVITY_ICONS = {update:"hardhat",issue:"alert",milestone:"flag",material:"truck",drawing:"doc",expense:"wallet",team:"users",general:"bell"};
const CHART_COLORS = ["#f97316","#3b82f6","#10b981","#8b5cf6","#f59e0b","#ef4444"];
const TAB_LABELS = {fieldops:"Field Ops",approvals:"Approvals",changeorders:"Change Orders",punchlist:"Punch List",rabills:"RA Bills",po:"PO",rfi:"RFI",ai:"AI",map:"Map",boq:"BOQ",ledger:"Stock Ledger",estimate:"Estimate"};
const BOQ_UNITS = ["cum","sqm","sqft","kg","ton","nos","rmt","ltr","bag","trip"];
const LEDGER_DIRS = {inward:{label:"Inward",bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200"},outward:{label:"Outward",bg:"bg-amber-50",text:"text-amber-700",border:"border-amber-200"},return:{label:"Return",bg:"bg-blue-50",text:"text-blue-700",border:"border-blue-200"},wastage:{label:"Wastage",bg:"bg-red-50",text:"text-red-700",border:"border-red-200"}};

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

// ── Daily Report (DPR) generator — Powerplay/Raken parity for India market ───
// Builds an editorial-styled HTML PDF from today's site data.
// Returns the HTML string so callers can open print dialog OR upload to share.
const buildDPR = (proj, opts) => {
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

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${proj.name} — DPR ${today}</title>
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
    <div class="meta">Generated ${new Date().toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}<br/>Confidential — for ${proj.client_name||"project stakeholders"}</div>
  </div>

  <div class="pre-rule">— ${dispDate}</div>
  <h1>${proj.name}</h1>
  <div style="font-size:13px;color:#78716c;margin-top:6px;">${proj.location||""}</div>

  <div class="metrics">
    <div class="metric"><div class="label">Workers</div><div class="value"><strong>${totalWorkers||"—"}</strong></div></div>
    <div class="metric"><div class="label">Updates</div><div class="value"><strong>${todayUpdates.length}</strong></div></div>
    <div class="metric"><div class="label">New Issues</div><div class="value"><strong>${newIssues.length}</strong><span style="font-size:14px;color:#78716c;"> / ${openIssues.length} open</span></div></div>
    <div class="metric"><div class="label">Progress</div><div class="value"><strong>${proj.progress||0}</strong>%</div></div>
  </div>

  <section>
    <div class="pre-rule">— Field</div>
    <h2>Today's site activity</h2>
    ${todayUpdates.length===0?'<div class="empty">No updates recorded for today.</div>':todayUpdates.map(u=>`
      <div class="row">
        <div class="label">${u.weather||"site notes"}</div>
        <p class="text">"${u.notes}"</p>
        ${u.workers_count?`<div class="meta">${u.workers_count} workers on site</div>`:""}
      </div>
    `).join("")}
  </section>

  ${photos.length>0?`<section>
    <div class="pre-rule">— Photo log</div>
    <h2>${photos.length} photos from today</h2>
    <div class="photo-grid">${photos.map(p=>`<img src="${p.url}" alt=""/>`).join("")}</div>
  </section>`:""}

  <section>
    <div class="pre-rule">— Quality</div>
    <h2>Issues reported today (${newIssues.length})</h2>
    ${newIssues.length===0?'<div class="empty">No new issues today. All open: '+openIssues.length+'.</div>':newIssues.map(i=>`
      <div class="row">
        <span class="pill pill-${i.severity==="high"?"high":i.severity==="medium"?"med":"low"}">${i.severity}</span>
        <span class="text" style="font-weight:600;">${i.title}</span>
        <div class="meta">Reported by ${i.reported_by||"—"}</div>
      </div>
    `).join("")}
  </section>

  ${todayMats.length>0?`<section>
    <div class="pre-rule">— Inward</div>
    <h2>Material deliveries today</h2>
    ${todayMats.map(m=>`
      <div class="row">
        <span class="pill pill-amber">${m.status}</span>
        <span class="text" style="font-weight:600;">${m.material}</span>
        <span style="color:#b45309;font-weight:600;"> — ${m.quantity||""}</span>
        <div class="meta">${m.supplier||""}</div>
      </div>
    `).join("")}
  </section>`:""}

  ${todayWorklogs.length>0?`<section>
    <div class="pre-rule">— Worklogs</div>
    <h2>Contractor worklogs (${todayWorklogs.length})</h2>
    ${todayWorklogs.map(w=>`
      <div class="row">
        <div class="label">${w.contractor||"contractor"} · ${w.location||""}</div>
        <p class="text">${w.work}</p>
        <div class="meta">${w.workers} workers · ${w.hours} hrs · ${w.status}</div>
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

  <div class="footer">— SiteTrack Pro · Construction Suite · ${proj.name} —</div>

  </body></html>`;
};

// Open in a new window and trigger print. Caller can also use the HTML for upload.
const exportDPR = (proj, opts) => {
  const html = buildDPR(proj, opts);
  const w = window.open("","_blank");
  if(!w){ alert("Pop-ups blocked — please allow pop-ups to generate the Daily Report."); return; }
  w.document.write(html); w.document.close();
  setTimeout(()=>w.print(), 700);
};

// Build a WhatsApp-friendly text summary (the link goes to the share page; PDF
// generation is via print-to-PDF on the open window).
const buildDPRWhatsAppText = (proj, opts) => {
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
    whatsapp:<svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={c}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.8-.4-1.6-.9-2.2-1.5-.4-.4-.8-.9-1-1.4-.1-.2 0-.4.1-.5.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.1.1-.3 0-.5L9.9 8c-.1-.4-.3-.4-.5-.4h-.4c-.2 0-.5.1-.7.3-.7.7-1.1 1.6-1.1 2.6.1 1.1.5 2.1 1.2 3 .9 1.3 2.1 2.5 3.5 3.2.5.2.9.4 1.4.5h1c.5-.1 1.6-.6 1.8-1.3.2-.4.2-.8 0-1.2 0-.1-.2-.1-.5-.3M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.4 5L2 22l5.1-1.3c4.8 2.6 10.9.8 13.5-4S20 5.7 15.2 3.1c-1-.5-2-.9-3.2-1.1M12 20.1c-1.6 0-3.2-.4-4.6-1.3l-.3-.2-3 .8.8-2.9-.2-.3C2.4 12.5 3.8 7.7 7.7 5.3s8.7-1 11.1 2.9 1 8.7-2.9 11.1c-1.2.8-2.7 1.2-4 1.2"/></svg>,
    clipboard:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>,
    helmet:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a8 8 0 0 0-16 0v3z"/><line x1="2" y1="19" x2="22" y2="19"/></svg>,
    fileEdit:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><polyline points="14 2 14 8 20 8"/><path d="M18.4 14.6a2.1 2.1 0 0 1 3 3L17 22l-4 1 1-4Z"/></svg>,
    receipt:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>,
    globe:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    qa:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>,
    msgcircle:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
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

const ATTACH_ACCEPT = ".pdf,.dwg,.dxf,.rvt,.ifc,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.svg,.gif,.zip,.rar";
const DRAWING_ACCEPT = ".pdf,.dwg,.dxf,.rvt,.ifc,.png,.jpg,.jpeg,.svg,.zip,.rar";
const fileKind = name => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  if(["png","jpg","jpeg","webp","gif","svg"].includes(ext)) return "image";
  if(ext === "pdf") return "pdf";
  if(["dwg","dxf","rvt","ifc"].includes(ext)) return "cad";
  if(["doc","docx"].includes(ext)) return "doc";
  if(["xls","xlsx","csv"].includes(ext)) return "sheet";
  if(["zip","rar"].includes(ext)) return "archive";
  return "file";
};
const fmtSize = n => {
  if(!n) return "0 KB";
  if(n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
const attachmentIcon = kind => ({image:"image",pdf:"doc",cad:"gantt",doc:"doc",sheet:"receipt",archive:"folder",file:"doc"}[kind] || "doc");
const readAttachment = file => new Promise((resolve,reject)=>{
  const r = new FileReader();
  r.onload = ev => resolve({id:`att_${Date.now()}_${Math.random().toString(16).slice(2)}`,name:file.name,size:file.size,type:file.type,kind:fileKind(file.name),dataUrl:ev.target.result,uploaded_at:new Date().toISOString()});
  r.onerror = reject;
  r.readAsDataURL(file);
});
function AttachmentInput({files=[],onChange,label="Upload files",accept=ATTACH_ACCEPT,maxMb=20}){
  const inputRef=useRef(null);const[drag,setDrag]=useState(false);
  const addFiles=async list=>{
    const picked=Array.from(list||[]);
    const ok=picked.filter(f=>{
      if(f.size>maxMb*1024*1024){alert(`${f.name} is larger than ${maxMb}MB`);return false;}
      return true;
    });
    if(!ok.length)return;
    const next=await Promise.all(ok.map(readAttachment));
    onChange([...(files||[]),...next]);
  };
  const remove=id=>onChange((files||[]).filter(f=>(f.id||f.name)!==id));
  return(
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple accept={accept} onChange={e=>{addFiles(e.target.files);e.target.value="";}} className="hidden"/>
      <button
        type="button"
        onClick={()=>inputRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files);}}
        className={`w-full border-2 border-dashed rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${drag?"border-orange-400 bg-orange-50 text-orange-600":"border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600"}`}
      >
        <Ic n="download" s={15}/>{label}{files?.length?` (${files.length})`:""}
      </button>
      {files?.length>0&&<div className="space-y-2">{files.map(f=><div key={f.id||f.name} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100"><div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500"><Ic n={attachmentIcon(f.kind)} s={14}/></div><div className="flex-1 min-w-0"><div className="text-xs font-bold text-slate-700 truncate">{f.name}</div><div className="text-[10px] text-slate-400">{fmtSize(f.size)}</div></div><button type="button" onClick={()=>remove(f.id||f.name)} className="text-slate-300 hover:text-red-400"><Ic n="x" s={14}/></button></div>)}</div>}
    </div>
  );
}
function AttachmentList({files=[]}){
  const list=files||[];
  if(!list.length)return null;
  return(
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><Ic n="doc" s={12}/>Attachments ({list.length})</div>
      <div className="grid sm:grid-cols-2 gap-2">{list.map((f,i)=><div key={f.id||`${f.name}_${i}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100"><div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 overflow-hidden">{f.kind==="image"&&f.dataUrl?<img src={f.dataUrl} alt="" className="w-full h-full object-cover"/>:<Ic n={attachmentIcon(f.kind)} s={14}/>}</div><div className="flex-1 min-w-0"><div className="text-xs font-bold text-slate-700 truncate">{f.name}</div><div className="text-[10px] text-slate-400">{fmtSize(f.size)}</div></div>{f.dataUrl&&<a href={f.dataUrl} download={f.name} className="text-xs font-bold text-orange-600 hover:text-orange-700">Download</a>}</div>)}</div>
    </div>
  );
}

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
    {key:"superadmin",label:"Super Admin (Operations)",sub:"Multi-tenant — all orgs, users, billing, system settings",ini:"RB",col:"slate",perms:["All Orgs","User Management","Billing","System Settings","Impersonate"]},
    {key:"architect",label:"Architect / Org Admin",sub:"Within one org — drawings, team, exports, activity feed",ini:"AR",col:"orange",perms:["Release Drawings","Manage Everything","View All Activity","Export & Share"]},
    {key:"pm",label:"Project Manager",sub:"Field operations — updates, attendance, issues, materials",ini:"PS",col:"blue",perms:["Add Site Updates","Mark Attendance","Report Issues","Material Logs"]},
    {key:"contractor",label:"Contractor",sub:"Worklogs, RFIs, RA bills, and field documents",ini:"KB",col:"violet",perms:["Worklogs","RFIs","RA Bills","Field Uploads"]},
    {key:"client",label:"Client",sub:"Read-only — progress, milestones, released drawings",ini:"VN",col:"emerald",perms:["View Progress","View Milestones","Released Drawings","Updates"]},
  ];
  const selected=roles.find(r=>r.key===role);
  return(
    <div className="min-h-screen bg-cream flex relative overflow-hidden">
      {/* Toggle dark */}
      <button onClick={toggleDark} className="absolute top-5 right-5 z-20 text-ink-500 hover:text-ink-900 p-2 rounded-xl bg-white shadow-editorial"><Ic n={dark?"sun2":"moon"} s={16}/></button>

      {/* LEFT — Editorial hero (hidden on mobile) */}
      <div className="hidden md:flex w-1/2 relative bg-ink-900 text-cream overflow-hidden">
        {/* Refined grid overlay */}
        <div className="absolute inset-0 opacity-[0.06]" style={{backgroundImage:"linear-gradient(rgba(245,158,11,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(245,158,11,.5) 1px,transparent 1px)",backgroundSize:"56px 56px"}}/>
        {/* Warm radial glows */}
        <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full" style={{background:"radial-gradient(circle, rgba(217,119,6,.22) 0%, transparent 65%)"}}/>
        <div className="absolute -bottom-20 -right-20 w-[28rem] h-[28rem] rounded-full" style={{background:"radial-gradient(circle, rgba(245,158,11,.16) 0%, transparent 65%)"}}/>

        <div className="relative z-10 flex flex-col justify-between p-12 lg:p-16 w-full">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg"><Ic n="hardhat" s={22} c="text-white"/></div>
            <div>
              <div className="font-display text-2xl font-bold tracking-editorial leading-none">SiteTrack</div>
              <div className="text-[10px] font-semibold tracking-[0.32em] uppercase text-gradient-gold mt-1">Construction Suite</div>
            </div>
          </div>

          {/* Editorial headline */}
          <div className="max-w-md">
            <div className="text-[10px] font-bold tracking-[0.32em] uppercase text-amber-500 mb-5">— Issue 01 · 2026</div>
            <h1 className="font-display text-5xl lg:text-6xl font-light leading-[1.05] tracking-editorial">
              Every site,<br/>every drawing,<br/><em className="text-gradient-gold font-medium not-italic">one quiet record.</em>
            </h1>
            <p className="text-cream/70 mt-6 text-sm leading-relaxed max-w-sm">
              An editorial-grade construction record for architects, project managers, contractors and their clients. Built for the field, trusted in the office.
            </p>
          </div>

          {/* Footer pull-quote */}
          <div className="border-t border-cream/10 pt-6 max-w-md">
            <p className="font-display italic text-sm text-cream/70 leading-relaxed">
              "Spashtam ga cheppali — every change should say what is changing, why it is needed, and how it will be checked."
            </p>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-500/80 mt-3">SiteTrack agent operating guide</div>
          </div>
        </div>
      </div>

      {/* RIGHT — Login panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 lg:p-14">
        <div className={`w-full max-w-md transition-all duration-500 ${anim?"opacity-0 translate-y-2":"opacity-100 translate-y-0"}`}>
          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center"><Ic n="hardhat" s={20} c="text-white"/></div>
            <div className="font-display text-2xl font-bold text-ink-900 tracking-editorial leading-none">SiteTrack</div>
          </div>

          <div className="mb-8">
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-3">Sign in</div>
            <h2 className="font-display text-4xl md:text-5xl font-light leading-tight tracking-editorial text-ink-900">
              Welcome back.
            </h2>
            <p className="text-ink-600 text-sm mt-3 leading-relaxed">Select your role — permissions and visible modules are applied automatically.</p>
          </div>

          {/* Role tiles */}
          <div className="space-y-2.5 mb-7">
            {roles.map(r=>(
              <button key={r.key} onClick={()=>setRole(r.key)} className={`w-full text-left rounded-2xl border transition-all overflow-hidden ${role===r.key?"border-amber-600 bg-white shadow-editorial-hover":"border-stone-200 bg-white/60 hover:bg-white hover:border-stone-300"}`}>
                <div className="flex items-center gap-4 p-4">
                  <Av i={r.ini} col={r.col}/>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base font-semibold text-ink-900 leading-tight">{r.label}</div>
                    <div className="text-xs text-ink-500 mt-1 leading-relaxed">{r.sub}</div>
                  </div>
                  {role===r.key&&<div className="w-6 h-6 rounded-full bg-gradient-gold flex items-center justify-center flex-shrink-0"><Ic n="check" s={13} c="text-white"/></div>}
                </div>
                {role===r.key&&<div className="px-4 pb-4"><div className="flex flex-wrap gap-1.5 pt-3 border-t border-stone-100">
                  {r.perms.map(p=><span key={p} className="text-[10px] font-semibold tracking-wider uppercase bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full">{p}</span>)}
                </div></div>}
              </button>
            ))}
          </div>

          {/* CTA */}
          <button onClick={()=>{setAnim(true);setTimeout(()=>onLogin(MOCK_USERS[role]),420);}} className="w-full py-4 bg-gradient-gold text-white font-bold rounded-2xl text-sm tracking-wide transition-all hover:shadow-editorial-deep flex items-center justify-center gap-2">
            Continue as {selected?.label}
            <span aria-hidden>→</span>
          </button>

          <p className="text-[11px] text-ink-500 mt-6 text-center leading-relaxed">
            Demo mode — data lives in your browser. Production launches with backend auth · See <span className="font-semibold text-ink-700">docs/BACKEND_PLAN.md</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Drawing Markup Modal (canvas overlay on image) ───────────────────────────
function MarkupModal({open, imageUrl, sourceName, onClose, onSave}){
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [strokes, setStrokes] = useState([]);   // [{color, width, points:[{x,y}]}]
  const [color, setColor] = useState("#dc2626"); // red default
  const [width, setWidth] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    if (!open) { setStrokes([]); setDrawing(false); setImgReady(false); }
  }, [open]);

  const COLORS = [
    {hex:"#dc2626", label:"Red"},
    {hex:"#d97706", label:"Amber"},
    {hex:"#2563eb", label:"Blue"},
    {hex:"#1c1917", label:"Ink"},
  ];

  const redraw = () => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  };

  useEffect(() => { redraw(); }, [strokes]);

  const onImgLoad = () => {
    const img = imgRef.current; const cv = canvasRef.current;
    if (!img || !cv) return;
    // Match canvas to displayed image size
    cv.width = img.clientWidth;
    cv.height = img.clientHeight;
    setImgReady(true);
  };

  const getPos = e => {
    const cv = canvasRef.current; const rect = cv.getBoundingClientRect();
    const t = e.touches?.[0] || e.changedTouches?.[0];
    const x = (t?.clientX ?? e.clientX) - rect.left;
    const y = (t?.clientY ?? e.clientY) - rect.top;
    return { x, y };
  };

  const start = e => {
    e.preventDefault();
    const p = getPos(e);
    setStrokes(prev => [...prev, { color, width, points: [p] }]);
    setDrawing(true);
  };
  const move = e => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    setStrokes(prev => {
      const last = prev[prev.length - 1];
      const updated = { ...last, points: [...last.points, p] };
      return [...prev.slice(0, -1), updated];
    });
  };
  const end = () => setDrawing(false);

  const undo = () => setStrokes(p => p.slice(0, -1));
  const clear = () => { if (strokes.length === 0 || window.confirm("Clear all markups?")) setStrokes([]); };

  const save = () => {
    const img = imgRef.current;
    if (!img || strokes.length === 0) { alert("Add at least one markup stroke before saving."); return; }
    // Render image + strokes to a single canvas at natural image resolution
    const exportCv = document.createElement("canvas");
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    exportCv.width = img.naturalWidth;
    exportCv.height = img.naturalHeight;
    const ctx = exportCv.getContext("2d");
    ctx.drawImage(img, 0, 0, exportCv.width, exportCv.height);
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * Math.max(scaleX, scaleY);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const sx = p.x * scaleX, sy = p.y * scaleY;
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    const dataUrl = exportCv.toDataURL("image/png");
    onSave({
      id: `att_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: `${(sourceName||"drawing").replace(/\.[^.]+$/, "")}-markup-${Date.now()}.png`,
      size: Math.round(dataUrl.length * 0.75),
      type: "image/png",
      kind: "image",
      dataUrl,
      url: dataUrl,
      uploaded_at: new Date().toISOString(),
      markup_of: sourceName || "",
      strokes_count: strokes.length,
    });
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="bg-white rounded-2xl shadow-editorial-deep max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col" style={{border:"1px solid var(--st-line)"}}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700">— Drawing markup</div>
            <h3 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Markup &amp; annotate</h3>
          </div>
          <button onClick={onClose}><Ic n="x" s={22} c="text-ink-500"/></button>
        </div>
        {/* Tools */}
        <div className="flex items-center gap-3 px-6 py-3 flex-wrap bg-cream-200/40" style={{borderBottom:"1px solid var(--st-line)"}}>
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-ink-500">Color</span>
          {COLORS.map(c => (
            <button key={c.hex} onClick={()=>setColor(c.hex)} title={c.label} className={`w-7 h-7 rounded-full border-2 transition-all ${color===c.hex?"scale-110 border-ink-900":"border-stone-300"}`} style={{backgroundColor:c.hex}}/>
          ))}
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-ink-500 ml-3">Width</span>
          {[2,4,8].map(w => (
            <button key={w} onClick={()=>setWidth(w)} className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center ${width===w?"border-amber-600 bg-amber-50":"border-stone-200 bg-white"}`}>
              <div className="rounded-full bg-ink-900" style={{width:w*1.5,height:w*1.5}}/>
            </button>
          ))}
          <div className="flex-1"/>
          <button onClick={undo} disabled={strokes.length===0} className="px-3 py-2 text-xs font-semibold rounded-lg bg-white text-ink-700 disabled:opacity-40" style={{border:"1px solid var(--st-line)"}}>↶ Undo</button>
          <button onClick={clear} disabled={strokes.length===0} className="px-3 py-2 text-xs font-semibold rounded-lg bg-white text-ink-700 disabled:opacity-40" style={{border:"1px solid var(--st-line)"}}>Clear</button>
          <button onClick={save} className="px-5 py-2 bg-gradient-gold text-white font-bold rounded-lg text-xs tracking-wide flex items-center gap-1.5"><Ic n="download" s={13}/>Save markup</button>
        </div>
        {/* Canvas + image */}
        <div className="flex-1 overflow-auto p-6 bg-ink-900/5 flex items-center justify-center">
          <div className="relative inline-block max-w-full">
            <img ref={imgRef} src={imageUrl} alt="drawing" onLoad={onImgLoad} className="max-w-full max-h-[68vh] block select-none" draggable="false"/>
            {imgReady&&<canvas
              ref={canvasRef}
              className="absolute inset-0 cursor-crosshair touch-none"
              onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
              onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            />}
          </div>
        </div>
        <div className="px-6 py-3 text-[11px] text-ink-500 text-center" style={{borderTop:"1px solid var(--st-line)"}}>{strokes.length} stroke{strokes.length===1?"":"s"} · Markup saves as a new image attachment linked to this drawing.</div>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({user,active,setView,uc,ac,mobileOpen,setMobileOpen}){
  const allItems=[
    // Admin-only nav (only visible when role is superadmin)
    {id:"admin-dashboard",icon:"shield",label:"Admin Console",group:"admin"},
    {id:"admin-orgs",icon:"building",label:"Organizations",group:"admin"},
    {id:"admin-users",icon:"users",label:"Users",group:"admin"},
    {id:"admin-billing",icon:"wallet",label:"Billing & MRR",group:"admin"},
    {id:"admin-settings",icon:"sliders",label:"System Settings",group:"admin"},
    // Tenant nav (visible to all roles per their PERMS.nav)
    {id:"dashboard",icon:"dashboard",label:"Dashboard"},
    {id:"projects",icon:"folder",label:"Projects"},
    {id:"calendar",icon:"calendar",label:"Calendar"},
    {id:"vendors",icon:"truck",label:"Vendors"},
    {id:"po",icon:"clipboard",label:"Purchase Orders"},
    {id:"analytics",icon:"barChart",label:"Analytics"},
    {id:"activity",icon:"activity",label:"Activity",badge:ac},
    {id:"pm",icon:"users",label:"PM View"},
    {id:"client",icon:"eye",label:"Client Portal"},
    {id:"messages",icon:"msgcircle",label:"Messages"},
    {id:"notifications",icon:"bell",label:"Updates",badge:uc},
  ];
  const items=allItems.filter(i=>PERMS[user.role].nav.includes(i.id));
  const adminItems=items.filter(i=>i.group==="admin");
  const tenantItems=items.filter(i=>i.group!=="admin");
  const rm=ROLE_META[user.role];
  return(
    <>
      {mobileOpen&&<div className="fixed inset-0 z-30 bg-ink-900/60 backdrop-blur-sm md:hidden" onClick={()=>setMobileOpen(false)}/>}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 w-64 h-screen md:h-full flex flex-col transform transition-transform duration-300 flex-shrink-0 ${mobileOpen?"translate-x-0":"-translate-x-full"} md:translate-x-0`} style={{backgroundColor:"#1c1917",borderRight:"1px solid rgba(217,119,6,.12)"}}>
        {/* Refined warm glow */}
        <div className="absolute top-0 left-0 w-full h-40 pointer-events-none" style={{background:"radial-gradient(ellipse at top left, rgba(217,119,6,.10) 0%, transparent 70%)"}}/>

        <div className="relative p-6 flex items-center justify-between" style={{borderBottom:"1px solid rgba(255,251,235,.06)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-gold flex items-center justify-center shadow-md"><Ic n="hardhat" s={18} c="text-white"/></div>
            <div>
              <div className="font-display text-lg font-bold text-cream leading-none tracking-editorial">SiteTrack</div>
              <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-gradient-gold mt-1">Construction</div>
            </div>
          </div>
          <button onClick={()=>setMobileOpen(false)} className="md:hidden text-cream/60 hover:text-cream"><Ic n="x" s={20}/></button>
        </div>

        <div className="px-5 mt-5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold tracking-[0.18em] uppercase" style={{backgroundColor:"rgba(217,119,6,.10)",color:"#f59e0b",border:"1px solid rgba(217,119,6,.2)"}}><Ic n="shield" s={11}/>{rm.label}</div>
        </div>

        <nav className="relative flex-1 p-4 mt-2 space-y-0.5 overflow-y-auto">
          {adminItems.length>0&&<>
            <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-amber-500/70 px-3.5 mb-1.5 mt-1">— Operations</div>
            {adminItems.map(it=>{
              const isActive=active===it.id;
              return(
                <button key={it.id} onClick={()=>{setView(it.id);setMobileOpen(false);}} className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all ${isActive?"text-ink-900 font-semibold":"text-cream/65 hover:text-cream font-medium"}`} style={isActive?{background:"linear-gradient(180deg, #f59e0b, #d97706)",boxShadow:"0 4px 14px rgba(217,119,6,.35)"}:{}}>
                  <Ic n={it.icon} s={16}/>
                  <span className="tracking-[0.01em]">{it.label}</span>
                </button>
              );
            })}
            <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-cream/40 px-3.5 mt-4 mb-1.5">— Tenant view</div>
          </>}
          {tenantItems.map(it=>{
            const isActive=active===it.id;
            return(
              <button key={it.id} onClick={()=>{setView(it.id);setMobileOpen(false);}} className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all ${isActive?"text-ink-900 font-semibold":"text-cream/65 hover:text-cream font-medium"}`} style={isActive?{background:"linear-gradient(180deg, #f59e0b, #d97706)",boxShadow:"0 4px 14px rgba(217,119,6,.35)"}:{}}>
                <Ic n={it.icon} s={16}/>
                <span className="tracking-[0.01em]">{it.label}</span>
                {it.badge>0&&<span className={`ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive?"bg-ink-900/20 text-ink-900":"bg-amber-500 text-white"}`}>{it.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="relative p-4" style={{borderTop:"1px solid rgba(255,251,235,.06)"}}>
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{backgroundColor:"rgba(255,251,235,.04)"}}>
            <Av i={user.avatar} sz="sm" col={rm.col}/>
            <div className="flex-1 min-w-0">
              <div className="text-cream text-sm font-semibold truncate font-display tracking-editorial">{user.name}</div>
              <div className="text-cream/50 text-[11px] truncate">{user.email}</div>
            </div>
            <button onClick={()=>setView("logout")} className="text-cream/40 hover:text-cream"><Ic n="logout" s={15}/></button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function DashboardView({user,projects,updates,issues,activity,setView,setSP}){
  const mp=visibleProjectsForUser(projects,user);
  const visibleIds=new Set(mp.map(p=>p.id));
  const openIssues=Object.entries(issues).flatMap(([pid,arr])=>visibleIds.has(pid)?arr:[]).filter(i=>i.status==="open");
  const highIssues=openIssues.filter(i=>i.severity==="high");
  const unreadAc=activity.filter(a=>!a.read).length;
  const ru=Object.entries(updates).flatMap(([pid,arr])=>visibleIds.has(pid)?(arr||[]).map(u=>({...u,pname:projects.find(p=>p.id===pid)?.name||"Project"})):[]).slice(0,2);
  const greet=new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening";
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      {/* Editorial header */}
      <div className="mb-10 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-3">— {new Date().toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric"})}</div>
          <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 tracking-editorial leading-[1.05]">
            Good {greet},<br/><em className="font-medium not-italic text-gradient-gold">{user.name.split(" ")[0]}.</em>
          </h1>
          <p className="text-ink-600 text-sm mt-4 max-w-md leading-relaxed">Your construction overview at a glance — projects, issues, and what needs your attention.</p>
        </div>
      </div>

      {highIssues.length>0&&user.role!=="client"&&(
        <div className="mb-5 bg-red-50 border-l-4 border-red-500 rounded-r-2xl p-5 flex items-center gap-4 shadow-editorial">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="alert" s={18} c="text-red-600"/></div>
          <div className="flex-1"><div className="font-display font-semibold text-red-800 text-base tracking-editorial">{highIssues.length} High Severity Issues Need Attention</div><div className="text-red-600 text-xs mt-1">{highIssues.map(i=>i.title).slice(0,2).join(" · ")}</div></div>
          <button onClick={()=>setView("projects")} className="text-red-700 font-bold text-xs tracking-wider uppercase hover:underline">View →</button>
        </div>
      )}
      {user.role==="architect"&&unreadAc>0&&(
        <div className="mb-5 bg-amber-50 border-l-4 border-amber-500 rounded-r-2xl p-5 flex items-center gap-4 shadow-editorial">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="activity" s={18} c="text-amber-700"/></div>
          <div className="flex-1"><div className="font-display font-semibold text-amber-900 text-base tracking-editorial">{unreadAc} new team activities</div><div className="text-amber-700 text-xs mt-1">PM and contractor actions need your review</div></div>
          <button onClick={()=>setView("activity")} className="text-amber-800 font-bold text-xs tracking-wider uppercase hover:underline">Review →</button>
        </div>
      )}

      {/* Stat cards — editorial layout */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <SC icon="folder" label="Total Projects" value={mp.length} accent="blue"/>
        <SC icon="building" label="Active" value={mp.filter(p=>p.status==="active").length} accent="orange"/>
        <SC icon="check" label="Completed" value={mp.filter(p=>p.status==="completed").length} accent="emerald"/>
        {user.role!=="client"?<SC icon="alert" label="Open Issues" value={openIssues.length} sub={highIssues.length>0?`${highIssues.length} high priority`:""} accent={highIssues.length>0?"red":"violet"}/>:<SC icon="hardhat" label="On Hold" value={mp.filter(p=>p.status==="on_hold").length} accent="violet"/>}
      </div>

      {/* Active projects — editorial cards */}
      <div className="mb-10">
        <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Portfolio</div>
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Active Projects</h2>
          </div>
          <button onClick={()=>setView("projects")} className="text-amber-700 text-xs font-bold tracking-[0.18em] uppercase hover:text-amber-900">View all →</button>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {mp.filter(p=>p.status==="active").map(p=>(
            <button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="group relative bg-white rounded-2xl p-6 text-left transition-all hover:shadow-editorial-hover" style={{border:"1px solid var(--st-line)"}}>
              {/* Top gold rule on hover */}
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-gold opacity-0 group-hover:opacity-100 transition-opacity"/>
              <div className="flex items-start justify-between mb-5">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-1.5">{p.status==="active"?"In progress":p.status}</div>
                  <h3 className="font-display text-xl font-semibold text-ink-900 group-hover:text-amber-800 tracking-editorial leading-tight">{p.name}</h3>
                  <div className="flex items-center gap-1.5 text-ink-500 text-xs mt-2"><Ic n="map" s={12}/>{p.location}</div>
                </div>
                <Badge status={p.status}/>
              </div>
              <div className="mb-2 flex justify-between items-baseline">
                <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">Progress</span>
                <span className="font-display font-semibold text-ink-900 text-lg">{p.progress}<span className="text-ink-500 text-sm">%</span></span>
              </div>
              <PBar v={p.progress}/>
              <div className="mt-5 flex justify-between text-xs text-ink-500" style={{borderTop:"1px solid var(--st-line)",paddingTop:"1rem"}}>
                <span className="font-medium">{p.client_name}</span>
                <span>Due {fmtDate(p.expected_end_date)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent updates */}
      {ru.length>0&&<div>
        <div className="flex items-end justify-between mb-5 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Field</div>
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Recent Updates</h2>
          </div>
        </div>
        <div className="space-y-3">{ru.map(u=>
          <div key={u.id} className="bg-white rounded-2xl p-5 flex gap-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="hardhat" s={18} c="text-amber-700"/></div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-ink-900 text-base tracking-editorial">{u.pname}</div>
              <p className="text-ink-600 text-sm mt-1 line-clamp-2 leading-relaxed">{u.notes}</p>
              <div className="flex gap-4 mt-3 text-xs text-ink-500">
                <span className="flex items-center gap-1.5"><Ic n="calendar" s={11}/>{fmtDate(u.update_date)}</span>
                {u.workers_count&&<span className="flex items-center gap-1.5"><Ic n="users" s={11}/>{u.workers_count} workers</span>}
              </div>
            </div>
          </div>
        )}</div>
      </div>}
    </div>
  );
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────
function ProjectsView({user,projects,setView,setSP}){
  const[q,setQ]=useState("");const[sf,setSF]=useState("all");const[showFilt,setShowFilt]=useState(false);
  const[minP,setMinP]=useState(0);const[sortBy,setSortBy]=useState("name");
  const fl=useMemo(()=>visibleProjectsForUser(projects,user).filter(p=>sf==="all"||p.status===sf).filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.location.toLowerCase().includes(q.toLowerCase())||p.client_name.toLowerCase().includes(q.toLowerCase())).filter(p=>p.progress>=minP).sort((a,b)=>sortBy==="progress"?b.progress-a.progress:sortBy==="budget"?b.budget-a.budget:a.name.localeCompare(b.name)),[projects,user,q,sf,minP,sortBy]);
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Portfolio</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Projects</h1>
          <p className="text-ink-500 text-sm mt-2">{fl.length} {fl.length===1?"project":"projects"} found</p>
        </div>
        {can(user,"createProject")&&<button onClick={()=>setView("create")} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm transition-all hover:shadow-editorial-deep tracking-wide"><Ic n="plus" s={16}/>New Project</button>}
      </div>
      <div className="flex gap-2 mb-4 flex-wrap"><div className="relative flex-1 min-w-48"><Ic n="search" s={16} c="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects, locations, clients..." className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div><button onClick={()=>setShowFilt(p=>!p)} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${showFilt?"bg-gradient-gold text-white border-transparent":"bg-white text-ink-600 border-stone-200"}`}><Ic n="sliders" s={15}/>Filters</button></div>
      <div className="flex gap-2 mb-6 flex-wrap">{["all","active","completed","on_hold"].map(s=><button key={s} onClick={()=>setSF(s)} className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${sf===s?"bg-ink-900 text-cream border-ink-900":"bg-white text-ink-600 border-stone-200 hover:border-stone-300"}`}>{s==="all"?"All":s.replace("_"," ")}</button>)}</div>
      {showFilt&&<div className="bg-white rounded-2xl p-5 mb-5 grid sm:grid-cols-3 gap-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div><label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.24em] mb-2 block">Min Progress %</label><div className="flex items-center gap-2"><input type="range" min="0" max="100" value={minP} onChange={e=>setMinP(+e.target.value)} className="flex-1 accent-amber-600"/><span className="text-xs font-bold text-ink-700 w-8">{minP}%</span></div></div><div className="sm:col-span-2"><label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.24em] mb-2 block">Sort By</label><select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="name">Name (A-Z)</option><option value="progress">Progress (High-Low)</option><option value="budget">Budget (High-Low)</option></select></div></div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{fl.map(p=>
        <button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="group relative bg-white rounded-2xl p-6 text-left transition-all hover:shadow-editorial-hover" style={{border:"1px solid var(--st-line)"}}>
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-gold opacity-0 group-hover:opacity-100 transition-opacity"/>
          <div className="flex items-start justify-between mb-3">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700">{p.status==="active"?"In progress":p.status.replace("_"," ")}</div>
            <Badge status={p.status}/>
          </div>
          <h3 className="font-display text-xl font-semibold text-ink-900 group-hover:text-amber-800 line-clamp-2 mb-3 tracking-editorial leading-tight">{p.name}</h3>
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-2 text-xs text-ink-500"><Ic n="map" s={12}/><span className="truncate">{p.location}</span></div>
            <div className="flex items-center gap-2 text-xs text-ink-500"><Ic n="users" s={12}/>{p.client_name}</div>
          </div>
          {p.status!=="completed"&&<div className="mt-4 pt-4" style={{borderTop:"1px solid var(--st-line)"}}>
            <div className="flex justify-between items-baseline mb-2"><span className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">Progress</span><span className="font-display font-semibold text-ink-900 text-lg">{p.progress}<span className="text-ink-500 text-sm">%</span></span></div>
            <PBar v={p.progress} col={p.status==="on_hold"?"violet":"orange"}/>
          </div>}
        </button>
      )}{fl.length===0&&<div className="col-span-3 text-center py-20 text-ink-500"><Ic n="search" s={32} c="mx-auto mb-3 opacity-30"/><p className="font-display text-lg">No projects match</p></div>}</div>
    </div>
  );
}

// ── SUPER ADMIN VIEWS ────────────────────────────────────────────────────────
// These views are gated by PERMS.superadmin.nav. The slate/amber theme makes
// it visually distinct from the editorial tenant views.

function SuperAdminDashboard({user,orgs,adminUsers,projects,issues,activity,setView}){
  const totalMRR=orgs.filter(o=>o.status==="active").reduce((s,o)=>s+(o.mrr||0),0);
  const activeOrgs=orgs.filter(o=>o.status==="active").length;
  const trialOrgs=orgs.filter(o=>o.status==="trial").length;
  const activeUsers=adminUsers.filter(u=>u.status==="active"&&u.role!=="superadmin").length;
  const totalProjects=projects.length;
  const activeProjects=projects.filter(p=>p.status==="active").length;
  const allIssues=Object.values(issues).flat();
  const highOpen=allIssues.filter(i=>i.status==="open"&&i.severity==="high").length;
  const recentSignups=[...orgs].sort((a,b)=>new Date(b.created)-new Date(a.created)).slice(0,3);
  const planDist=["basic","pro","business","custom"].map(plan=>({plan,count:orgs.filter(o=>o.plan===plan).length,mrr:orgs.filter(o=>o.plan===plan).reduce((s,o)=>s+(o.mrr||0),0)}));
  const churnRisk=orgs.filter(o=>{
    const orgUsers=adminUsers.filter(u=>u.org_id===o.id&&u.status==="active");
    if(!orgUsers.length) return false;
    const lastSeen=Math.max(...orgUsers.map(u=>new Date(u.last_seen||0).getTime()));
    return (Date.now()-lastSeen)>7*86400*1000;
  });
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="mb-8 pb-4" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Multi-tenant operations · {new Date().toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric"})}</div>
        <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 tracking-editorial leading-[1.05]">Admin Console</h1>
        <p className="text-ink-600 text-sm mt-3">Welcome back, <span className="font-semibold">{user.name.split(" ")[0]}</span>. Coordinating <strong>{activeOrgs}</strong> active orgs · <strong>{activeUsers}</strong> users · <strong>₹{totalMRR.toLocaleString("en-IN")}/mo</strong> MRR.</p>
      </div>

      {/* Hero metrics — operations grade, not editorial */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-ink-900 text-cream rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{background:"radial-gradient(circle, rgba(245,158,11,.25) 0%, transparent 65%)"}}/>
          <div className="relative">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-400 mb-2">Monthly recurring</div>
            <div className="font-display text-3xl font-light tracking-editorial">₹{totalMRR.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-cream/60 mt-1">{activeOrgs} active · {trialOrgs} trial</div>
          </div>
        </div>
        <SC icon="building" label="Customer Orgs" value={orgs.length} sub={`${activeOrgs} active`} accent="blue"/>
        <SC icon="users" label="Users" value={activeUsers} sub="across all orgs" accent="violet"/>
        <SC icon="folder" label="Projects" value={totalProjects} sub={`${activeProjects} active · ${highOpen} HIGH issues`} accent={highOpen>0?"red":"emerald"}/>
      </div>

      {/* Plan distribution */}
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <div className="md:col-span-2 bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Plan mix</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">Subscription distribution</h2>
          <div className="space-y-3">
            {planDist.map(p=>{
              const meta=PLAN_META[p.plan];const pct=orgs.length?Math.round((p.count/orgs.length)*100):0;
              return(
                <div key={p.plan}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-ink-900 capitalize tracking-editorial">{meta.label}</span>
                      <span className="text-xs text-ink-500">₹{meta.price.toLocaleString("en-IN")}/mo</span>
                    </div>
                    <span className="text-sm font-bold text-ink-700">{p.count} orgs · ₹{p.mrr.toLocaleString("en-IN")}/mo</span>
                  </div>
                  <div className="w-full bg-cream-200 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-gold transition-all duration-500" style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Pipeline</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-4 tracking-editorial">Recent signups</h2>
          <div className="space-y-3">{recentSignups.map(o=>
            <div key={o.id} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0"><span className="font-display font-bold text-amber-800 text-sm">{o.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 text-sm truncate">{o.name}</div>
                <div className="text-[11px] text-ink-500">{fmtDate(o.created)} · {PLAN_META[o.plan].label}</div>
              </div>
            </div>
          )}</div>
        </div>
      </div>

      {/* Churn risk callout */}
      {churnRisk.length>0&&<div className="bg-red-50 border-l-4 border-red-500 rounded-r-2xl p-5 mb-8 shadow-editorial">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="alert" s={18} c="text-red-600"/></div>
          <div className="flex-1">
            <div className="font-display font-semibold text-red-800 text-base tracking-editorial">{churnRisk.length} org(s) with no user activity in past 7 days</div>
            <div className="text-red-600 text-xs mt-1">{churnRisk.map(o=>o.name).slice(0,3).join(" · ")}</div>
          </div>
          <button onClick={()=>setView("admin-orgs")} className="text-red-700 font-bold text-xs tracking-wider uppercase hover:underline">Review →</button>
        </div>
      </div>}

      {/* Cross-org activity */}
      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Cross-tenant feed</div>
            <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Recent activity (all orgs)</h2>
          </div>
          <button onClick={()=>setView("activity")} className="text-amber-700 text-xs font-bold tracking-[0.18em] uppercase hover:text-amber-900">Full feed →</button>
        </div>
        <div className="space-y-2">
          {activity.slice(0,5).map(a=>
            <div key={a.id} className="flex items-center gap-3 py-2" style={{borderBottom:"1px solid var(--st-line)"}}>
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cream-200 text-ink-700">{a.role}</span>
              <span className="text-sm text-ink-800 flex-1 truncate"><strong>{a.by}</strong> · {a.action}</span>
              <span className="text-[11px] text-ink-500">{fmtTime(a.time)}</span>
            </div>
          )}
          {activity.length===0&&<div className="text-sm text-ink-500 italic py-3">No recent activity.</div>}
        </div>
      </div>
    </div>
  );
}

function OrgsAdminView({user,orgs,setOrgs,adminUsers,projects}){
  const[show,setShow]=useState(false);
  const[no,setNo]=useState({name:"",slug:"",plan:"basic",contact_email:"",city:"",status:"trial"});
  const[filter,setFilter]=useState("all");
  const add=()=>{
    if(!no.name.trim()||!no.contact_email.trim()){alert("Org name + contact email are required.");return;}
    const trial_ends=no.status==="trial"?new Date(Date.now()+15*86400*1000).toISOString().split("T")[0]:null;
    setOrgs(p=>[...p,{id:"org_"+Date.now(),...no,name:no.name.trim(),slug:no.slug.trim()||no.name.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-"),mrr:PLAN_META[no.plan].price,users_count:0,projects_count:0,created:new Date().toISOString().split("T")[0],trial_ends}]);
    setNo({name:"",slug:"",plan:"basic",contact_email:"",city:"",status:"trial"});setShow(false);
  };
  const changePlan=(orgId,plan)=>setOrgs(p=>p.map(o=>o.id===orgId?{...o,plan,mrr:PLAN_META[plan].price}:o));
  const toggleStatus=(orgId)=>{
    const o=orgs.find(x=>x.id===orgId);if(!o)return;
    const next=o.status==="active"?"suspended":"active";
    if(!window.confirm(`Set ${o.name} status to ${next}? ${next==="suspended"?"Their users will lose access on next login.":"They regain access immediately."}`))return;
    setOrgs(p=>p.map(x=>x.id===orgId?{...x,status:next}:x));
  };
  const filtered=orgs.filter(o=>filter==="all"||o.status===filter);
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Multi-tenant</div>
          <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Customer Organizations</h1>
          <p className="text-ink-500 text-sm mt-2">{orgs.length} total · {orgs.filter(o=>o.status==="active").length} active · ₹{orgs.filter(o=>o.status==="active").reduce((s,o)=>s+o.mrr,0).toLocaleString("en-IN")}/mo MRR</p>
        </div>
        <button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Add Organization</button>
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">{["all","active","trial","suspended"].map(f=>
        <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase border ${filter===f?"bg-ink-900 text-cream border-ink-900":"bg-white text-ink-600 border-stone-200"}`}>{f==="all"?`All (${orgs.length})`:f}</button>
      )}</div>
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New customer org</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={no.name} onChange={e=>setNo(p=>({...p,name:e.target.value}))} placeholder="Org name (e.g. BuildCo India)" className="col-span-2 p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <input value={no.contact_email} onChange={e=>setNo(p=>({...p,contact_email:e.target.value}))} type="email" placeholder="Contact email" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <input value={no.city} onChange={e=>setNo(p=>({...p,city:e.target.value}))} placeholder="City" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <select value={no.plan} onChange={e=>setNo(p=>({...p,plan:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{Object.entries(PLAN_META).map(([k,m])=><option key={k} value={k}>{m.label} — ₹{m.price}/mo</option>)}</select>
          <select value={no.status} onChange={e=>setNo(p=>({...p,status:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="trial">15-day Trial</option><option value="active">Active (paid)</option></select>
        </div>
        <button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Create Org</button>
      </div>}
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="col-span-4">Organization</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-1 text-right">MRR</div>
          <div className="col-span-1 text-right">Users</div>
          <div className="col-span-1 text-right">Projects</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        <div className="divide-y divide-stone-100">{filtered.map(o=>{
          const orgUsers=adminUsers.filter(u=>u.org_id===o.id).length;
          const orgProjects=projects.filter(p=>p.org_id===o.id).length;
          return(
            <div key={o.id} className="grid grid-cols-12 gap-3 px-5 py-4 items-center text-sm hover:bg-cream-200/30">
              <div className="col-span-4">
                <div className="font-display font-semibold text-ink-900 tracking-editorial">{o.name}</div>
                <div className="text-[11px] text-ink-500">{o.contact_email} · {o.city}</div>
                {o.status==="trial"&&o.trial_ends&&<div className="text-[10px] text-amber-700 mt-1 font-bold">Trial ends {fmtDate(o.trial_ends)}</div>}
              </div>
              <div className="col-span-2">
                <select value={o.plan} onChange={e=>changePlan(o.id,e.target.value)} className="px-2 py-1 text-xs font-bold border border-stone-200 rounded-lg outline-none focus:border-amber-600">
                  {Object.entries(PLAN_META).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div className="col-span-1 text-right font-display font-semibold text-ink-900">₹{o.mrr.toLocaleString("en-IN")}</div>
              <div className="col-span-1 text-right text-ink-700">{orgUsers||o.users_count}</div>
              <div className="col-span-1 text-right text-ink-700">{orgProjects||o.projects_count}</div>
              <div className="col-span-2">
                <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${o.status==="active"?"bg-emerald-50 text-emerald-700":o.status==="trial"?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700"}`} style={{border:"1px solid var(--st-line)"}}>{o.status}</span>
              </div>
              <div className="col-span-1 text-right">
                <button onClick={()=>toggleStatus(o.id)} className="text-[11px] font-bold text-ink-500 hover:text-amber-700">{o.status==="active"?"Suspend":"Activate"}</button>
              </div>
            </div>
          );
        })}{filtered.length===0&&<div className="text-center py-12 text-ink-500 italic">No orgs match this filter.</div>}</div>
      </div>
    </div>
  );
}

function UsersAdminView({user,adminUsers,setAdminUsers,orgs}){
  const[show,setShow]=useState(false);
  const[nu,setNu]=useState({name:"",email:"",role:"pm",org_id:orgs[0]?.id||""});
  const[q,setQ]=useState("");
  const[roleFilter,setRoleFilter]=useState("all");
  const orgsById=Object.fromEntries(orgs.map(o=>[o.id,o]));
  const filtered=adminUsers.filter(u=>roleFilter==="all"||u.role===roleFilter).filter(u=>{
    if(!q.trim())return true;
    const s=q.toLowerCase();
    return u.name.toLowerCase().includes(s)||u.email.toLowerCase().includes(s)||(orgsById[u.org_id]?.name||"").toLowerCase().includes(s);
  });
  const invite=()=>{
    if(!nu.name.trim()||!nu.email.trim()){alert("Name + email required.");return;}
    if(adminUsers.find(u=>u.email.toLowerCase()===nu.email.toLowerCase())){alert("A user with this email already exists.");return;}
    setAdminUsers(p=>[...p,{id:"u_"+Date.now(),...nu,name:nu.name.trim(),email:nu.email.trim(),status:"active",joined:new Date().toISOString().split("T")[0],last_seen:new Date().toISOString()}]);
    setNu({name:"",email:"",role:"pm",org_id:orgs[0]?.id||""});setShow(false);
  };
  const changeRole=(uid,role)=>setAdminUsers(p=>p.map(u=>u.id===uid?{...u,role}:u));
  const toggleStatus=(uid)=>{
    const u=adminUsers.find(x=>x.id===uid);if(!u)return;
    if(u.role==="superadmin"){alert("Super admin status cannot be toggled from here.");return;}
    const next=u.status==="active"?"inactive":"active";
    if(!window.confirm(`${next==="inactive"?"Deactivate":"Reactivate"} ${u.name}?`))return;
    setAdminUsers(p=>p.map(x=>x.id===uid?{...x,status:next}:x));
  };
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— People</div>
          <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Users</h1>
          <p className="text-ink-500 text-sm mt-2">{adminUsers.length} total · {adminUsers.filter(u=>u.status==="active").length} active across {orgs.length} orgs</p>
        </div>
        <button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Invite User</button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-48"><Ic n="search" s={16} c="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name, email, or org..." className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div>
        <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} className="px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">
          <option value="all">All roles</option>
          <option value="superadmin">Super Admin</option>
          <option value="architect">Architect</option>
          <option value="pm">PM</option>
          <option value="contractor">Contractor</option>
          <option value="client">Client</option>
        </select>
      </div>
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">Invite a user</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={nu.name} onChange={e=>setNu(p=>({...p,name:e.target.value}))} placeholder="Full name" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <input value={nu.email} onChange={e=>setNu(p=>({...p,email:e.target.value}))} type="email" placeholder="Email" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <select value={nu.role} onChange={e=>setNu(p=>({...p,role:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">
            <option value="architect">Architect</option>
            <option value="pm">PM</option>
            <option value="contractor">Contractor</option>
            <option value="client">Client</option>
          </select>
          <select value={nu.org_id} onChange={e=>setNu(p=>({...p,org_id:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </div>
        <p className="text-[11px] text-ink-500 mb-3">In production a magic-link invite is sent via Supabase Auth. Demo mode just adds the row.</p>
        <button onClick={invite} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Send Invite</button>
      </div>}
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="col-span-4">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-3">Org</div>
          <div className="col-span-2">Last seen</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        <div className="divide-y divide-stone-100">{filtered.map(u=>{
          const org=orgsById[u.org_id];
          return(
            <div key={u.id} className="grid grid-cols-12 gap-3 px-5 py-4 items-center text-sm hover:bg-cream-200/30">
              <div className="col-span-4 flex items-center gap-3">
                <Av i={u.name.split(" ").map(x=>x[0]).join("").slice(0,2)} sz="sm" col={ROLE_META[u.role]?.col||"slate"}/>
                <div className="min-w-0">
                  <div className="font-semibold text-ink-900 truncate">{u.name}{u.role==="superadmin"&&<span className="ml-1.5 text-[9px] font-bold tracking-wider uppercase text-amber-700">★ super</span>}</div>
                  <div className="text-[11px] text-ink-500 truncate">{u.email}</div>
                </div>
              </div>
              <div className="col-span-2">
                {u.role==="superadmin"?<span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-ink-900 text-amber-400" style={{border:"1px solid var(--st-line)"}}>{ROLE_META[u.role].label}</span>:
                  <select value={u.role} onChange={e=>changeRole(u.id,e.target.value)} className="px-2 py-1 text-xs font-bold border border-stone-200 rounded-lg outline-none focus:border-amber-600">
                    <option value="architect">Architect</option><option value="pm">PM</option><option value="contractor">Contractor</option><option value="client">Client</option>
                  </select>
                }
              </div>
              <div className="col-span-3 text-ink-700 truncate">{org?org.name:<em className="text-ink-500">— system —</em>}</div>
              <div className="col-span-2 text-[11px] text-ink-500">{u.last_seen?fmtTime(u.last_seen):"never"}</div>
              <div className="col-span-1 text-right">
                <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full mr-2 ${u.status==="active"?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`} style={{border:"1px solid var(--st-line)"}}>{u.status}</span>
                {u.role!=="superadmin"&&<button onClick={()=>toggleStatus(u.id)} className="text-[11px] font-bold text-ink-500 hover:text-amber-700">{u.status==="active"?"Disable":"Enable"}</button>}
              </div>
            </div>
          );
        })}{filtered.length===0&&<div className="text-center py-12 text-ink-500 italic">No users match.</div>}</div>
      </div>
    </div>
  );
}

function BillingAdminView({user,orgs}){
  const activeOrgs=orgs.filter(o=>o.status==="active");
  const trialOrgs=orgs.filter(o=>o.status==="trial");
  const suspended=orgs.filter(o=>o.status==="suspended");
  const totalMRR=activeOrgs.reduce((s,o)=>s+o.mrr,0);
  const arr=totalMRR*12;
  const byPlan=["basic","pro","business","custom"].map(plan=>({
    plan,
    orgs:activeOrgs.filter(o=>o.plan===plan),
    mrr:activeOrgs.filter(o=>o.plan===plan).reduce((s,o)=>s+o.mrr,0),
  }));
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Revenue</div>
        <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Billing &amp; MRR</h1>
        <p className="text-ink-500 text-sm mt-2">Subscription revenue across all customer organizations.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-ink-900 text-cream rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{background:"radial-gradient(circle, rgba(245,158,11,.25) 0%, transparent 65%)"}}/>
          <div className="relative">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-400 mb-2">MRR</div>
            <div className="font-display text-3xl font-light tracking-editorial">₹{totalMRR.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-cream/60 mt-1">{activeOrgs.length} active subs</div>
          </div>
        </div>
        <SC icon="trend" label="ARR (projected)" value={`₹${arr.toLocaleString("en-IN")}`} accent="emerald"/>
        <SC icon="building" label="Active customers" value={activeOrgs.length} accent="blue"/>
        <SC icon="alert" label="Trial / Suspended" value={`${trialOrgs.length} / ${suspended.length}`} accent={suspended.length?"red":"violet"}/>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-8" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Revenue mix</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">By plan tier</h2>
        <div className="space-y-4">
          {byPlan.map(p=>{
            const meta=PLAN_META[p.plan];const share=totalMRR?Math.round((p.mrr/totalMRR)*100):0;
            return(
              <div key={p.plan}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-ink-900 capitalize tracking-editorial">{meta.label}</span>
                    <span className="text-xs text-ink-500">₹{meta.price}/mo · {p.orgs.length} customer{p.orgs.length===1?"":"s"}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-display font-bold text-ink-900">₹{p.mrr.toLocaleString("en-IN")}</span>
                    <span className="text-xs text-ink-500 ml-2">{share}%</span>
                  </div>
                </div>
                <div className="w-full bg-cream-200 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-gradient-gold transition-all duration-500" style={{width:`${share}%`}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-amber-50 rounded-2xl p-6 border-l-4 border-amber-500">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-800 mb-1">— Roadmap</div>
        <h2 className="font-display text-xl font-semibold text-amber-900 mb-2 tracking-editorial">Connect Razorpay Subscriptions</h2>
        <p className="text-sm text-amber-900 leading-relaxed">When the Supabase backend lands, this view connects to Razorpay's Subscription API to auto-charge each org monthly. Invoices, GST receipts, dunning, retries all handled by Razorpay. See <span className="font-semibold">docs/BACKEND_PLAN.md</span> Phase B7.</p>
      </div>
    </div>
  );
}

function SettingsAdminView({user,flags,setFlags}){
  const aiCfg=getProviderConfig();
  const rzCfg=getRazorpayConfig();
  const toggle=(k)=>setFlags(p=>({...p,[k]:!p[k]}));
  const FLAG_LIST=[
    {k:"drawing_markup",label:"Drawing Markup Viewer",desc:"Canvas overlay on image attachments. Required for PlanGrid/Procore parity."},
    {k:"ai_insights",label:"AI Insights (LLM)",desc:"Claude/OpenAI-powered risk narratives. Requires API key per super admin."},
    {k:"dpr_auto",label:"Auto Daily Report (DPR)",desc:"Scheduled 6 PM WhatsApp delivery. Requires Supabase Edge Function."},
    {k:"whatsapp_share",label:"WhatsApp Share buttons",desc:"Project + DPR share via wa.me deep links."},
    {k:"e_signature",label:"E-signature on approvals",desc:"Typed-name consent capture on change orders."},
    {k:"offline_queue",label:"Offline sync queue",desc:"Queue writes when offline; drain on reconnect (needs backend to ship)."},
  ];
  return(
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Configuration</div>
        <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">System Settings</h1>
        <p className="text-ink-500 text-sm mt-2">Feature flags + integration status — applied to every customer org.</p>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-6" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Feature flags</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">What's on?</h2>
        <div className="space-y-2">{FLAG_LIST.map(f=>
          <label key={f.k} className={`flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all ${flags[f.k]?"bg-amber-50":"bg-cream-200/40"}`} style={{border:"1px solid var(--st-line)"}}>
            <input type="checkbox" checked={!!flags[f.k]} onChange={()=>toggle(f.k)} className="mt-1 w-5 h-5 accent-amber-600"/>
            <div className="flex-1">
              <div className="font-semibold text-ink-900">{f.label}</div>
              <div className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">{f.desc}</div>
            </div>
            <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full ${flags[f.k]?"bg-emerald-100 text-emerald-700":"bg-stone-100 text-ink-500"}`}>{flags[f.k]?"on":"off"}</span>
          </label>
        )}</div>
        <p className="text-[11px] text-ink-500 mt-4">Flags are stored in localStorage for the demo. In production they live on the org row (per-tenant) or on a global config table.</p>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Integrations</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">External services</h2>
        <div className="space-y-3 text-sm">
          {[
            {name:"Anthropic / OpenAI (AI Insights)",ok:!!(aiCfg.provider&&aiCfg.apiKey),detail:aiCfg.provider?`${aiCfg.provider} · ${aiCfg.model||"default model"}`:"Not configured"},
            {name:"Razorpay UPI / Payment Link",ok:!!(rzCfg.upiId||rzCfg.paymentLinkBase),detail:rzCfg.upiId?`UPI: ${rzCfg.upiId}`:"UPI not configured"},
            {name:"Supabase Backend",ok:false,detail:"Not connected — VITE_BACKEND=local. See docs/BACKEND_PLAN.md."},
            {name:"WhatsApp Business API",ok:false,detail:"Not connected — only wa.me deep links work in demo."},
            {name:"GitHub Actions CI",ok:false,detail:"Workflow file at docs/CI_WORKFLOW.yml — needs manual move per docs/CI_SETUP.md."},
          ].map(it=>(
            <div key={it.name} className="flex items-center gap-4 p-4 rounded-xl bg-cream-200/40" style={{border:"1px solid var(--st-line)"}}>
              <span className={`w-2.5 h-2.5 rounded-full ${it.ok?"bg-emerald-500":"bg-stone-400"}`}/>
              <div className="flex-1">
                <div className="font-semibold text-ink-900 text-sm">{it.name}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">{it.detail}</div>
              </div>
              <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full ${it.ok?"bg-emerald-50 text-emerald-700":"bg-stone-100 text-ink-500"}`}>{it.ok?"connected":"off"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PROJECT DETAIL ────────────────────────────────────────────────────────────
const QUICK_CAPTURE_TYPES = [["update","Update"],["issue","Issue"],["worklog","Worklog"],["material","Material"]];
const quickCaptureDefaults = type => ({
  update:{notes:"",weather:"",workers:""},
  issue:{title:"",severity:"high",description:""},
  worklog:{contractor:"",location:"",work:"",workers:"",hours:""},
  material:{material:"",quantity:"",supplier:"",status:"received",notes:""},
}[type] || {});

function QuickCaptureDrawer({quick,setQuick,onSave}){
  if(!quick.open) return null;
  const type=quick.type||"update";
  const form=quick.form||quickCaptureDefaults(type);
  const setType=next=>setQuick(q=>({...q,type:next,error:"",files:[],form:quickCaptureDefaults(next)}));
  const setField=(key,value)=>setQuick(q=>({...q,error:"",form:{...(q.form||{}),[key]:value}}));
  const close=()=>setQuick(q=>({...q,open:false,error:"",files:[],form:quickCaptureDefaults(q.type||"update")}));
  const saveLabel={update:"Save Update",issue:"Report Issue",worklog:"Submit Worklog",material:"Log Material"}[type];
  return(
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4" onClick={e=>{if(e.target===e.currentTarget)close();}}>
      <div className="w-full md:max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl md:rounded-2xl border border-slate-200 shadow-2xl p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div><h3 className="font-black text-slate-800 text-lg">Add field record</h3><p className="text-xs text-slate-400 mt-1">Capture site work, issue, worklog, or material without leaving this project.</p></div>
          <button onClick={close} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><Ic n="x" s={18}/></button>
        </div>
        <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl mb-4">
          {QUICK_CAPTURE_TYPES.map(([k,l])=><button key={k} onClick={()=>setType(k)} className={`py-2 rounded-lg text-xs font-bold ${type===k?"bg-white text-slate-800 shadow-sm":"text-slate-500"}`}>{l}</button>)}
        </div>
        <div className="space-y-3">
          {type==="update"&&<>
            <textarea value={form.notes||""} onChange={e=>setField("notes",e.target.value)} placeholder="Today's site activities" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.weather||""} onChange={e=>setField("weather",e.target.value)} placeholder="Weather" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={form.workers||""} onChange={e=>setField("workers",e.target.value)} placeholder="Workers on site" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
          </>}
          {type==="issue"&&<>
            <input value={form.title||""} onChange={e=>setField("title",e.target.value)} placeholder="Issue title" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
            <div className="grid grid-cols-3 gap-2">{["high","medium","low"].map(s=>{const sc=SEV_COLOR[s];return <button key={s} onClick={()=>setField("severity",s)} className={`p-2.5 rounded-xl text-xs font-bold border-2 capitalize ${form.severity===s?`${sc.bg} ${sc.text} ${sc.border}`:"border-slate-200 text-slate-500"}`}>{s}</button>;})}</div>
            <textarea value={form.description||""} onChange={e=>setField("description",e.target.value)} placeholder="Describe the issue" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/>
          </>}
          {type==="worklog"&&<>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.contractor||""} onChange={e=>setField("contractor",e.target.value)} placeholder="Contractor" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={form.location||""} onChange={e=>setField("location",e.target.value)} placeholder="Location" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
            <textarea value={form.work||""} onChange={e=>setField("work",e.target.value)} placeholder="Work completed / pending" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
            <div className="grid md:grid-cols-2 gap-3"><input type="number" value={form.workers||""} onChange={e=>setField("workers",e.target.value)} placeholder="Workers" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={form.hours||""} onChange={e=>setField("hours",e.target.value)} placeholder="Hours" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
          </>}
          {type==="material"&&<>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.material||""} onChange={e=>setField("material",e.target.value)} placeholder="Material" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={form.quantity||""} onChange={e=>setField("quantity",e.target.value)} placeholder="Quantity" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.supplier||""} onChange={e=>setField("supplier",e.target.value)} placeholder="Supplier" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={form.status||"received"} onChange={e=>setField("status",e.target.value)} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="expected">Expected</option><option value="received">Received</option><option value="rejected">Rejected</option></select></div>
            <input value={form.notes||""} onChange={e=>setField("notes",e.target.value)} placeholder="Notes" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          </>}
          <AttachmentInput files={quick.files||[]} onChange={files=>setQuick(q=>({...q,files}))} label="Attach photos / documents"/>
          {quick.error&&<div className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{quick.error}</div>}
          <button onClick={onSave} className="w-full md:w-auto px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

function DetailView({pid,user,setView,projects,setProjects,milestones,setMilestones,updates,setUpdates,expenses,setExpenses,teams,setTeams,attendance,setAttendance,issues,setIssues,materials,setMaterials,drawings,setDrawings,addActivity,tasks,setTasks,punch,setPunch,rfi,setRfi,co,setCo,inspections,setInspections,safety,setSafety,vendors,pos,setPos,invoices,setInvoices,labour,setLabour,ra,setRa,comments,setComments,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,submittals,setSubmittals,permits,setPermits,messages,setMessages,boq,setBoq,ledger,setLedger,estimate,setEstimate,lang}){
  const proj=projects.find(p=>p.id===pid);
  const ms=milestones[pid]||[], us=updates[pid]||[], ex=expenses[pid]||[];
  const tm=teams[pid]||[], att=attendance[pid]||{};
  const iss=issues[pid]||[], mats=materials[pid]||[], drws=drawings[pid]||[];
  const tks=tasks[pid]||[], pns=punch[pid]||[], rfis=rfi[pid]||[];
  const cos=co[pid]||[], inss=inspections[pid]||[], sfs=safety[pid]||[];
  const projPOs=pos[pid]||[], invs=invoices[pid]||[], lbs=labour[pid]||[], ras=ra[pid]||[];
  const eqs=equipment[pid]||[], dys=diary[pid]||[], wls=worklogs[pid]||[], cls=checklists[pid]||[];
  const subs=submittals[pid]||[], prs=permits[pid]||[], msgs=messages[pid]||[];
  const bq=boq[pid]||[], lg=ledger[pid]||[];
  const est=estimate[pid]||{markup:10,overhead:7,contingency:4,gst:18,note:"",version:1,updated:""};
  const[tab,setTab]=useState("overview");
  const[showUpd,setShowUpd]=useState(false);const[nu,setNu]=useState({notes:"",weather:"",workers:""});const[nph,setNph]=useState([]);
  const[geoOn,setGeoOn]=useState(false); // opt-in for photo geolocation
  const[showEx,setShowEx]=useState(false);const[ne,setNe]=useState({date:"",cat:"Materials",desc:"",amt:"",gst:18,tds:0,attachments:[]});
  const[showMember,setShowMember]=useState(false);const[nm,setNm]=useState({name:"",role:"Site Engineer",phone:""});
  const[lb,setLb]=useState(null);const[editProg,setEditProg]=useState(false);const[tp,setTp]=useState(0);
  const[shareModal,setShareModal]=useState(false);const[copied,setCopied]=useState(false);
  const[dprModal,setDprModal]=useState(false);const[dprDate,setDprDate]=useState(new Date().toISOString().split("T")[0]);
  const[markupTarget,setMarkupTarget]=useState(null);   // {drawingId, attachment}
  const[attDate,setAttDate]=useState(new Date().toISOString().split("T")[0]);
  const[showIssue,setShowIssue]=useState(false);const[ni,setNi]=useState({title:"",severity:"high",description:"",attachments:[]});
  const[showMat,setShowMat]=useState(false);const[nmat,setNmat]=useState({date:"",material:"",quantity:"",supplier:"",status:"expected",notes:"",attachments:[]});
  // Drawing release state
  const[showDrawing,setShowDrawing]=useState(false);const[ndraw,setNdraw]=useState({title:"",type:"Architectural",revision:"Rev A",notes:"",released_to:["pm"],files:[]});
  const[quick,setQuick]=useState({open:false,type:"update",error:"",saved:"",files:[],form:quickCaptureDefaults("update")});
  const fRef=useRef();
  const camRef=useRef();
  if(!proj) return <div className="p-8 text-slate-500">Project not found.</div>;
  if(!canAccessProject(user,proj)) return <div className="p-8"><AccessDenied msg="This project is not assigned to your account."/></div>;
  const totEx=ex.reduce((s,e)=>s+e.amount,0);const bpct=Math.round((totEx/proj.budget)*100)||0;
  const allPh=us.flatMap(u=>u.photos||[]);
  const todayAtt=att[attDate]||{};const attDates=Object.keys(att).sort().reverse();
  const openIss=iss.filter(i=>i.status==="open").length;const highIss=iss.filter(i=>i.severity==="high"&&i.status==="open").length;
  const myDrawings=user.role==="architect"?drws:drws.filter(d=>isReleasedCurrentDrawing(d,user.role));
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
  const phUp=e=>{
    const files=Array.from(e.target.files);
    // Geolocation is opt-in: only requested if user toggled "Tag with location" before upload.
    // This avoids surprising the user with a browser permission popup they did not initiate.
    const grabGeo=()=>new Promise(resolve=>{
      if(!geoOn || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos=>resolve({lat:+pos.coords.latitude.toFixed(6),lng:+pos.coords.longitude.toFixed(6),accuracy:Math.round(pos.coords.accuracy||0)}),
        ()=>resolve(null),
        {enableHighAccuracy:true,timeout:4000,maximumAge:60000}
      );
    });
    grabGeo().then(geo=>{
      files.forEach(f=>{
        const r=new FileReader();
        r.onload=ev=>setNph(p=>[...p,{url:ev.target.result,captured_at:new Date().toISOString(),geo,name:f.name,size:f.size}]);
        r.readAsDataURL(f);
      });
    });
  };
  const addUpd=()=>{
    if(!nu.notes.trim())return;
    const id="u_"+Date.now();
    const record={id,update_date:new Date().toISOString().split("T")[0],notes:nu.notes,weather:nu.weather||"—",workers_count:parseInt(nu.workers)||null,photos:nph};
    setUpdates(p=>({...p,[pid]:[record,...(p[pid]||[])]}));
    addActivity(pid,proj.name,"update","Added site update",nu.notes.slice(0,80)+(nu.notes.length>80?"…":""),user.name,user.role);
    // Queue for backend sync (BACKEND_PLAN.md Phase B3 will drain this)
    if(!isOnline()) queueOpAdd({entity:"site_update",op:"insert",project_id:pid,record});
    setNu({notes:"",weather:"",workers:""});setNph([]);setShowUpd(false);
  };
  const addEx=()=>{
    if(!ne.desc.trim()||!ne.amt)return;
    setExpenses(p=>({...p,[pid]:[{id:"ex_"+Date.now(),date:ne.date||new Date().toISOString().split("T")[0],category:ne.cat,description:ne.desc,amount:parseFloat(ne.amt),gst:+ne.gst||0,tds:+ne.tds||0,attachments:ne.attachments||[]},...(p[pid]||[])]}));
    setNe({date:"",cat:"Materials",desc:"",amt:"",gst:18,tds:0,attachments:[]});setShowEx(false);
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
    setNi({title:"",severity:"high",description:"",attachments:[]});setShowIssue(false);
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
    setNmat({date:"",material:"",quantity:"",supplier:"",status:"expected",notes:"",attachments:[]});setShowMat(false);
  };
  const markMatReceived=id=>{
    const mat=mats.find(m=>m.id===id);
    setMaterials(p=>({...p,[pid]:p[pid].map(x=>x.id===id?{...x,status:"received"}:x)}));
    if(mat) addActivity(pid,proj.name,"material","Marked material received",`${mat.material} — ${mat.quantity}`,user.name,user.role);
  };
  const openQuickCapture=()=>setQuick({open:true,type:"update",error:"",saved:"",files:[],form:quickCaptureDefaults("update")});
  const failQuick=msg=>setQuick(q=>({...q,error:msg}));
  const finishQuick=(msg,nextTab)=>{setTab(nextTab);setQuick(q=>({...q,open:false,error:"",saved:msg,files:[],form:quickCaptureDefaults(q.type||"update")}));setTimeout(()=>setQuick(q=>({...q,saved:""})),2200);};
  const saveQuick=()=>{
    const type=quick.type||"update";const f=quick.form||{};const files=quick.files||[];const today=new Date().toISOString().split("T")[0];
    if(type==="update"){
      if(!f.notes?.trim()) return failQuick("Site activity notes are required.");
      const photos=files.map(x=>({...x,url:x.dataUrl||x.url}));
      setUpdates(p=>({...p,[pid]:[{id:"u_"+Date.now(),update_date:today,notes:f.notes,weather:f.weather||"-",workers_count:parseInt(f.workers)||null,photos},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"update","Added quick site update",f.notes.slice(0,80),user.name,user.role);
      finishQuick("Saved to Updates","updates");return;
    }
    if(type==="issue"){
      if(!f.title?.trim()) return failQuick("Issue title is required.");
      setIssues(p=>({...p,[pid]:[{id:"i_"+Date.now(),title:f.title,severity:f.severity||"high",description:f.description||"",attachments:files,status:"open",reported_date:today,reported_by:user.name},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"issue",`Reported ${(f.severity||"high").toUpperCase()} issue`,f.title,user.name,user.role);
      finishQuick("Saved to Issues","issues");return;
    }
    if(type==="worklog"){
      if(!f.work?.trim()) return failQuick("Work completed / pending is required.");
      setWorklogs(p=>({...p,[pid]:[{id:"wl_"+Date.now(),date:today,contractor:f.contractor||user.name,location:f.location||"",work:f.work,workers:+f.workers||0,hours:+f.hours||0,attachments:files,status:user.role==="contractor"?"submitted":"approved"},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"general","Submitted quick worklog",f.work.slice(0,70),user.name,user.role);
      finishQuick("Saved to Worklogs","fieldops");return;
    }
    if(type==="material"){
      if(!f.material?.trim()) return failQuick("Material name is required.");
      setMaterials(p=>({...p,[pid]:[{id:"mat_"+Date.now(),date:today,material:f.material,quantity:f.quantity||"",supplier:f.supplier||"",status:f.status||"received",notes:f.notes||"",attachments:files},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"material","Logged quick material",`${f.material} - ${f.quantity||"quantity pending"}`,user.name,user.role);
      finishQuick("Saved to Materials","materials");
    }
  };
  // Drawing release
  const addDrawing=()=>{
    if(!ndraw.title.trim()||!ndraw.type?.trim()){alert("Drawing title and type are required for revision governance.");return;}
    const d={id:"d_"+Date.now(),...ndraw,date:new Date().toISOString().split("T")[0],status:"current"};
    const key=drawingKey(d);
    // Guard: if key is null (blank title/type made it through somehow), skip
    // the supersede pass entirely — better to leave older drawings as-is than
    // to wipe every blank drawing under one collision key.
    setDrawings(p=>({...p,[pid]:[d,...(p[pid]||[]).map(x=>key&&drawingKey(x)===key&&x.status==="current"?{...x,status:"superseded",superseded_by:d.id}:x)]}));
    addActivity(pid,proj.name,"drawing",`Released drawing to ${ndraw.released_to.map(r=>r==="pm"?"PM":"Client").join(" & ")}`,`${ndraw.title} (${ndraw.revision}) · ${(ndraw.files||[]).length} file(s)`,user.name,user.role);
    setNdraw({title:"",type:"Architectural",revision:"Rev A",notes:"",released_to:["pm"],files:[]});setShowDrawing(false);
  };
  const toggleRelease=(id,role)=>{
    setDrawings(p=>({...p,[pid]:p[pid].map(d=>d.id===id?{...d,released_to:d.released_to.includes(role)?d.released_to.filter(r=>r!==role):[...d.released_to,role]}:d)}));
  };
  const setDrawingStatus=(id,nextStatus)=>{
    setDrawings(p=>{
      const list=p[pid]||[];
      const target=list.find(d=>d.id===id);
      if(!target) return p;
      const key=drawingKey(target);
      return {...p,[pid]:list.map(d=>{
        if(d.id===id) return {...d,status:nextStatus,superseded_by:nextStatus==="current"?null:d.superseded_by};
        // Same guard as addDrawing: skip if key is null (blank title/type).
        if(nextStatus==="current"&&key&&drawingKey(d)===key&&d.status==="current") return {...d,status:"superseded",superseded_by:id};
        return d;
      })};
    });
  };
  const saveDrawingMarkup=(drawingId, markedAttachment)=>{
    setDrawings(p=>({...p,[pid]:(p[pid]||[]).map(d=>d.id===drawingId?{...d,files:[...(d.files||d.attachments||[]),markedAttachment]}:d)}));
    const dr=drws.find(d=>d.id===drawingId);
    if(dr) addActivity(pid,proj.name,"drawing","Added markup to drawing",`${dr.title} · ${markedAttachment.strokes_count} strokes`,user.name,user.role);
  };
  const shareUrl=`${window.location.href.split("?")[0]}?share=${pid}`;
  const copyLink=()=>{navigator.clipboard.writeText(shareUrl).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const catTot=EXPENSE_CATS.map(c=>({c,t:ex.filter(e=>e.category===c).reduce((s,e)=>s+e.amount,0)})).filter(x=>x.t>0);
  return(
    <div className="p-4 md:p-8">
      {lb&&<div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={()=>setLb(null)}><button className="absolute top-4 right-4 text-white/60 hover:text-white"><Ic n="x" s={28}/></button><img src={lb} className="max-w-full max-h-[90vh] rounded-xl object-contain" alt="site"/></div>}
      {quick.saved&&<div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-bold">{quick.saved}</div>}
      <QuickCaptureDrawer quick={quick} setQuick={setQuick} onSave={saveQuick}/>
      {shareModal&&(
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setShareModal(false);}}>
          <div className="bg-white rounded-2xl p-7 max-w-md w-full shadow-2xl">
            <div className="flex justify-between mb-5"><h3 className="font-black text-slate-800">Share with Client</h3><button onClick={()=>setShareModal(false)}><Ic n="x" s={20} c="text-slate-400"/></button></div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-5"><p className="text-orange-800 text-sm">Client must login before this project link opens.</p></div>
            <div className="flex gap-2 mb-3"><input value={shareUrl} readOnly className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none"/><button onClick={copyLink} className={`px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${copied?"bg-emerald-500 text-white":"bg-orange-500 hover:bg-orange-400 text-white"}`}><Ic n="copy" s={15}/>{copied?"Done":"Copy"}</button></div>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Project: ${proj.name}\nProgress: ${proj.progress}%\nView after login: ${shareUrl}`)}`} target="_blank" rel="noopener" className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm"><Ic n="whatsapp" s={18}/>Share on WhatsApp</a>
          </div>
        </div>
      )}

      {dprModal&&(()=>{
        const opts={date:dprDate,updates:us,issues:iss,materials:mats,worklogs:wls,attendance:att,team:tm};
        const wa=buildDPRWhatsAppText(proj,opts);
        return(
          <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setDprModal(false);}}>
            <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-editorial-deep" style={{border:"1px solid var(--st-line)"}}>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Daily Report</div>
                  <h3 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Send DPR</h3>
                </div>
                <button onClick={()=>setDprModal(false)}><Ic n="x" s={20} c="text-ink-500"/></button>
              </div>
              <div className="bg-cream-200/60 rounded-xl p-4 mb-5" style={{border:"1px solid var(--st-line)"}}>
                <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1">Report date</div>
                <input type="date" value={dprDate} onChange={e=>setDprDate(e.target.value)} max={new Date().toISOString().split("T")[0]} className="w-full p-2 bg-transparent text-ink-900 font-semibold text-base outline-none"/>
              </div>
              <p className="text-sm text-ink-600 mb-5 leading-relaxed">Auto-built from today's updates, issues, materials, worklogs, attendance, and photos in editorial PDF format. Print or save, then share.</p>
              <div className="space-y-2.5">
                <button onClick={()=>exportDPR(proj,opts)} className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="download" s={16}/>Generate &amp; Print DPR (PDF)</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(wa)}`} target="_blank" rel="noopener" className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm tracking-wide"><Ic n="whatsapp" s={16}/>Share Summary on WhatsApp</a>
                <button onClick={()=>{navigator.clipboard.writeText(wa).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);});}} className={`w-full flex items-center justify-center gap-2 px-5 py-3.5 font-bold rounded-xl text-sm tracking-wide transition-all ${copied?"bg-emerald-500 text-white":"bg-cream-200 text-ink-700 hover:bg-cream-100"}`} style={{border:"1px solid var(--st-line)"}}><Ic n="copy" s={15}/>{copied?"Copied to clipboard!":"Copy text summary"}</button>
              </div>
              <p className="text-[11px] text-ink-500 mt-5 leading-relaxed text-center">For automated 6&nbsp;PM WhatsApp delivery, provision the backend per <span className="font-semibold">docs/BACKEND_PLAN.md</span> Edge Functions.</p>
            </div>
          </div>
        );
      })()}

      <MarkupModal
        open={!!markupTarget}
        imageUrl={markupTarget?.attachment?.url || markupTarget?.attachment?.dataUrl || ""}
        sourceName={markupTarget?.attachment?.name || "drawing"}
        onClose={()=>setMarkupTarget(null)}
        onSave={att => saveDrawingMarkup(markupTarget.drawingId, att)}
      />

      {/* Editorial breadcrumb */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button onClick={()=>setView("projects")} className="flex items-center gap-2 text-ink-500 hover:text-amber-700 text-xs font-bold tracking-[0.18em] uppercase"><Ic n="arrow" s={14}/>Back to Portfolio</button>
        <div className="flex gap-2 flex-wrap">
          {can(user,"export")&&<><button onClick={()=>exportPDF(proj,ms,us,ex,iss)} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-cream-200 text-ink-700 font-semibold rounded-xl text-xs shadow-editorial" style={{border:"1px solid var(--st-line)"}}><Ic n="download" s={13}/>PDF</button><button onClick={()=>exportCSV(proj,ex)} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-cream-200 text-ink-700 font-semibold rounded-xl text-xs shadow-editorial" style={{border:"1px solid var(--st-line)"}}><Ic n="download" s={13}/>CSV</button></>}
          {canUseQuickCapture(user)&&<button onClick={()=>setDprModal(true)} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-cream-200 text-ink-700 font-semibold rounded-xl text-xs shadow-editorial" style={{border:"1px solid var(--st-line)"}}><Ic n="receipt" s={13}/>Daily Report</button>}
          {canUseQuickCapture(user)&&<button onClick={openQuickCapture} className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-gold text-white font-bold rounded-xl text-xs tracking-wide"><Ic n="plus" s={14}/>Today's Entry</button>}
          {can(user,"share")&&<button onClick={()=>setShareModal(true)} className="flex items-center gap-2 px-4 py-2 bg-ink-900 hover:bg-ink-800 text-cream font-semibold rounded-xl text-xs tracking-wide"><Ic n="share" s={13}/>Share with Client</button>}
        </div>
      </div>
      {canUseQuickCapture(user)&&<button onClick={openQuickCapture} className="md:hidden fixed bottom-4 left-4 right-4 z-30 flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-gold text-white font-bold rounded-2xl shadow-editorial-deep tracking-wide"><Ic n="plus" s={18}/>Today's Entry</button>}

      {/* Editorial project hero */}
      <div className="relative bg-white rounded-3xl p-6 md:p-10 mb-6 overflow-hidden" style={{border:"1px solid var(--st-line)",boxShadow:"var(--st-shadow)"}}>
        {/* Gold top rule */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-gold opacity-50"/>
        {/* Soft glow corner */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none" style={{background:"radial-gradient(circle, rgba(245,158,11,.08) 0%, transparent 70%)"}}/>

        <div className="relative">
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div className="flex-1 min-w-0 pr-4">
              <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-3">— {ROLE_META[user.role].label} view</div>
              <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 mb-3 tracking-editorial leading-[1.05]">{proj.name}</h1>
              <p className="text-ink-600 text-base leading-relaxed max-w-2xl">{proj.description}</p>
              <div className="flex flex-wrap gap-5 text-sm text-ink-500 mt-5">
                <span className="flex items-center gap-2"><Ic n="map" s={14}/>{proj.location}</span>
                <span className="flex items-center gap-2"><Ic n="calendar" s={14}/>Started {fmtDate(proj.start_date)}</span>
              </div>
            </div>
            <Badge status={proj.status}/>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6" style={{borderTop:"1px solid var(--st-line)"}}>
            <div><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-500 mb-1.5">Client</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{proj.client_name}</div></div>
            {user.role!=="client"&&<div><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-500 mb-1.5">Budget</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{fmtCur(proj.budget)}</div></div>}
            <div><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-500 mb-1.5">Expected Handover</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{fmtDate(proj.expected_end_date)}</div></div>
          </div>
        </div>
        {/* Progress */}
        <div className="relative mt-6 pt-6" style={{borderTop:"1px solid var(--st-line)"}}>
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
            {TAB_LABELS[t]||t}
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
                <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={phUp} className="hidden"/>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>camRef.current.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 hover:border-orange-300 rounded-xl text-sm text-slate-500 hover:text-orange-500 justify-center font-semibold"><Ic n="camera" s={16}/>Take Photo</button>
                  <button onClick={()=>fRef.current.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 hover:border-orange-300 rounded-xl text-sm text-slate-500 hover:text-orange-500 justify-center font-semibold"><Ic n="image" s={16}/>Choose Files {nph.length>0&&`(${nph.length})`}</button>
                </div>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer border ${geoOn?"bg-orange-50 border-orange-200 text-orange-700":"bg-slate-50 border-slate-200 text-slate-500"}`}>
                  <input type="checkbox" checked={geoOn} onChange={e=>setGeoOn(e.target.checked)} className="accent-orange-500"/>
                  <Ic n="map" s={13}/>
                  <span className="font-semibold">Tag photos with site location</span>
                  <span className="text-slate-400 ml-auto">{geoOn?"browser will ask for permission":"photos saved without GPS"}</span>
                </label>
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
                {u.photos?.length>0&&<div><div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Ic n="camera" s={12}/>{u.photos.length} Photos</div><div className="flex gap-2 flex-wrap">{u.photos.map((ph,i)=><div key={i} className="relative group"><img src={ph.url} onClick={()=>setLb(ph.url)} className="w-20 h-20 rounded-xl object-cover cursor-pointer hover:opacity-80 hover:scale-105 transition-all" alt=""/>{(ph.captured_at||ph.geo)&&<div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity"><div>{ph.captured_at?new Date(ph.captured_at).toLocaleString("en-IN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):""}</div>{ph.geo&&<div className="truncate">📍{ph.geo.lat},{ph.geo.lng}</div>}</div>}</div>)}</div></div>}
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
          {showIssue&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Report Issue</h3><button onClick={()=>setShowIssue(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="space-y-3"><input value={ni.title} onChange={e=>setNi(p=>({...p,title:e.target.value}))} placeholder="Issue title..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-2">{["high","medium","low"].map(s=>{const sc=SEV_COLOR[s];return<button key={s} onClick={()=>setNi(p=>({...p,severity:s}))} className={`p-2.5 rounded-xl text-xs font-bold border-2 capitalize transition-all ${ni.severity===s?`${sc.bg} ${sc.text} ${sc.border}`:"border-slate-200 text-slate-500"}`}>{s}</button>;})}</div><textarea value={ni.description} onChange={e=>setNi(p=>({...p,description:e.target.value}))} placeholder="Describe the issue..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/><AttachmentInput files={ni.attachments||[]} onChange={attachments=>setNi(p=>({...p,attachments}))} label="Upload issue photos / evidence"/><button onClick={addIssue} className="px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm">Report</button></div></div>}
          <div className="space-y-3">{iss.map(i=>{const sc=SEV_COLOR[i.severity];return(
            <div key={i.id} className={`bg-white rounded-2xl border p-5 ${i.status==="resolved"?"border-slate-100 opacity-70":"border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>{i.severity}</span>{i.status==="resolved"&&<span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Resolved</span>}</div><div className="font-semibold text-slate-800 text-sm">{i.title}</div><div className="text-xs text-slate-400 mt-0.5">By {i.reported_by} · {fmtDate(i.reported_date)}{i.resolved_date&&` · Fixed ${fmtDate(i.resolved_date)}`}</div></div>
                {i.status==="open"&&can(user,"resolveIssue")&&<button onClick={()=>resolveIssue(i.id)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition-all flex-shrink-0"><Ic n="check" s={12}/>Resolve</button>}
              </div>
              {i.description&&<p className="text-slate-500 text-sm">{i.description}</p>}
              <AttachmentList files={i.attachments||[]}/>
              <Comments entityId={i.id} comments={comments} setComments={setComments} user={user}/>
            </div>
          );})}{iss.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="alert" s={32} c="mx-auto mb-3 opacity-30"/><p>No issues reported</p></div>}</div>
        </div>
      )}

      {/* ── MATERIALS ── */}
      {tab==="materials"&&(
        <div>
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Material Deliveries</h2><p className="text-xs text-slate-400 mt-0.5">{mats.filter(m=>m.status==="received").length} received · {pendingMats} expected</p></div>{can(user,"addMaterial")&&<button onClick={()=>setShowMat(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Log Delivery</button>}</div>
          {showMat&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Delivery Log</h3><button onClick={()=>setShowMat(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Material</label><input value={nmat.material} onChange={e=>setNmat(p=>({...p,material:e.target.value}))} placeholder="TMT Steel - Fe500" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Quantity</label><input value={nmat.quantity} onChange={e=>setNmat(p=>({...p,quantity:e.target.value}))} placeholder="15 tons" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widests mb-1 block">Supplier</label><input value={nmat.supplier} onChange={e=>setNmat(p=>({...p,supplier:e.target.value}))} placeholder="Vizag Steel" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Status</label><select value={nmat.status} onChange={e=>setNmat(p=>({...p,status:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="expected">Expected</option><option value="received">Received</option><option value="rejected">Rejected</option></select></div></div><div className="mb-3"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label><input value={nmat.notes} onChange={e=>setNmat(p=>({...p,notes:e.target.value}))} placeholder="Inspection notes..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div className="mb-3"><AttachmentInput files={nmat.attachments||[]} onChange={attachments=>setNmat(p=>({...p,attachments}))} label="Upload delivery challan / test certificate"/></div><button onClick={addMat} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Log</button></div>}
          <div className="space-y-3">{mats.map(m=>{const sc=MAT_STATUS[m.status]||MAT_STATUS.expected;return(
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="truck" s={18} c="text-blue-600"/></div>
              <div className="flex-1 min-w-0"><div className="flex items-start justify-between gap-2 mb-1"><div className="font-semibold text-slate-800 text-sm">{m.material}</div><span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${sc.bg} ${sc.text} ${sc.border}`}>{m.status}</span></div><div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-1"><span>{m.quantity}</span><span>{m.supplier}</span><span>{fmtDate(m.date)}</span></div>{m.notes&&<p className="text-xs text-slate-500">{m.notes}</p>}<AttachmentList files={m.attachments||[]}/></div>
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
                  {[{role:"pm",label:"Project Manager",sub:"Site team access",col:"blue"},{role:"contractor",label:"Contractor",sub:"Execution team access",col:"violet"},{role:"client",label:"Client",sub:"Client portal access",col:"emerald"}].map(r=>(
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
              <div className="mb-4"><AttachmentInput files={ndraw.files||[]} onChange={files=>setNdraw(p=>({...p,files}))} label="Upload drawing / PDF / CAD file" accept={DRAWING_ACCEPT} maxMb={20}/></div>
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
                            ?[{role:"pm",label:"PM",col:"blue"},{role:"contractor",label:"Contractor",col:"violet"},{role:"client",label:"Client",col:"emerald"}].map(r=>(
                              <button key={r.role} onClick={()=>toggleRelease(d.id,r.role)} className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${d.released_to.includes(r.role)?`bg-${r.col}-50 text-${r.col}-700 border-${r.col}-200`:"bg-slate-50 text-slate-400 border-slate-200 line-through"}`}>
                                {r.label} {d.released_to.includes(r.role)?"✓":"✗"}
                              </button>
                            ))
                            :<span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200">You</span>
                          }
                        </div>
                        {/* File list with optional Markup button per image */}
                        {(d.files||d.attachments||[]).filter(a=>a.kind==="image"||a.type?.startsWith("image/")).length>0&&user.role!=="client"&&
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(d.files||d.attachments||[]).filter(a=>a.kind==="image"||a.type?.startsWith("image/")).map(att=>(
                              <button key={att.id} onClick={()=>setMarkupTarget({drawingId:d.id,attachment:att})} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wide rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100" style={{border:"1px solid rgba(217,119,6,.25)"}}>
                                <Ic n="pencil" s={11}/>Markup {att.name?.split(".").shift().slice(0,18)}{att.markup_of?" ✎":""}
                              </button>
                            ))}
                          </div>
                        }
                        <AttachmentList files={d.files||d.attachments||[]}/>
                      </div>
                    </div>
                    {user.role==="architect"&&(
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={()=>setDrawingStatus(d.id,d.status==="current"?"superseded":"current")} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all">{d.status==="current"?"Supersede":"Reinstate"}</button>
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                {[["Total",drws.length,"text-slate-700"],["Current",drws.filter(d=>d.status==="current").length,"text-emerald-600"],["PM Current",drws.filter(d=>isReleasedCurrentDrawing(d,"pm")).length,"text-blue-600"],["Contractor Current",drws.filter(d=>isReleasedCurrentDrawing(d,"contractor")).length,"text-violet-600"],["Client Current",drws.filter(d=>isReleasedCurrentDrawing(d,"client")).length,"text-emerald-600"]].map(([l,v,t])=><div key={l}><div className={`text-2xl font-black ${t}`}>{v}</div><div className="text-xs text-slate-400 mt-0.5">{l}</div></div>)}
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
        {can(user,"addExpense")&&<div className="mb-4">{!showEx?<button onClick={()=>setShowEx(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Add Expense</button>:<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Expense</h3><button onClick={()=>setShowEx(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Category</label><select value={ne.cat} onChange={e=>setNe(p=>({...p,cat:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Date</label><input type="date" value={ne.date} onChange={e=>setNe(p=>({...p,date:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Description</label><input value={ne.desc} onChange={e=>setNe(p=>({...p,desc:e.target.value}))} placeholder="Cement - 200 bags" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Amount (₹)</label><input type="number" value={ne.amt} onChange={e=>setNe(p=>({...p,amt:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><div className="grid grid-cols-3 gap-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">GST %</label><select value={ne.gst} onChange={e=>setNe(p=>({...p,gst:+e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">TDS %</label><select value={ne.tds} onChange={e=>setNe(p=>({...p,tds:+e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="0">0%</option><option value="1">1%</option><option value="2">2%</option><option value="10">10%</option></select></div><div className="bg-slate-50 rounded-xl p-3 text-xs"><div className="text-slate-400 font-semibold mb-1">Net Payable</div><div className="font-black text-slate-800">{fmtCur((parseFloat(ne.amt)||0)*(1+(+ne.gst||0)/100)*(1-(+ne.tds||0)/100))}</div></div></div><div className="mt-3"><AttachmentInput files={ne.attachments||[]} onChange={attachments=>setNe(p=>({...p,attachments}))} label="Upload bill / receipt"/></div><button onClick={addEx} className="mt-4 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Expense</button></div>}</div>}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="p-5 border-b border-slate-100"><h3 className="font-bold text-slate-800 text-sm">Expense Log</h3></div>{ex.length===0?<div className="text-center py-12 text-slate-400 text-sm">No expenses recorded</div>:<div className="divide-y divide-slate-50">{ex.map(e=><div key={e.id} className="px-5 py-4 hover:bg-slate-50"><div className="flex items-center gap-4"><span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${CAT_COLORS[e.category]||"bg-slate-100 text-slate-500"}`}>{e.category}</span><div className="flex-1 min-w-0"><div className="font-semibold text-slate-700 text-sm truncate">{e.description}</div><div className="text-xs text-slate-400">{fmtDate(e.date)}</div></div><div className="font-bold text-slate-800 text-sm">{fmtCur(e.amount)}</div>{can(user,"deleteExpense")&&<button onClick={()=>delEx(e.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={15}/></button>}</div><AttachmentList files={e.attachments||[]}/></div>)}</div>}</div>
      </div>:<AccessDenied msg="Budget information is not available in client view."/>)}

      {/* ── TASKS ── */}
      {tab==="tasks"&&<TasksTab pid={pid} ms={ms} tm={tm} tks={tks} setTasks={setTasks} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── PUNCH LIST ── */}
      {tab==="punchlist"&&<PunchTab pid={pid} pns={pns} setPunch={setPunch} user={user} can={can} addActivity={addActivity} proj={proj} tm={tm}/>}

      {/* ── RFI ── */}
      {tab==="rfi"&&<RFITab pid={pid} rfis={rfis} setRfi={setRfi} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── CHANGE ORDERS ── */}
      {tab==="changeorders"&&<COTab pid={pid} cos={cos} setCo={setCo} user={user} can={can} addActivity={addActivity} proj={proj}/>}
      {tab==="fieldops"&&<FieldOpsTab pid={pid} user={user} can={can} proj={proj} equipment={eqs} setEquipment={setEquipment} diary={dys} setDiary={setDiary} worklogs={wls} setWorklogs={setWorklogs} checklists={cls} setChecklists={setChecklists} addActivity={addActivity}/>}
      {tab==="approvals"&&<ApprovalsTab pid={pid} user={user} proj={proj} submittals={subs} setSubmittals={setSubmittals} permits={prs} setPermits={setPermits} addActivity={addActivity}/>}

      {/* ── INSPECTIONS ── */}
      {tab==="inspections"&&<InspectionsTab pid={pid} inss={inss} setInspections={setInspections} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── SAFETY ── */}
      {tab==="safety"&&<SafetyTab pid={pid} sfs={sfs} setSafety={setSafety} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── PO (per-project) ── */}
      {tab==="po"&&<ProjectPOTab pid={pid} projPOs={projPOs} setPos={setPos} vendors={vendors} user={user} can={can} proj={proj}/>}

      {/* ── INVOICES ── */}
      {tab==="invoices"&&<InvoicesTab pid={pid} invs={invs} ms={ms} setInvoices={setInvoices} user={user} can={can} proj={proj}/>}

      {/* ── LABOUR REGISTER ── */}
      {tab==="labour"&&<LabourTab pid={pid} lbs={lbs} setLabour={setLabour} user={user} can={can} proj={proj}/>}

      {/* ── RA BILLS ── */}
      {tab==="rabills"&&<RABillsTab pid={pid} ras={ras} setRa={setRa} user={user} can={can} proj={proj}/>}
      {tab==="map"&&<MapTab project={proj} teams={tm} materials={mats} equipment={eqs} issues={iss}/>}
      {tab==="ai"&&<AIInsightsTab project={proj} milestones={ms} issues={iss} tasks={tks} rfis={rfis} submittals={subs} permits={prs} safety={sfs} expenses={ex} worklogs={wls}/>}

      {/* ── BOQ (Bill of Quantities) ── */}
      {tab==="boq"&&<BOQTab pid={pid} bq={bq} setBoq={setBoq} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── ESTIMATE (client-facing quote on top of BOQ) ── */}
      {tab==="estimate"&&<EstimateTab pid={pid} bq={bq} est={est} setEstimate={setEstimate} user={user} addActivity={addActivity} proj={proj}/>}

      {/* ── INVENTORY LEDGER ── */}
      {tab==="ledger"&&<LedgerTab pid={pid} lg={lg} setLedger={setLedger} mats={mats} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── GANTT ── */}
      {tab==="gantt"&&<GanttView project={proj} milestones={ms}/>}
    </div>
  );
}

// ── NEW TAB COMPONENTS ───────────────────────────────────────────────────────
function FieldOpsTab({pid,user,can,proj,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,addActivity}){
  const[mode,setMode]=useState("diary");
  const[show,setShow]=useState(false);
  const[nd,setNd]=useState({date:new Date().toISOString().split("T")[0],weather:"",visitors:"",instructions:"",work_done:"",workers_total:"",remarks:"",attachments:[]});
  const[nw,setNw]=useState({date:new Date().toISOString().split("T")[0],contractor:user.role==="contractor"?user.name:"",location:"",work:"",workers:"",hours:"",attachments:[]});
  const[ne,setNe]=useState({name:"",type:"Crane",reg_no:"",supplier:"",hired:true,notes:"",attachments:[]});
  const[nc,setNc]=useState({title:"",type:"Quality",milestone_ref:"",items:"",attachments:[]});
  const canEdit=user.role!=="client";
  const addDiary=()=>{if(!nd.work_done.trim())return;setDiary(p=>({...p,[pid]:[{id:"di_"+Date.now(),...nd,workers_total:+nd.workers_total||0},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added site diary",nd.work_done.slice(0,70),user.name,user.role);setNd({date:new Date().toISOString().split("T")[0],weather:"",visitors:"",instructions:"",work_done:"",workers_total:"",remarks:"",attachments:[]});setShow(false);};
  const addWorklog=()=>{if(!nw.work.trim())return;setWorklogs(p=>({...p,[pid]:[{id:"wl_"+Date.now(),...nw,workers:+nw.workers||0,hours:+nw.hours||0,status:user.role==="contractor"?"submitted":"approved"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Submitted worklog",nw.work.slice(0,70),user.name,user.role);setNw({date:new Date().toISOString().split("T")[0],contractor:user.role==="contractor"?user.name:"",location:"",work:"",workers:"",hours:"",attachments:[]});setShow(false);};
  const addEquipment=()=>{if(!ne.name.trim())return;setEquipment(p=>({...p,[pid]:[{id:"eq_"+Date.now(),...ne,status:"on_site",entry_date:new Date().toISOString().split("T")[0],exit_date:null},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added equipment",ne.name,user.name,user.role);setNe({name:"",type:"Crane",reg_no:"",supplier:"",hired:true,notes:"",attachments:[]});setShow(false);};
  const addChecklist=()=>{if(!nc.title.trim())return;setChecklists(p=>({...p,[pid]:[{id:"cl_"+Date.now(),...nc,items:nc.items.split("\n").map(x=>x.trim()).filter(Boolean),status:"pending",checked_by:"",date:""},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Created checklist",nc.title,user.name,user.role);setNc({title:"",type:"Quality",milestone_ref:"",items:"",attachments:[]});setShow(false);};
  const updateWorklog=(id,status)=>setWorklogs(p=>({...p,[pid]:(p[pid]||[]).map(w=>w.id===id?{...w,status}:w)}));
  const removeEquipment=id=>setEquipment(p=>({...p,[pid]:(p[pid]||[]).map(e=>e.id===id?{...e,status:"removed",exit_date:new Date().toISOString().split("T")[0]}:e)}));
  const passChecklist=(id,status)=>setChecklists(p=>({...p,[pid]:(p[pid]||[]).map(c=>c.id===id?{...c,status,checked_by:user.name,date:new Date().toISOString().split("T")[0]}:c)}));
  const modes=[["diary","Site Diary"],["worklog","Worklogs"],["equipment","Equipment"],["checklist","Checklists"]];
  return(
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div><h2 className="font-bold text-slate-800">Field Ops</h2><p className="text-xs text-slate-400 mt-0.5">Daily diary, contractor worklogs, equipment and checklists</p></div>
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto">{modes.map(([k,l])=><button key={k} onClick={()=>{setMode(k);setShow(false);}} className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${mode===k?"bg-white text-slate-800 shadow-sm":"text-slate-500"}`}>{l}</button>)}</div>
      </div>
      {canEdit&&<button onClick={()=>setShow(p=>!p)} className="mb-4 flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New {modes.find(m=>m[0]===mode)?.[1]}</button>}
      {show&&mode==="diary"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">Daily Site Diary</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-3 gap-3"><input type="date" value={nd.date} onChange={e=>setNd(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nd.weather} onChange={e=>setNd(p=>({...p,weather:e.target.value}))} placeholder="Weather" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="number" value={nd.workers_total} onChange={e=>setNd(p=>({...p,workers_total:e.target.value}))} placeholder="Workers" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><textarea value={nd.work_done} onChange={e=>setNd(p=>({...p,work_done:e.target.value}))} placeholder="Work done today" className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none h-24"/><div className="grid md:grid-cols-2 gap-3"><input value={nd.visitors} onChange={e=>setNd(p=>({...p,visitors:e.target.value}))} placeholder="Visitors" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nd.instructions} onChange={e=>setNd(p=>({...p,instructions:e.target.value}))} placeholder="Instructions" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><input value={nd.remarks} onChange={e=>setNd(p=>({...p,remarks:e.target.value}))} placeholder="Remarks" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={nd.attachments||[]} onChange={attachments=>setNd(p=>({...p,attachments}))} label="Upload diary photos / visitor notes"/><button onClick={addDiary} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Save Diary</button></div>}
      {show&&mode==="worklog"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">Contractor Worklog</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-3 gap-3"><input type="date" value={nw.date} onChange={e=>setNw(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nw.contractor} onChange={e=>setNw(p=>({...p,contractor:e.target.value}))} placeholder="Contractor" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nw.location} onChange={e=>setNw(p=>({...p,location:e.target.value}))} placeholder="Location" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><textarea value={nw.work} onChange={e=>setNw(p=>({...p,work:e.target.value}))} placeholder="Work completed / pending" className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none h-24"/><div className="grid md:grid-cols-2 gap-3"><input type="number" value={nw.workers} onChange={e=>setNw(p=>({...p,workers:e.target.value}))} placeholder="Workers" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="number" value={nw.hours} onChange={e=>setNw(p=>({...p,hours:e.target.value}))} placeholder="Hours" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><AttachmentInput files={nw.attachments||[]} onChange={attachments=>setNw(p=>({...p,attachments}))} label="Upload worklog photos / measurement proof"/><button onClick={addWorklog} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Submit Worklog</button></div>}
      {show&&mode==="equipment"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">Add Equipment</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-2 gap-3"><input value={ne.name} onChange={e=>setNe(p=>({...p,name:e.target.value}))} placeholder="Equipment name" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={ne.type} onChange={e=>setNe(p=>({...p,type:e.target.value}))} placeholder="Type" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={ne.reg_no} onChange={e=>setNe(p=>({...p,reg_no:e.target.value}))} placeholder="Reg / ID no." className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={ne.supplier} onChange={e=>setNe(p=>({...p,supplier:e.target.value}))} placeholder="Supplier" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={ne.hired} onChange={e=>setNe(p=>({...p,hired:e.target.checked}))} className="accent-orange-500"/>Hired equipment</label><input value={ne.notes} onChange={e=>setNe(p=>({...p,notes:e.target.value}))} placeholder="Notes / service due" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={ne.attachments||[]} onChange={attachments=>setNe(p=>({...p,attachments}))} label="Upload equipment documents"/><button onClick={addEquipment} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Add Equipment</button></div>}
      {show&&mode==="checklist"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">New Checklist</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-3 gap-3"><input value={nc.title} onChange={e=>setNc(p=>({...p,title:e.target.value}))} placeholder="Checklist title" className="p-3 border border-slate-200 rounded-xl text-sm md:col-span-2"/><select value={nc.type} onChange={e=>setNc(p=>({...p,type:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"><option>Quality</option><option>Safety</option><option>Material</option><option>Handover</option></select></div><input value={nc.milestone_ref} onChange={e=>setNc(p=>({...p,milestone_ref:e.target.value}))} placeholder="Milestone / location reference" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><textarea value={nc.items} onChange={e=>setNc(p=>({...p,items:e.target.value}))} placeholder={"One item per line\nRebar spacing checked\nCover blocks placed"} className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none h-28 font-mono"/><AttachmentInput files={nc.attachments||[]} onChange={attachments=>setNc(p=>({...p,attachments}))} label="Upload checklist evidence"/><button onClick={addChecklist} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Create Checklist</button></div>}
      {mode==="diary"&&<div className="space-y-3">{diary.map(d=><div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{fmtDate(d.date)}</div><div className="text-xs text-slate-400 mt-0.5">{d.weather} - {d.workers_total||0} workers</div></div><button onClick={()=>window.print()} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">Daily Report</button></div><p className="text-sm text-slate-600 mt-3">{d.work_done}</p>{d.instructions&&<p className="text-xs text-orange-700 mt-2">Instruction: {d.instructions}</p>}<AttachmentList files={d.attachments||[]}/></div>)}{diary.length===0&&<div className="text-center py-16 text-slate-400">No diary entries</div>}</div>}
      {mode==="worklog"&&<div className="space-y-3">{worklogs.map(w=><div key={w.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{w.work}</div><div className="text-xs text-slate-400 mt-1">{w.contractor} - {w.location} - {fmtDate(w.date)} - {w.workers} workers - {w.hours}h</div></div><Badge status={w.status}/></div>{user.role!=="contractor"&&w.status==="submitted"&&<div className="mt-3 flex gap-2"><button onClick={()=>updateWorklog(w.id,"approved")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approve</button><button onClick={()=>updateWorklog(w.id,"revise")} className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">Revise</button></div>}<AttachmentList files={w.attachments||[]}/></div>)}{worklogs.length===0&&<div className="text-center py-16 text-slate-400">No worklogs</div>}</div>}
      {mode==="equipment"&&<div className="grid md:grid-cols-2 gap-3">{equipment.map(e=><div key={e.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{e.name}</div><div className="text-xs text-slate-400 mt-1">{e.type} - {e.reg_no} - {e.supplier}</div></div><Badge status={e.status}/></div>{e.notes&&<p className="text-xs text-slate-500 mt-3">{e.notes}</p>}{canEdit&&e.status==="on_site"&&<button onClick={()=>removeEquipment(e.id)} className="mt-3 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">Mark Removed</button>}<AttachmentList files={e.attachments||[]}/></div>)}{equipment.length===0&&<div className="col-span-2 text-center py-16 text-slate-400">No equipment records</div>}</div>}
      {mode==="checklist"&&<div className="space-y-3">{checklists.map(c=><div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{c.title}</div><div className="text-xs text-slate-400 mt-1">{c.type} - {c.milestone_ref||"No reference"}</div></div><Badge status={c.status}/></div><ul className="mt-3 space-y-1">{(c.items||[]).map((it,i)=><li key={i} className="text-xs text-slate-600 flex gap-2"><span className="text-emerald-500">OK</span>{it}</li>)}</ul>{canEdit&&<div className="mt-3 flex gap-2"><button onClick={()=>passChecklist(c.id,"passed")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Pass</button><button onClick={()=>passChecklist(c.id,"failed")} className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg">Fail</button></div>}<AttachmentList files={c.attachments||[]}/></div>)}{checklists.length===0&&<div className="text-center py-16 text-slate-400">No checklists</div>}</div>}
    </div>
  );
}

function ApprovalsTab({pid,user,proj,submittals,setSubmittals,permits,setPermits,addActivity}){
  const[mode,setMode]=useState("submittals");const[show,setShow]=useState(false);
  const[ns,setNs]=useState({title:"",trade:"Structural",package:"",due_date:"",notes:"",attachments:[]});
  const[np,setNp]=useState({title:"",authority:"",due_date:"",expiry:"",notes:"",attachments:[]});
  const canEdit=user.role!=="client";
  const nextSub="SUB-"+String(submittals.length+1).padStart(3,"0");
  const addSub=()=>{if(!ns.title.trim())return;setSubmittals(p=>({...p,[pid]:[{id:"sub_"+Date.now(),no:nextSub,...ns,status:"submitted",bic:"Architect"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Submitted submittal",ns.title,user.name,user.role);setNs({title:"",trade:"Structural",package:"",due_date:"",notes:"",attachments:[]});setShow(false);};
  const addPermit=()=>{if(!np.title.trim())return;setPermits(p=>({...p,[pid]:[{id:"per_"+Date.now(),...np,status:"pending"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added permit",np.title,user.name,user.role);setNp({title:"",authority:"",due_date:"",expiry:"",notes:"",attachments:[]});setShow(false);};
  const updateSub=(id,status)=>setSubmittals(p=>({...p,[pid]:(p[pid]||[]).map(s=>s.id===id?{...s,status,bic:status==="approved"?"Closed":"Contractor"}:s)}));
  const updatePermit=(id,status)=>setPermits(p=>({...p,[pid]:(p[pid]||[]).map(s=>s.id===id?{...s,status}:s)}));
  return(
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap"><div><h2 className="font-bold text-slate-800">Approvals</h2><p className="text-xs text-slate-400 mt-0.5">Submittals, material approvals and statutory permits</p></div><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={()=>{setMode("submittals");setShow(false);}} className={`px-3 py-2 rounded-lg text-xs font-bold ${mode==="submittals"?"bg-white shadow-sm":"text-slate-500"}`}>Submittals</button><button onClick={()=>{setMode("permits");setShow(false);}} className={`px-3 py-2 rounded-lg text-xs font-bold ${mode==="permits"?"bg-white shadow-sm":"text-slate-500"}`}>Permits</button></div></div>
      {canEdit&&<button onClick={()=>setShow(p=>!p)} className="mb-4 flex items-center gap-2 px-5 py-3 bg-orange-500 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New {mode==="submittals"?"Submittal":"Permit"}</button>}
      {show&&mode==="submittals"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">New Submittal ({nextSub})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><input value={ns.title} onChange={e=>setNs(p=>({...p,title:e.target.value}))} placeholder="Submittal title" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><div className="grid md:grid-cols-3 gap-3"><select value={ns.trade} onChange={e=>setNs(p=>({...p,trade:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"><option>Structural</option><option>MEP</option><option>Facade</option><option>Finishes</option><option>Safety</option></select><input value={ns.package} onChange={e=>setNs(p=>({...p,package:e.target.value}))} placeholder="Package / spec" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="date" value={ns.due_date} onChange={e=>setNs(p=>({...p,due_date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/></div><input value={ns.notes} onChange={e=>setNs(p=>({...p,notes:e.target.value}))} placeholder="Notes" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={ns.attachments||[]} onChange={attachments=>setNs(p=>({...p,attachments}))} label="Upload product data / shop drawing"/><button onClick={addSub} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Submit</button></div>}
      {show&&mode==="permits"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">New Permit</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><input value={np.title} onChange={e=>setNp(p=>({...p,title:e.target.value}))} placeholder="Permit / NOC name" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><div className="grid md:grid-cols-3 gap-3"><input value={np.authority} onChange={e=>setNp(p=>({...p,authority:e.target.value}))} placeholder="Authority" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="date" value={np.due_date} onChange={e=>setNp(p=>({...p,due_date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="date" value={np.expiry} onChange={e=>setNp(p=>({...p,expiry:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/></div><input value={np.notes} onChange={e=>setNp(p=>({...p,notes:e.target.value}))} placeholder="Notes / conditions" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={np.attachments||[]} onChange={attachments=>setNp(p=>({...p,attachments}))} label="Upload permit / NOC document"/><button onClick={addPermit} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Add Permit</button></div>}
      {mode==="submittals"&&<div className="space-y-3">{submittals.map(s=><div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="flex gap-2 items-center"><span className="text-xs font-mono font-bold text-orange-600">{s.no}</span><Badge status={s.status}/></div><div className="font-bold text-slate-800 text-sm mt-1">{s.title}</div><div className="text-xs text-slate-400 mt-1">{s.trade} - {s.package} - Due {fmtDate(s.due_date)} - BIC {s.bic}</div></div></div>{s.notes&&<p className="text-xs text-slate-500 mt-3">{s.notes}</p>}{user.role==="architect"&&s.status!=="approved"&&<div className="flex gap-2 mt-3"><button onClick={()=>updateSub(s.id,"approved")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approve</button><button onClick={()=>updateSub(s.id,"revise_resubmit")} className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">Revise</button></div>}<AttachmentList files={s.attachments||[]}/></div>)}{submittals.length===0&&<div className="text-center py-16 text-slate-400">No submittals</div>}</div>}
      {mode==="permits"&&<div className="space-y-3">{permits.map(p=><div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{p.title}</div><div className="text-xs text-slate-400 mt-1">{p.authority} - Due {fmtDate(p.due_date)}{p.expiry?` - Expires ${fmtDate(p.expiry)}`:""}</div></div><Badge status={p.status}/></div>{p.notes&&<p className="text-xs text-slate-500 mt-3">{p.notes}</p>}{user.role!=="client"&&<div className="flex gap-2 mt-3"><button onClick={()=>updatePermit(p.id,"approved")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approved</button><button onClick={()=>updatePermit(p.id,"pending")} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">Pending</button></div>}<AttachmentList files={p.attachments||[]}/></div>)}{permits.length===0&&<div className="text-center py-16 text-slate-400">No permits</div>}</div>}
    </div>
  );
}

function MapTab({project,teams,materials,equipment,issues}){
  const lat=project.lat||17.3850,lng=project.lng||78.4867;
  const bbox=`${lng-0.01}%2C${lat-0.006}%2C${lng+0.01}%2C${lat+0.006}`;
  const risk=issues.filter(i=>i.status==="open"&&i.severity==="high").length;
  return(
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden"><iframe title="Project map" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`} className="w-full h-[420px] border-0"/></div>
      <div className="space-y-4"><SC icon="map" label="Location" value={project.location} accent="orange"/><div className="bg-white rounded-2xl border border-slate-200 p-5"><h3 className="font-bold text-slate-800 text-sm mb-3">Site Snapshot</h3><div className="space-y-2 text-xs text-slate-500"><div className="flex justify-between"><span>Team members</span><b>{teams.length}</b></div><div className="flex justify-between"><span>Pending materials</span><b>{materials.filter(m=>m.status==="expected").length}</b></div><div className="flex justify-between"><span>On-site equipment</span><b>{equipment.filter(e=>e.status==="on_site").length}</b></div><div className="flex justify-between"><span>High risk issues</span><b className={risk?"text-red-600":"text-emerald-600"}>{risk}</b></div></div></div><a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener" className="block text-center px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold">Open in Maps</a></div>
    </div>
  );
}

function AIInsightsTab({project,milestones,issues,tasks,rfis,submittals,permits,safety,expenses,worklogs}){
  const payload={project,milestones,issues,tasks,rfis,submittals,permits,safety,expenses,worklogs};
  const risk=useMemo(()=>computeRiskScore(payload),[project,milestones,issues,tasks,rfis,submittals,permits,safety,expenses,worklogs]);
  const today=new Date().toISOString().split("T")[0];
  const high=issues.filter(i=>i.status==="open"&&i.severity==="high").length;
  const overdueTasks=tasks.filter(t=>t.status!=="completed"&&t.due&&t.due<today).length;
  const openRfi=rfis.filter(r=>r.status==="open").length;
  const pendingSubs=submittals.filter(s=>!["approved","closed"].includes(s.status)).length;
  const pendingPermits=permits.filter(p=>p.status!=="approved").length;
  const openSafety=safety.filter(s=>s.status!=="closed").length;
  const spend=expenses.reduce((s,e)=>s+(+e.amount||0),0);
  const budgetPct=Math.round((spend/project.budget)*100)||0;
  const actions=[high&&`${high} high severity issue(s): assign owner and block unsafe work areas today.`,overdueTasks&&`${overdueTasks} overdue task(s): move them into today's coordination meeting.`,openRfi&&`${openRfi} open RFI(s): prioritize answers that impact cost or schedule.`,pendingSubs&&`${pendingSubs} submittal(s) pending: check long-lead material impact.`,pendingPermits&&`${pendingPermits} permit/NOC item(s) pending: avoid inspection and handover delay.`,budgetPct>85&&`Budget usage is ${budgetPct}%: review change orders, POs and RA bills before new commitments.`,!worklogs.length&&"No recent contractor worklog: ask contractor to submit field progress with photos."].filter(Boolean);

  // LLM-powered narrative — opt-in via Settings (provider + key)
  const[llm,setLlm]=useState({state:"idle",text:"",error:""});
  const[showSettings,setShowSettings]=useState(false);
  const[provCfg,setProvCfg]=useState(()=>getProviderConfig());
  const runLLM=async()=>{
    setLlm({state:"loading",text:"",error:""});
    const res=await fetchLLMInsight(payload);
    if(res.ok)setLlm({state:"ready",text:res.text,error:""});
    else setLlm({state:"error",text:"",error:res.error||"failed"});
  };
  const saveCfg=()=>{saveProviderConfig(provCfg);setShowSettings(false);};
  const clearCfg=()=>{clearProviderConfig();setProvCfg({});setShowSettings(false);setLlm({state:"idle",text:"",error:""});};
  const hasKey=!!(provCfg.provider&&provCfg.apiKey);

  const levelColor={healthy:"emerald",watch:"amber",["at-risk"]:"orange",critical:"red"}[risk.level]||"slate";
  return(
    <div className="space-y-6">
      {/* Risk hero */}
      <div className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial relative overflow-hidden" style={{border:"1px solid var(--st-line)"}}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none" style={{background:`radial-gradient(circle, rgba(217,119,6,.08) 0%, transparent 65%)`}}/>
        <div className="relative flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Project intelligence</div>
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Risk &amp; health</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowSettings(s=>!s)} className="px-3 py-2 bg-cream-200 text-ink-700 text-xs font-bold rounded-lg" style={{border:"1px solid var(--st-line)"}}>{hasKey?`AI: ${provCfg.provider}`:"Configure AI"}</button>
            {hasKey&&<button onClick={runLLM} className="px-4 py-2 bg-gradient-gold text-white text-xs font-bold rounded-lg tracking-wide">{llm.state==="loading"?"Thinking…":"Ask AI"}</button>}
          </div>
        </div>
        {showSettings&&<div className="mb-5 p-5 bg-cream-200/60 rounded-xl space-y-3" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">— LLM provider</div>
          <div className="grid grid-cols-2 gap-2">
            {["anthropic","openai"].map(p=>
              <button key={p} onClick={()=>setProvCfg(c=>({...c,provider:p}))} className={`px-3 py-2 rounded-lg text-xs font-bold tracking-wider uppercase border ${provCfg.provider===p?"bg-amber-50 text-amber-800 border-amber-300":"bg-white text-ink-600 border-stone-200"}`}>{p==="anthropic"?"Claude (Anthropic)":"GPT (OpenAI)"}</button>
            )}
          </div>
          <input value={provCfg.apiKey||""} onChange={e=>setProvCfg(c=>({...c,apiKey:e.target.value}))} placeholder="Paste API key (stays in this browser)" type="password" className="w-full p-3 border border-stone-200 rounded-xl text-xs font-mono outline-none focus:border-amber-600"/>
          <input value={provCfg.model||""} onChange={e=>setProvCfg(c=>({...c,model:e.target.value}))} placeholder={provCfg.provider==="openai"?"Model (default: gpt-4o-mini)":"Model (default: claude-3-5-haiku-20241022)"} className="w-full p-3 border border-stone-200 rounded-xl text-xs font-mono outline-none focus:border-amber-600"/>
          <p className="text-[11px] text-ink-500 leading-relaxed">Key never leaves your browser except to the LLM provider's API. For multi-user production, route through the Supabase Edge Function described in <span className="font-semibold">docs/BACKEND_PLAN.md</span>.</p>
          <div className="flex gap-2"><button onClick={saveCfg} className="px-4 py-2 bg-gradient-gold text-white text-xs font-bold rounded-lg">Save</button>{hasKey&&<button onClick={clearCfg} className="px-4 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-lg" style={{border:"1px solid rgba(220,38,38,.2)"}}>Remove key</button>}</div>
        </div>}

        <div className="grid md:grid-cols-3 gap-6 items-center">
          <div>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-2">Health score</div>
            <div className="font-display text-6xl font-light tracking-editorial leading-none">{risk.score}<span className="text-2xl text-ink-500">/100</span></div>
            <div className={`text-xs font-bold tracking-[0.18em] uppercase mt-2 inline-block px-2.5 py-1 rounded-full bg-${levelColor}-50 text-${levelColor}-700`} style={{border:"1px solid var(--st-line)"}}>{risk.level}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-2">Factors</div>
            <div className="space-y-1.5">
              {risk.factors.length===0?<div className="text-sm text-ink-500 italic">No risk factors detected from current data.</div>:risk.factors.map((f,i)=>
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full ${f.sign==="neg"?"bg-red-500":"bg-emerald-500"}`}/>
                  <span className="flex-1 text-ink-700">{f.label}</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-ink-500">±{f.weight}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LLM narrative output */}
        {llm.state==="ready"&&<div className="mt-6 pt-6" style={{borderTop:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-2">— AI narrative</div>
          <p className="font-display text-base leading-relaxed text-ink-800 italic tracking-editorial whitespace-pre-line">"{llm.text}"</p>
        </div>}
        {llm.state==="error"&&<div className="mt-4 p-3 bg-red-50 rounded-xl text-xs text-red-700 font-semibold" style={{border:"1px solid rgba(220,38,38,.2)"}}>AI call failed: {llm.error}</div>}
        {!hasKey&&<p className="text-[11px] text-ink-500 mt-5 leading-relaxed">Add an LLM API key (Claude or GPT) to get an editorial narrative summary on demand. Without a key, the deterministic risk score above is fully functional.</p>}
      </div>

      <div className="grid md:grid-cols-4 gap-4"><SC icon="alert" label="High Issues" value={high} accent={high?"red":"emerald"}/><SC icon="qa" label="Open RFIs" value={openRfi} accent={openRfi?"orange":"emerald"}/><SC icon="clipboard" label="Overdue Tasks" value={overdueTasks} accent={overdueTasks?"red":"emerald"}/><SC icon="wallet" label="Budget Used" value={`${budgetPct}%`} accent={budgetPct>90?"red":"blue"}/></div>

      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Today's actions</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-4 tracking-editorial">Site Copilot</h2>
        {actions.length?<div className="space-y-2">{actions.map((a,i)=>
          <div key={i} className="flex gap-3 p-3 rounded-xl bg-amber-50 text-sm text-ink-800" style={{border:"1px solid rgba(217,119,6,.15)"}}>
            <span className="font-display font-bold text-amber-800">{i+1}</span><span>{a}</span>
          </div>
        )}</div>:<div className="text-sm text-ink-500 italic">No immediate critical action detected from current project data.</div>}
        <p className="text-[11px] text-ink-500 mt-4">Rules engine runs deterministically over your project. {hasKey?"Click 'Ask AI' above for an LLM-generated narrative on top of these signals.":"Add an API key to get an AI narrative summary."}</p>
      </div>
    </div>
  );
}

function TasksTab({pid,ms,tm,tks,setTasks,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[nt,setNt]=useState({mid:ms[0]?.id||"",title:"",assignee:tm[0]?.name||"",due:"",priority:"medium"});
  const add=()=>{if(!nt.title.trim())return;setTasks(p=>({...p,[pid]:[{id:"tk_"+Date.now(),...nt,status:"pending"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Created task",nt.title,user.name,user.role);setNt({mid:ms[0]?.id||"",title:"",assignee:tm[0]?.name||"",due:"",priority:"medium"});setShow(false);};
  const cycle=id=>{const cy={pending:"in_progress",in_progress:"completed",completed:"pending"};setTasks(p=>({...p,[pid]:p[pid].map(t=>t.id===id?{...t,status:cy[t.status]}:t)}));};
  const del=id=>setTasks(p=>({...p,[pid]:p[pid].filter(t=>t.id!==id)}));
  const pri={high:"bg-red-50 text-red-600 border-red-200",medium:"bg-amber-50 text-amber-700 border-amber-200",low:"bg-blue-50 text-blue-600 border-blue-200"};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Tasks</h2><p className="text-xs text-slate-400 mt-0.5">{tks.filter(t=>t.status!=="completed").length} pending · {tks.filter(t=>t.status==="completed").length} done</p></div>{can(user,"changeMilestone")&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New Task</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Task</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div>
        <input value={nt.title} onChange={e=>setNt(p=>({...p,title:e.target.value}))} placeholder="Task title" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 mb-3"/>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <select value={nt.mid} onChange={e=>setNt(p=>({...p,mid:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="">No milestone</option>{ms.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select>
          <select value={nt.assignee} onChange={e=>setNt(p=>({...p,assignee:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="">Unassigned</option>{tm.map(m=><option key={m.id}>{m.name}</option>)}</select>
          <input type="date" value={nt.due} onChange={e=>setNt(p=>({...p,due:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <select value={nt.priority} onChange={e=>setNt(p=>({...p,priority:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </div>
        <button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Task</button>
      </div>}
      <div className="space-y-3">{tks.map(t=>{const m=ms.find(x=>x.id===t.mid);return(
        <div key={t.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-3 ${t.status==="completed"?"opacity-60":""}`}>
          <button onClick={()=>can(user,"changeMilestone")&&cycle(t.id)} className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${t.status==="completed"?"bg-emerald-500 border-emerald-500":t.status==="in_progress"?"bg-orange-500 border-orange-500":"border-slate-300"}`}>{t.status==="completed"&&<Ic n="check" s={12} c="text-white"/>}{t.status==="in_progress"&&<div className="w-2 h-2 bg-white rounded-full"/>}</button>
          <div className="flex-1 min-w-0"><div className={`font-semibold text-slate-800 text-sm ${t.status==="completed"?"line-through":""}`}>{t.title}</div><div className="flex flex-wrap gap-2 text-xs text-slate-400 mt-1"><span className={`font-bold px-2 py-0.5 rounded border ${pri[t.priority]}`}>{t.priority}</span>{m&&<span>📍 {m.title}</span>}{t.assignee&&<span>👤 {t.assignee}</span>}{t.due&&<span>📅 {fmtDate(t.due)}</span>}</div></div>
          {can(user,"changeMilestone")&&<button onClick={()=>del(t.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0"><Ic n="trash" s={14}/></button>}
        </div>
      );})}{tks.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="check" s={32} c="mx-auto mb-3 opacity-30"/><p>No tasks yet</p></div>}</div>
    </div>
  );
}

function PunchTab({pid,pns,setPunch,user,can,addActivity,proj,tm}){
  const[show,setShow]=useState(false);
  const[nt,setNt]=useState({title:"",room:"",trade:"Carpentry",assignee:tm[0]?.name||"",attachments:[]});
  const add=()=>{if(!nt.title.trim())return;setPunch(p=>({...p,[pid]:[{id:"pn_"+Date.now(),...nt,status:"open",created:new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added punch item",nt.title,user.name,user.role);setNt({title:"",room:"",trade:"Carpentry",assignee:tm[0]?.name||"",attachments:[]});setShow(false);};
  const cycle=id=>{const cy={open:"in_progress",in_progress:"completed",completed:"open"};setPunch(p=>({...p,[pid]:p[pid].map(x=>x.id===id?{...x,status:cy[x.status]}:x)}));};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Punch List</h2><p className="text-xs text-slate-400 mt-0.5">Close-out checklist · {pns.filter(p=>p.status!=="completed").length} open</p></div>{can(user,"addIssue")&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Add Item</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Punch Item</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nt.title} onChange={e=>setNt(p=>({...p,title:e.target.value}))} placeholder="Issue title (e.g. Paint touch-up)" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-3"><input value={nt.room} onChange={e=>setNt(p=>({...p,room:e.target.value}))} placeholder="Location/Room" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={nt.trade} onChange={e=>setNt(p=>({...p,trade:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{PUNCH_TRADES.map(t=><option key={t}>{t}</option>)}</select><select value={nt.assignee} onChange={e=>setNt(p=>({...p,assignee:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="">Unassigned</option>{tm.map(m=><option key={m.id}>{m.name}</option>)}</select></div><AttachmentInput files={nt.attachments||[]} onChange={attachments=>setNt(p=>({...p,attachments}))} label="Upload punch evidence"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add</button></div></div>}
      <div className="space-y-3">{pns.map(p=>(
        <div key={p.id}>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <button onClick={()=>can(user,"addIssue")&&cycle(p.id)} className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${p.status==="completed"?"bg-emerald-500 border-emerald-500":p.status==="in_progress"?"bg-orange-500 border-orange-500":"border-slate-300"}`}>{p.status==="completed"&&<Ic n="check" s={12} c="text-white"/>}</button>
          <div className="flex-1 min-w-0"><div className={`font-semibold text-slate-800 text-sm ${p.status==="completed"?"line-through opacity-60":""}`}>{p.title}</div><div className="flex flex-wrap gap-2 text-xs text-slate-400 mt-1">{p.room&&<span>📍 {p.room}</span>}<span className="font-bold text-orange-600">{p.trade}</span>{p.assignee&&<span>👤 {p.assignee}</span>}<span>{fmtDate(p.created)}</span></div></div>
          <div className="flex flex-col items-end gap-2">
            <Badge status={p.status==="completed"?"completed":p.status==="in_progress"?"in_progress":"pending"}/>
            {p.attachments?.length>0&&<span className="text-[10px] font-bold text-slate-400">{p.attachments.length} file(s)</span>}
          </div>
        </div>
        <AttachmentList files={p.attachments||[]}/></div>
      ))}{pns.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="check" s={32} c="mx-auto mb-3 opacity-30"/><p>No punch items</p></div>}</div>
    </div>
  );
}

function RFITab({pid,rfis,setRfi,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[nr,setNr]=useState({subject:"",question:"",attachments:[]});
  const[respId,setRespId]=useState(null);const[respText,setRespText]=useState("");
  const nextNo="RFI-"+String(rfis.length+1).padStart(3,"0");
  const add=()=>{if(!nr.subject.trim())return;setRfi(p=>({...p,[pid]:[{id:"rfi_"+Date.now(),no:nextNo,...nr,from:user.name,to:"Architect",status:"open",created:new Date().toISOString().split("T")[0],response:""},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Raised RFI",nr.subject,user.name,user.role);setNr({subject:"",question:"",attachments:[]});setShow(false);};
  const respond=id=>{setRfi(p=>({...p,[pid]:p[pid].map(r=>r.id===id?{...r,response:respText,status:"answered",responded:new Date().toISOString().split("T")[0]}:r)}));setRespId(null);setRespText("");};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">RFI - Request for Information</h2><p className="text-xs text-slate-400 mt-0.5">{rfis.filter(r=>r.status==="open").length} open · {rfis.filter(r=>r.status==="answered").length} answered</p></div>{user.role==="pm"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Raise RFI</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New RFI ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nr.subject} onChange={e=>setNr(p=>({...p,subject:e.target.value}))} placeholder="Subject" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><textarea value={nr.question} onChange={e=>setNr(p=>({...p,question:e.target.value}))} placeholder="Your question / clarification needed..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/><AttachmentInput files={nr.attachments||[]} onChange={attachments=>setNr(p=>({...p,attachments}))} label="Upload sketches / drawing references"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Submit RFI</button></div></div>}
      <div className="space-y-3">{rfis.map(r=>(
        <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-2"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-orange-600">{r.no}</span><Badge status={r.status==="answered"?"completed":"in_progress"}/></div><div className="font-bold text-slate-800 text-sm">{r.subject}</div></div></div>
          <p className="text-slate-600 text-sm mb-2"><strong>Q:</strong> {r.question}</p>
          <div className="text-xs text-slate-400">By {r.from} · {fmtDate(r.created)} → {r.to}</div>
          <AttachmentList files={r.attachments||[]}/>
          {r.response&&<div className="mt-3 pt-3 border-t border-slate-100 bg-emerald-50 rounded-lg p-3"><p className="text-slate-700 text-sm"><strong className="text-emerald-700">Answer:</strong> {r.response}</p><div className="text-xs text-slate-400 mt-1">Responded {fmtDate(r.responded)}</div></div>}
          {r.status==="open"&&user.role==="architect"&&(
            respId===r.id?<div className="mt-3"><textarea value={respText} onChange={e=>setRespText(e.target.value)} placeholder="Your answer..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20 mb-2"/><div className="flex gap-2"><button onClick={()=>respond(r.id)} className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg">Send Answer</button><button onClick={()=>setRespId(null)} className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">Cancel</button></div></div>:<button onClick={()=>setRespId(r.id)} className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-lg">Respond</button>
          )}
        </div>
      ))}{rfis.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="qa" s={32} c="mx-auto mb-3 opacity-30"/><p>No RFIs raised</p></div>}</div>
    </div>
  );
}

function COTab({pid,cos,setCo,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[nc,setNc]=useState({title:"",reason:"",cost_impact:"",time_impact:"",attachments:[]});
  const[signFor,setSignFor]=useState(null);   // co.id being signed
  const[signTyped,setSignTyped]=useState("");
  const[signAccepted,setSignAccepted]=useState(false);
  const nextNo="CO-"+String(cos.length+1).padStart(3,"0");
  const add=()=>{if(!nc.title.trim())return;setCo(p=>({...p,[pid]:[{id:"co_"+Date.now(),no:nextNo,...nc,cost_impact:+nc.cost_impact||0,time_impact:+nc.time_impact||0,status:"pending_approval",created:new Date().toISOString().split("T")[0],created_by:user.name},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Created change order",nc.title,user.name,user.role);setNc({title:"",reason:"",cost_impact:"",time_impact:"",attachments:[]});setShow(false);};
  const openSign=(coId,decision)=>{setSignFor({id:coId,decision});setSignTyped("");setSignAccepted(false);};
  const confirmSign=()=>{
    if(!signTyped.trim()){alert("Please type your full name to sign.");return;}
    if(!signAccepted){alert("Please tick the consent box.");return;}
    const expectedName=user.name.toLowerCase().trim();
    const givenName=signTyped.toLowerCase().trim();
    if(givenName!==expectedName){
      if(!window.confirm(`The name you typed ("${signTyped}") doesn't match your account name ("${user.name}").\n\nContinue anyway? This will be recorded in the signature log.`))return;
    }
    const signature={
      name:signTyped.trim(),
      role:user.role,
      email:user.email,
      signed_at:new Date().toISOString(),
      decision:signFor.decision,
      user_agent:navigator.userAgent.slice(0,140),
      consent:"I, the named signatory, accept the cost and time impact of this change order on behalf of the client.",
    };
    setCo(p=>({...p,[pid]:p[pid].map(c=>c.id===signFor.id?{...c,status:signFor.decision,approved_date:new Date().toISOString().split("T")[0],signature}:c)}));
    addActivity(pid,proj.name,"general",`Client ${signFor.decision} change order with e-signature`,`${signTyped.trim()} · ${cos.find(c=>c.id===signFor.id)?.title||""}`,user.name,user.role);
    setSignFor(null);setSignTyped("");setSignAccepted(false);
  };
  const totApproved=cos.filter(c=>c.status==="approved").reduce((s,c)=>s+c.cost_impact,0);
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Scope &amp; cost impact</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Change Orders</h2>
          <p className="text-xs text-ink-500 mt-1.5">Approved impact: {fmtCur(totApproved)} · {cos.filter(c=>c.status==="pending_approval").length} pending client e-signature</p>
        </div>
        {user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>New CO</button>}
      </div>

      {/* E-signature modal */}
      {signFor&&(()=>{const c=cos.find(x=>x.id===signFor.id);if(!c)return null;return(
        <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setSignFor(null);}}>
          <div className="bg-white rounded-2xl p-7 max-w-lg w-full shadow-editorial-deep" style={{border:"1px solid var(--st-line)"}}>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Electronic signature</div>
            <h3 className="font-display text-2xl font-semibold text-ink-900 mb-4 tracking-editorial">{signFor.decision==="approved"?"Approve":"Reject"} change order</h3>
            <div className="bg-cream-200/60 rounded-xl p-4 mb-4" style={{border:"1px solid var(--st-line)"}}>
              <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1">{c.no}</div>
              <div className="font-display text-lg font-semibold text-ink-900 mb-2 tracking-editorial">{c.title}</div>
              <div className="flex items-center justify-between text-sm"><span className="text-ink-600">Cost impact</span><span className="font-display font-bold text-ink-900">{fmtCur(c.cost_impact)}</span></div>
              <div className="flex items-center justify-between text-sm mt-1"><span className="text-ink-600">Schedule impact</span><span className="font-display font-bold text-ink-900">+{c.time_impact} days</span></div>
            </div>
            <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1 block">Type your full name</label>
            <input value={signTyped} onChange={e=>setSignTyped(e.target.value)} placeholder={user.name} className="w-full p-3 border border-stone-200 rounded-xl text-sm font-display italic tracking-editorial outline-none focus:border-amber-600 mb-3"/>
            <label className="flex items-start gap-2 text-xs text-ink-700 mb-4 cursor-pointer">
              <input type="checkbox" checked={signAccepted} onChange={e=>setSignAccepted(e.target.checked)} className="mt-0.5 accent-amber-600"/>
              <span>I, <strong>{user.name}</strong> ({user.role}), accept that this electronic signature is legally equivalent to a handwritten one for the purpose of this change order. Timestamp, IP-derived metadata, and consent text will be recorded.</span>
            </label>
            <div className="flex gap-2">
              <button onClick={confirmSign} className={`flex-1 px-5 py-3 font-bold rounded-xl text-sm tracking-wide ${signFor.decision==="approved"?"bg-emerald-600 hover:bg-emerald-500 text-white":"bg-red-600 hover:bg-red-500 text-white"}`}>{signFor.decision==="approved"?"Sign &amp; Approve":"Sign &amp; Reject"}</button>
              <button onClick={()=>setSignFor(null)} className="px-5 py-3 bg-cream-200 hover:bg-cream-100 text-ink-700 font-semibold rounded-xl text-sm">Cancel</button>
            </div>
            <p className="text-[10px] text-ink-500 mt-3 leading-relaxed">For court-grade audit trail, provision the backend per <span className="font-semibold">docs/BACKEND_PLAN.md</span> activity_log SECURITY DEFINER function.</p>
          </div>
        </div>
      );})()}

      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New Change Order ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nc.title} onChange={e=>setNc(p=>({...p,title:e.target.value}))} placeholder="Change description" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><textarea value={nc.reason} onChange={e=>setNc(p=>({...p,reason:e.target.value}))} placeholder="Reason for change..." className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 resize-none h-20"/><div className="grid grid-cols-2 gap-3"><input type="number" value={nc.cost_impact} onChange={e=>setNc(p=>({...p,cost_impact:e.target.value}))} placeholder="Cost impact (₹)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><input type="number" value={nc.time_impact} onChange={e=>setNc(p=>({...p,time_impact:e.target.value}))} placeholder="Schedule impact (days)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div><AttachmentInput files={nc.attachments||[]} onChange={attachments=>setNc(p=>({...p,attachments}))} label="Upload quote / approval document"/><button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Submit</button></div></div>}
      <div className="space-y-3">{cos.map(c=>(
        <div key={c.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="flex items-start justify-between mb-3 gap-3"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-amber-700">{c.no}</span><Badge status={c.status==="approved"?"completed":c.status==="rejected"?"on_hold":"in_progress"}/></div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{c.title}</div></div><div className="text-right"><div className="font-display text-lg font-semibold text-ink-900 tracking-editorial">{fmtCur(c.cost_impact)}</div><div className="text-xs text-ink-500">+{c.time_impact}d</div></div></div>
          <p className="text-ink-600 text-xs mb-2 leading-relaxed">{c.reason}</p>
          <div className="text-xs text-ink-500">By {c.created_by} · {fmtDate(c.created)}{c.approved_date&&` · ${c.status==="approved"?"Approved":"Rejected"} ${fmtDate(c.approved_date)}`}</div>
          <AttachmentList files={c.attachments||[]}/>
          {c.signature&&<div className="mt-3 p-3 bg-cream-200/60 rounded-xl" style={{border:"1px solid var(--st-line)"}}>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-1">— E-signature</div>
            <div className="font-display text-base italic text-ink-900 tracking-editorial">"{c.signature.name}"</div>
            <div className="text-[10px] text-ink-500 mt-1">{c.signature.role} · {c.signature.email} · {fmtTime(c.signature.signed_at)}</div>
          </div>}
          {c.status==="pending_approval"&&user.role==="client"&&<div className="flex gap-2 mt-3"><button onClick={()=>openSign(c.id,"approved")} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5"><Ic n="pencil" s={12}/>Sign &amp; Approve</button><button onClick={()=>openSign(c.id,"rejected")} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5"><Ic n="x" s={12}/>Reject</button></div>}
        </div>
      ))}{cos.length===0&&<div className="text-center py-16 text-ink-500"><Ic n="fileEdit" s={32} c="mx-auto mb-3 opacity-30"/><p className="font-display text-lg">No change orders</p></div>}</div>
    </div>
  );
}

function InspectionsTab({pid,inss,setInspections,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[ni,setNi]=useState({title:"",date:"",type:"Quality",inspector:user.name,checklist:"",attachments:[]});
  const add=()=>{if(!ni.title.trim())return;const items=ni.checklist.split("\n").filter(x=>x.trim()).map(q=>({q,ok:null}));setInspections(p=>({...p,[pid]:[{id:"ins_"+Date.now(),...ni,date:ni.date||new Date().toISOString().split("T")[0],items,status:"scheduled"},...(p[pid]||[])]}));setNi({title:"",date:"",type:"Quality",inspector:user.name,checklist:"",attachments:[]});setShow(false);};
  const toggleItem=(insId,idx,val)=>setInspections(p=>({...p,[pid]:p[pid].map(i=>i.id===insId?{...i,items:i.items.map((it,j)=>j===idx?{...it,ok:val}:it)}:i)}));
  const finalize=insId=>{const ins=inss.find(i=>i.id===insId);const allPass=ins.items.every(it=>it.ok===true);setInspections(p=>({...p,[pid]:p[pid].map(i=>i.id===insId?{...i,status:allPass?"passed":"failed"}:i)}));};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Inspections & QC</h2><p className="text-xs text-slate-400 mt-0.5">{inss.filter(i=>i.status==="passed").length} passed · {inss.filter(i=>i.status==="scheduled").length} scheduled</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New Inspection</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Inspection</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={ni.title} onChange={e=>setNi(p=>({...p,title:e.target.value}))} placeholder="Inspection title" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-3"><input type="date" value={ni.date} onChange={e=>setNi(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={ni.type} onChange={e=>setNi(p=>({...p,type:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option>Quality</option><option>Safety</option><option>Statutory</option><option>Pre-pour</option><option>Closeout</option></select><input value={ni.inspector} onChange={e=>setNi(p=>({...p,inspector:e.target.value}))} placeholder="Inspector" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><textarea value={ni.checklist} onChange={e=>setNi(p=>({...p,checklist:e.target.value}))} placeholder="One check per line:&#10;Reinforcement as per drawing&#10;Cover blocks placed&#10;Approval by consultant" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-28 font-mono"/><AttachmentInput files={ni.attachments||[]} onChange={attachments=>setNi(p=>({...p,attachments}))} label="Upload inspection evidence"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Create</button></div></div>}
      <div className="space-y-3">{inss.map(i=>(
        <div key={i.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-3"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">{i.type}</span><Badge status={i.status==="passed"?"completed":i.status==="failed"?"on_hold":"in_progress"}/></div><div className="font-bold text-slate-800 text-sm">{i.title}</div><div className="text-xs text-slate-400 mt-1">{i.inspector} · {fmtDate(i.date)}</div></div></div>
          <div className="space-y-2 mt-3">{i.items.map((it,j)=>(
            <div key={j} className="flex items-center gap-3"><div className="flex gap-1">{user.role!=="client"&&i.status==="scheduled"?[true,false].map(v=><button key={String(v)} onClick={()=>toggleItem(i.id,j,v)} className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${it.ok===v?(v?"bg-emerald-500 text-white":"bg-red-500 text-white"):"bg-slate-100 text-slate-400"}`}>{v?"✓":"✗"}</button>):<span className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${it.ok===true?"bg-emerald-500 text-white":it.ok===false?"bg-red-500 text-white":"bg-slate-100 text-slate-400"}`}>{it.ok===true?"✓":it.ok===false?"✗":"—"}</span>}</div><span className="text-sm text-slate-600 flex-1">{it.q}</span></div>
          ))}</div>
          <AttachmentList files={i.attachments||[]}/>
          {i.status==="scheduled"&&user.role!=="client"&&<button onClick={()=>finalize(i.id)} className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-lg">Finalize</button>}
        </div>
      ))}{inss.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="clipboard" s={32} c="mx-auto mb-3 opacity-30"/><p>No inspections</p></div>}</div>
    </div>
  );
}

function SafetyTab({pid,sfs,setSafety,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[ns,setNs]=useState({date:"",type:"near_miss",description:"",severity:"medium",worker:"",action:"",attachments:[]});
  const add=()=>{if(!ns.description.trim())return;setSafety(p=>({...p,[pid]:[{id:"sf_"+Date.now(),...ns,date:ns.date||new Date().toISOString().split("T")[0],reported_by:user.name,status:"open"},...(p[pid]||[])]}));addActivity(pid,proj.name,"issue","Safety incident reported",ns.description.slice(0,60),user.name,user.role);setNs({date:"",type:"near_miss",description:"",severity:"medium",worker:"",action:"",attachments:[]});setShow(false);};
  const close=id=>setSafety(p=>({...p,[pid]:p[pid].map(s=>s.id===id?{...s,status:"closed"}:s)}));
  const typeCol={near_miss:"bg-amber-50 text-amber-700",first_aid:"bg-blue-50 text-blue-700",injury:"bg-red-50 text-red-700",fatal:"bg-red-100 text-red-800"};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800 flex items-center gap-2"><Ic n="helmet" s={18} c="text-orange-500"/>Safety Incidents</h2><p className="text-xs text-slate-400 mt-0.5">{sfs.filter(s=>s.status==="open").length} open · {sfs.filter(s=>s.type==="near_miss").length} near miss</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Report Incident</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Safety Incident</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><div className="grid grid-cols-3 gap-3"><input type="date" value={ns.date} onChange={e=>setNs(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={ns.type} onChange={e=>setNs(p=>({...p,type:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="near_miss">Near Miss</option><option value="first_aid">First Aid</option><option value="injury">Injury</option><option value="fatal">Fatal</option></select><select value={ns.severity} onChange={e=>setNs(p=>({...p,severity:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option>low</option><option>medium</option><option>high</option></select></div><textarea value={ns.description} onChange={e=>setNs(p=>({...p,description:e.target.value}))} placeholder="What happened..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/><input value={ns.worker} onChange={e=>setNs(p=>({...p,worker:e.target.value}))} placeholder="Worker involved (or N/A)" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={ns.action} onChange={e=>setNs(p=>({...p,action:e.target.value}))} placeholder="Corrective action taken" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><AttachmentInput files={ns.attachments||[]} onChange={attachments=>setNs(p=>({...p,attachments}))} label="Upload incident photos / witness docs"/><button onClick={add} className="px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm">Report</button></div></div>}
      <div className="space-y-3">{sfs.map(s=>(
        <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-2"><div><div className="flex items-center gap-2 mb-1"><span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${typeCol[s.type]}`}>{s.type.replace("_"," ")}</span><Badge status={s.status==="closed"?"completed":"on_hold"}/></div><div className="font-bold text-slate-800 text-sm">{s.description}</div></div></div>
          {s.worker&&s.worker!=="N/A"&&<div className="text-xs text-slate-500 mt-1"><strong>Worker:</strong> {s.worker}</div>}
          {s.action&&<div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg mt-2"><strong>Action:</strong> {s.action}</div>}
          <div className="text-xs text-slate-400 mt-2">{fmtDate(s.date)} · By {s.reported_by}</div>
          <AttachmentList files={s.attachments||[]}/>
          {s.status==="open"&&user.role!=="client"&&<button onClick={()=>close(s.id)} className="mt-2 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Close</button>}
        </div>
      ))}{sfs.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="helmet" s={32} c="mx-auto mb-3 opacity-30"/><p>No incidents — keep it that way! 🦺</p></div>}</div>
    </div>
  );
}

function ProjectPOTab({pid,projPOs,setPos,vendors,user,can,proj}){
  const[show,setShow]=useState(false);
  const[np,setNp]=useState({vendor_id:vendors[0]?.id||"",items:"",amount:"",gst:18,delivery:"",attachments:[]});
  const nextNo="PO-"+String(projPOs.length+1).padStart(3,"0");
  const add=()=>{if(!np.items.trim()||!np.amount)return;setPos(p=>({...p,[pid]:[{id:"po_"+Date.now(),no:nextNo,...np,amount:+np.amount,gst:+np.gst,status:"pending",created:new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));setNp({vendor_id:vendors[0]?.id||"",items:"",amount:"",gst:18,delivery:"",attachments:[]});setShow(false);};
  const approve=id=>setPos(p=>({...p,[pid]:p[pid].map(po=>po.id===id?{...po,status:"approved"}:po)}));
  const total=projPOs.reduce((s,po)=>s+po.amount*(1+po.gst/100),0);
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Purchase Orders</h2><p className="text-xs text-slate-400 mt-0.5">{projPOs.length} POs · Total {fmtCur(total)}</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New PO</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New PO ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><select value={np.vendor_id} onChange={e=>setNp(p=>({...p,vendor_id:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{vendors.map(v=><option key={v.id} value={v.id}>{v.name} ({v.category})</option>)}</select><input value={np.items} onChange={e=>setNp(p=>({...p,items:e.target.value}))} placeholder="Items / description" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-3"><input type="number" value={np.amount} onChange={e=>setNp(p=>({...p,amount:e.target.value}))} placeholder="Amount (₹)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={np.gst} onChange={e=>setNp(p=>({...p,gst:+e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="0">0% GST</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select><input type="date" value={np.delivery} onChange={e=>setNp(p=>({...p,delivery:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><AttachmentInput files={np.attachments||[]} onChange={attachments=>setNp(p=>({...p,attachments}))} label="Upload quotation / PO document"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Create PO</button></div></div>}
      <div className="space-y-3">{projPOs.map(po=>{const v=vendors.find(x=>x.id===po.vendor_id);return(
        <div key={po.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-2"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-orange-600">{po.no}</span><Badge status={po.status}/></div><div className="font-bold text-slate-800 text-sm">{po.items}</div><div className="text-xs text-slate-400 mt-1">{v?.name||"—"} · Delivery {fmtDate(po.delivery)}</div></div><div className="text-right"><div className="text-base font-black text-slate-800">{fmtCur(po.amount*(1+po.gst/100))}</div><div className="text-xs text-slate-400">{fmtCur(po.amount)} + {po.gst}% GST</div></div></div>
          <AttachmentList files={po.attachments||[]}/>
          {po.status==="pending"&&user.role==="architect"&&<button onClick={()=>approve(po.id)} className="mt-2 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approve</button>}
        </div>
      );})}{projPOs.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="clipboard" s={32} c="mx-auto mb-3 opacity-30"/><p>No POs raised</p></div>}</div>
    </div>
  );
}

function InvoicesTab({pid,invs,ms,setInvoices,user,can,proj}){
  const[show,setShow]=useState(false);
  const[showPay,setShowPay]=useState(false);
  const[rzCfg,setRzCfg]=useState(()=>getRazorpayConfig());
  const[ni,setNi]=useState({milestone:"",amount:"",gst:18,tds:2,attachments:[]});
  const nextNo="INV-"+String(invs.length+1).padStart(3,"0");
  const add=()=>{if(!ni.milestone||!ni.amount)return;setInvoices(p=>({...p,[pid]:[{id:"inv_"+Date.now(),no:nextNo,...ni,amount:+ni.amount,gst:+ni.gst,tds:+ni.tds,status:"sent",issued:new Date().toISOString().split("T")[0],paid:null},...(p[pid]||[])]}));setNi({milestone:"",amount:"",gst:18,tds:2,attachments:[]});setShow(false);};
  const markPaid=id=>setInvoices(p=>({...p,[pid]:p[pid].map(i=>i.id===id?{...i,status:"paid",paid:new Date().toISOString().split("T")[0]}:i)}));
  const saveRz=()=>{saveRazorpayConfig(rzCfg);setShowPay(false);};
  const total=invs.reduce((s,i)=>s+i.amount,0);
  const paid=invs.filter(i=>i.status==="paid").reduce((s,i)=>s+i.amount,0);
  const calc=i=>i.amount*(1+i.gst/100)*(1-i.tds/100);
  return(
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5"><SC icon="receipt" label="Billed" value={fmtCur(total)} accent="blue"/><SC icon="check" label="Received" value={fmtCur(paid)} accent="emerald"/><SC icon="trend" label="Pending" value={fmtCur(total-paid)} accent="orange"/></div>
      <div className="flex items-end justify-between mb-6 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Client billing</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Invoices</h2>
          <p className="text-xs text-ink-500 mt-1.5">Milestone-based progress billing · GST/TDS · Razorpay/UPI ready</p>
        </div>
        <div className="flex gap-2">
          {user.role==="architect"&&<button onClick={()=>setShowPay(s=>!s)} className="px-3 py-2 bg-cream-200 text-ink-700 text-xs font-bold rounded-lg" style={{border:"1px solid var(--st-line)"}}>{rzCfg.upiId||rzCfg.paymentLinkBase?"Payment settings ✓":"Configure payments"}</button>}
          {user.role==="architect"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>New Invoice</button>}
        </div>
      </div>
      {showPay&&<div className="bg-white rounded-2xl p-5 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-3">— Payment options</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-1 block">Your UPI ID (for direct pay)</label>
            <input value={rzCfg.upiId||""} onChange={e=>setRzCfg(c=>({...c,upiId:e.target.value}))} placeholder="builder@upi" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-1 block">Your payee name</label>
            <input value={rzCfg.payeeName||""} onChange={e=>setRzCfg(c=>({...c,payeeName:e.target.value}))} placeholder="Your business name" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          </div>
        </div>
        <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">For card/netbanking/EMI, create a Razorpay Payment Link from your Razorpay dashboard per invoice and paste the URL in the invoice attachments. Full automation (auto-link creation + webhook → invoice paid) requires the backend Edge Function in <span className="font-semibold">docs/BACKEND_PLAN.md</span>.</p>
        <button onClick={saveRz} className="mt-3 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Save</button>
      </div>}
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New Invoice ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><select value={ni.milestone} onChange={e=>setNi(p=>({...p,milestone:e.target.value}))} className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">Select milestone...</option>{ms.map(m=><option key={m.id}>{m.title}</option>)}</select><div className="grid grid-cols-3 gap-3"><input type="number" value={ni.amount} onChange={e=>setNi(p=>({...p,amount:e.target.value}))} placeholder="Amount (₹)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><select value={ni.gst} onChange={e=>setNi(p=>({...p,gst:+e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="0">0% GST</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option></select><select value={ni.tds} onChange={e=>setNi(p=>({...p,tds:+e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="0">0% TDS</option><option value="1">1%</option><option value="2">2%</option><option value="10">10%</option></select></div><div className="bg-cream-200/60 rounded-xl p-3 text-xs grid grid-cols-3 gap-2" style={{border:"1px solid var(--st-line)"}}><div><div className="text-ink-500">Base</div><div className="font-bold">{fmtCur(+ni.amount||0)}</div></div><div><div className="text-ink-500">+ GST</div><div className="font-bold text-emerald-700">+{fmtCur((+ni.amount||0)*ni.gst/100)}</div></div><div><div className="text-ink-500">Net (after TDS)</div><div className="font-display font-bold">{fmtCur(calc({amount:+ni.amount||0,gst:+ni.gst,tds:+ni.tds}))}</div></div></div><AttachmentInput files={ni.attachments||[]} onChange={attachments=>setNi(p=>({...p,attachments}))} label="Upload invoice PDF / measurement sheet"/><button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Issue Invoice</button></div></div>}
      <div className="space-y-3">{invs.map(i=>{
        const upiLink=rzCfg.upiId?buildUpiDeepLink(i,proj,rzCfg.upiId,rzCfg.payeeName):"";
        return(
          <div key={i.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="flex items-start justify-between mb-2"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-amber-700">{i.no}</span><Badge status={i.status==="paid"?"completed":"in_progress"}/></div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{i.milestone}</div></div><div className="text-right"><div className="font-display text-xl font-semibold text-ink-900 tracking-editorial">{fmtCur(calc(i))}</div><div className="text-xs text-ink-500">+{i.gst}% GST -{i.tds}% TDS</div></div></div>
            <div className="text-xs text-ink-500">Issued {fmtDate(i.issued)}{i.paid&&` · Paid ${fmtDate(i.paid)}`}</div>
            <AttachmentList files={i.attachments||[]}/>
            <div className="flex flex-wrap gap-2 mt-3">
              {i.status!=="paid"&&user.role==="architect"&&<button onClick={()=>markPaid(i.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg tracking-wide">Mark Paid</button>}
              {i.status!=="paid"&&user.role==="client"&&upiLink&&<a href={upiLink} className="px-3 py-1.5 bg-gradient-gold text-white text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5"><Ic n="wallet" s={12}/>Pay via UPI</a>}
              {i.status!=="paid"&&upiLink&&user.role!=="client"&&<button onClick={()=>{navigator.clipboard.writeText(upiLink);alert("UPI link copied — share with the client.");}} className="px-3 py-1.5 bg-cream-200 text-ink-700 text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5" style={{border:"1px solid var(--st-line)"}}><Ic n="copy" s={12}/>Copy UPI link</button>}
            </div>
          </div>
        );
      })}{invs.length===0&&<div className="text-center py-16 text-ink-500"><Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/><p className="font-display text-lg">No invoices issued</p></div>}</div>
    </div>
  );
}

function LabourTab({pid,lbs,setLabour,user,can,proj}){
  const[show,setShow]=useState(false);
  const[nl,setNl]=useState({name:"",aadhaar:"",epf:"",esi:"",trade:"Mason",wage:"",joined:""});
  const add=()=>{if(!nl.name.trim())return;setLabour(p=>({...p,[pid]:[{id:"lb_"+Date.now(),...nl,wage:+nl.wage||0,joined:nl.joined||new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));setNl({name:"",aadhaar:"",epf:"",esi:"",trade:"Mason",wage:"",joined:""});setShow(false);};
  const del=id=>setLabour(p=>({...p,[pid]:p[pid].filter(l=>l.id!==id)}));
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Labour Register</h2><p className="text-xs text-slate-400 mt-0.5">{lbs.length} workers · Statutory register (EPF/ESI compliance)</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Add Worker</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Add Worker</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><input value={nl.name} onChange={e=>setNl(p=>({...p,name:e.target.value}))} placeholder="Worker name" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={nl.trade} onChange={e=>setNl(p=>({...p,trade:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{TRADES.map(t=><option key={t}>{t}</option>)}</select><input value={nl.aadhaar} onChange={e=>setNl(p=>({...p,aadhaar:e.target.value}))} placeholder="Aadhaar (last 4)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={nl.epf} onChange={e=>setNl(p=>({...p,epf:e.target.value}))} placeholder="EPF Number" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={nl.esi} onChange={e=>setNl(p=>({...p,esi:e.target.value}))} placeholder="ESI Number" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={nl.wage} onChange={e=>setNl(p=>({...p,wage:e.target.value}))} placeholder="Daily wage (₹)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="date" value={nl.joined} onChange={e=>setNl(p=>({...p,joined:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 col-span-2"/></div><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add</button></div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        {lbs.length===0?<div className="text-center py-12 text-slate-400 text-sm">No workers registered</div>:<table className="w-full text-sm"><thead className="bg-slate-50 border-b border-slate-100"><tr>{["Name","Trade","Aadhaar","EPF","ESI","Wage","Joined",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-400">{h}</th>)}</tr></thead><tbody>{lbs.map(l=>(<tr key={l.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-3 font-semibold text-slate-700">{l.name}</td><td className="px-4 py-3 text-slate-500"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{l.trade}</span></td><td className="px-4 py-3 text-slate-500 font-mono text-xs">{l.aadhaar}</td><td className="px-4 py-3 text-slate-500 font-mono text-xs">{l.epf}</td><td className="px-4 py-3 text-slate-500 font-mono text-xs">{l.esi}</td><td className="px-4 py-3 text-slate-700 font-bold">₹{l.wage}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(l.joined)}</td><td className="px-4 py-3">{user.role!=="client"&&<button onClick={()=>del(l.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={14}/></button>}</td></tr>))}</tbody></table>}
      </div>
    </div>
  );
}

function RABillsTab({pid,ras,setRa,user,can,proj}){
  const[show,setShow]=useState(false);
  const[expandedMB,setExpandedMB]=useState(null);   // ra.id of bill whose MB is expanded
  const[mbDraft,setMbDraft]=useState({location:"",item:"",unit:"cum",qty:"",rate:""});
  const[nr,setNr]=useState({subcontractor:"",scope:"",bill_amount:"",retention_pct:5,attachments:[],mb:[]});
  const cum=ras.reduce((s,r)=>s+r.bill_amount,0);
  const nextNo="RA-"+String(ras.length+1).padStart(2,"0");
  const canEdit=user.role==="architect"||user.role==="pm"||user.role==="contractor";
  const add=()=>{
    if(!nr.subcontractor.trim()||!nr.bill_amount)return;
    const bill=+nr.bill_amount;const newCum=cum+bill;
    setRa(p=>({...p,[pid]:[{id:"ra_"+Date.now(),no:nextNo,...nr,bill_amount:bill,cumulative:newCum,retention_pct:+nr.retention_pct,paid_amount:0,status:"submitted",bill_date:new Date().toISOString().split("T")[0],mb:nr.mb||[]},...(p[pid]||[])]}));
    setNr({subcontractor:"",scope:"",bill_amount:"",retention_pct:5,attachments:[],mb:[]});setShow(false);
  };
  const pay=id=>setRa(p=>({...p,[pid]:p[pid].map(r=>r.id===id?{...r,status:"paid",paid_amount:r.bill_amount*(1-r.retention_pct/100)}:r)}));
  const addMB=raId=>{
    if(!mbDraft.location.trim()||!mbDraft.item.trim()||!mbDraft.qty||!mbDraft.rate){alert("Location, item, qty, and rate are all required.");return;}
    const q=+mbDraft.qty,r=+mbDraft.rate;
    if(q<=0||r<0){alert("Quantity must be > 0 and rate must be >= 0.");return;}
    const entry={id:"mb_"+Date.now(),location:mbDraft.location.trim(),item:mbDraft.item.trim(),unit:mbDraft.unit,qty:q,rate:r,amount:q*r};
    setRa(p=>({...p,[pid]:p[pid].map(ra=>ra.id===raId?{...ra,mb:[...(ra.mb||[]),entry]}:ra)}));
    setMbDraft({location:"",item:"",unit:"cum",qty:"",rate:""});
  };
  const delMB=(raId,mbId)=>{
    setRa(p=>({...p,[pid]:p[pid].map(ra=>ra.id===raId?{...ra,mb:(ra.mb||[]).filter(m=>m.id!==mbId)}:ra)}));
  };
  const recomputeFromMB=raId=>{
    const ra=ras.find(x=>x.id===raId);if(!ra)return;
    const mbTotal=(ra.mb||[]).reduce((s,m)=>s+(m.amount||0),0);
    if(!window.confirm(`Set bill amount = sum of measurement book entries (${fmtCur(mbTotal)})?\n\nCurrent bill amount: ${fmtCur(ra.bill_amount)}`))return;
    setRa(p=>({...p,[pid]:p[pid].map(x=>x.id===raId?{...x,bill_amount:mbTotal}:x)}));
  };
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Subcontractor</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">RA Bills — Running Account</h2>
          <p className="text-xs text-ink-500 mt-1.5">Cumulative: {fmtCur(cum)} · {ras.filter(r=>r.status==="submitted").length} pending payment · MB-backed</p>
        </div>
        {canEdit&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>New RA Bill</button>}
      </div>
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New RA Bill ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nr.subcontractor} onChange={e=>setNr(p=>({...p,subcontractor:e.target.value}))} placeholder="Subcontractor name" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><input value={nr.scope} onChange={e=>setNr(p=>({...p,scope:e.target.value}))} placeholder="Scope of work this bill" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><div className="grid grid-cols-2 gap-3"><input type="number" value={nr.bill_amount} onChange={e=>setNr(p=>({...p,bill_amount:e.target.value}))} placeholder="Bill amount (₹)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><input type="number" value={nr.retention_pct} onChange={e=>setNr(p=>({...p,retention_pct:e.target.value}))} placeholder="Retention %" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div><AttachmentInput files={nr.attachments||[]} onChange={attachments=>setNr(p=>({...p,attachments}))} label="Upload RA bill / measurement sheet"/><button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Submit Bill</button><p className="text-[11px] text-ink-500">Measurement book entries can be added after the bill is created.</p></div></div>}
      <div className="space-y-3">{ras.map(r=>{
        const mb=r.mb||[];
        const mbTotal=mb.reduce((s,m)=>s+(m.amount||0),0);
        const isExpanded=expandedMB===r.id;
        const drift=Math.abs((r.bill_amount||0)-mbTotal);
        const driftPct=r.bill_amount>0?Math.round((drift/r.bill_amount)*100):0;
        return(
          <div key={r.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="flex items-start justify-between mb-3"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-amber-700">{r.no}</span><Badge status={r.status==="paid"?"completed":"in_progress"}/>{mb.length>0&&<span className="text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">MB-backed</span>}</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{r.subcontractor}</div><div className="text-xs text-ink-600 mt-1">{r.scope}</div></div><div className="text-right"><div className="font-display text-xl font-semibold text-ink-900 tracking-editorial">{fmtCur(r.bill_amount)}</div><div className="text-xs text-ink-500">Net: {fmtCur(r.bill_amount*(1-r.retention_pct/100))}</div></div></div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 text-xs" style={{borderTop:"1px solid var(--st-line)"}}><div><div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">Cumulative</div><div className="font-bold text-ink-700 mt-0.5">{fmtCur(r.cumulative)}</div></div><div><div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">Retention {r.retention_pct}%</div><div className="font-bold text-amber-700 mt-0.5">{fmtCur(r.bill_amount*r.retention_pct/100)}</div></div><div><div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">Paid</div><div className="font-bold text-emerald-700 mt-0.5">{fmtCur(r.paid_amount)}</div></div></div>
            <div className="text-xs text-ink-500 mt-2">{fmtDate(r.bill_date)}</div>
            <AttachmentList files={r.attachments||[]}/>

            {/* Measurement Book row */}
            <div className="mt-4 pt-4" style={{borderTop:"1px solid var(--st-line)"}}>
              <div className="flex items-center justify-between">
                <button onClick={()=>{setExpandedMB(isExpanded?null:r.id);setMbDraft({location:"",item:"",unit:"cum",qty:"",rate:""});}} className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-amber-700 hover:text-amber-900">
                  <Ic n="clipboard" s={12}/>
                  Measurement Book ({mb.length} entries · {fmtCur(mbTotal)})
                  <span className="text-ink-500">{isExpanded?"▾":"▸"}</span>
                </button>
                {mb.length>0&&driftPct>0&&<span className={`text-[10px] font-bold ${driftPct>5?"text-red-600":"text-amber-700"}`}>MB vs Bill drift: {driftPct}%</span>}
              </div>

              {isExpanded&&<div className="mt-3 bg-cream-200/40 rounded-xl p-3" style={{border:"1px solid var(--st-line)"}}>
                {mb.length>0?<div className="space-y-1.5 mb-3">{mb.map(m=>
                  <div key={m.id} className="grid grid-cols-12 gap-2 items-center text-xs px-2 py-1.5 hover:bg-white rounded-lg">
                    <div className="col-span-4 font-semibold text-ink-800 truncate">{m.location}</div>
                    <div className="col-span-3 text-ink-700 truncate">{m.item}</div>
                    <div className="col-span-1 text-right text-ink-700">{m.qty}</div>
                    <div className="col-span-1 text-ink-600 text-[10px]">{m.unit}</div>
                    <div className="col-span-1 text-right text-ink-600">{fmtCur(m.rate)}</div>
                    <div className="col-span-1 text-right font-bold text-ink-900">{fmtCur(m.amount)}</div>
                    <div className="col-span-1 text-right">{canEdit&&r.status!=="paid"&&<button onClick={()=>delMB(r.id,m.id)} className="text-ink-400 hover:text-red-500"><Ic n="trash" s={12}/></button>}</div>
                  </div>
                )}</div>:<p className="text-[11px] text-ink-500 italic mb-3">No measurement entries yet. Add one below to back this bill amount.</p>}

                {canEdit&&r.status!=="paid"&&<div>
                  <div className="grid grid-cols-12 gap-2 mb-2">
                    <input value={mbDraft.location} onChange={e=>setMbDraft(p=>({...p,location:e.target.value}))} placeholder="Location (e.g. Floor 14 columns)" className="col-span-4 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <input value={mbDraft.item} onChange={e=>setMbDraft(p=>({...p,item:e.target.value}))} placeholder="Item / scope" className="col-span-3 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <input type="number" value={mbDraft.qty} min="0" step="0.001" onChange={e=>setMbDraft(p=>({...p,qty:e.target.value}))} placeholder="Qty" className="col-span-1 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <select value={mbDraft.unit} onChange={e=>setMbDraft(p=>({...p,unit:e.target.value}))} className="col-span-1 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600">{BOQ_UNITS.map(u=><option key={u}>{u}</option>)}</select>
                    <input type="number" value={mbDraft.rate} min="0" step="0.01" onChange={e=>setMbDraft(p=>({...p,rate:e.target.value}))} placeholder="Rate" className="col-span-2 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <button onClick={()=>addMB(r.id)} className="col-span-1 p-2 bg-gradient-gold text-white text-xs font-bold rounded-lg">Add</button>
                  </div>
                  {mb.length>0&&mbTotal!==r.bill_amount&&<button onClick={()=>recomputeFromMB(r.id)} className="text-[11px] font-bold text-amber-700 hover:text-amber-900 mt-1">↻ Set bill amount = MB total ({fmtCur(mbTotal)})</button>}
                </div>}
              </div>}
            </div>

            {r.status==="submitted"&&user.role==="architect"&&<button onClick={()=>pay(r.id)} className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg tracking-wide">Mark Paid</button>}
          </div>
        );
      })}{ras.length===0&&<div className="text-center py-16 text-ink-500"><Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/><p className="font-display text-lg">No RA bills</p></div>}</div>
    </div>
  );
}

// ── BOQ Tab (Bill of Quantities) ─────────────────────────────────────────────
function BOQTab({pid,bq,setBoq,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[nb,setNb]=useState({code:"",description:"",category:"Civil",unit:"cum",qty:"",rate:""});
  const[err,setErr]=useState("");
  const canEdit=user.role==="architect"||user.role==="pm";
  const validate=()=>{
    if(!nb.description.trim()) return "Description is required.";
    const q=+nb.qty, r=+nb.rate;
    if(!Number.isFinite(q) || q<=0) return "Quantity must be a positive number.";
    if(!Number.isFinite(r) || r<0) return "Rate must be zero or positive (₹).";
    if(q>1e9 || r>1e9) return "Quantity or rate is unrealistically large.";
    return "";
  };
  const add=()=>{
    const v=validate();
    if(v){setErr(v);return;}
    setBoq(p=>({...p,[pid]:[...(p[pid]||[]),{id:"bq_"+Date.now(),code:nb.code.trim()||"",description:nb.description.trim(),category:nb.category,unit:nb.unit,qty:+nb.qty,rate:+nb.rate,sort:(p[pid]||[]).length+1}]}));
    addActivity(pid,proj.name,"general","Added BOQ line",nb.description,user.name,user.role);
    setNb({code:"",description:"",category:"Civil",unit:"cum",qty:"",rate:""});setErr("");setShow(false);
  };
  const del=id=>{
    const it=bq.find(x=>x.id===id);if(!it)return;
    if(!window.confirm(`Delete BOQ line "${it.description}"?\nLine amount: ${fmtCur(it.qty*it.rate)}\n\nThis cannot be undone.`))return;
    setBoq(p=>({...p,[pid]:(p[pid]||[]).filter(x=>x.id!==id)}));
    addActivity(pid,proj.name,"general","Removed BOQ line",it.description,user.name,user.role);
  };
  const sorted=[...bq].sort((a,b)=>(a.sort||0)-(b.sort||0));
  const total=sorted.reduce((s,x)=>s+(x.qty*x.rate||0),0);
  const byCategory=sorted.reduce((m,x)=>{(m[x.category]=m[x.category]||[]).push(x);return m;},{});
  const catTotals=Object.entries(byCategory).map(([c,items])=>({c,t:items.reduce((s,x)=>s+(x.qty*x.rate),0)})).sort((a,b)=>b.t-a.t);
  const catColor={Civil:"bg-blue-50 text-blue-700",MEP:"bg-violet-50 text-violet-700",Finishing:"bg-emerald-50 text-emerald-700",External:"bg-amber-50 text-amber-700",Other:"bg-slate-100 text-slate-500"};
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Pre-construction</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Bill of Quantities (BOQ)</h2>
          <p className="text-xs text-ink-500 mt-1.5">{sorted.length} line items · Total {fmtCur(total)}</p>
        </div>
        {canEdit&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Add BOQ Line</button>}
      </div>
      {catTotals.length>0&&<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {catTotals.map(({c,t})=><div key={c} className="bg-white border border-slate-200 rounded-xl p-4"><div className={`text-[10px] font-bold uppercase tracking-widest inline-block px-2 py-0.5 rounded-md ${catColor[c]||catColor.Other}`}>{c}</div><div className="text-lg font-black text-slate-800 mt-2">{fmtCur(t)}</div><div className="text-xs text-slate-400">{Math.round((t/total)*100)||0}% of total</div></div>)}
      </div>}
      {show&&canEdit&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New BOQ Line</h3><button onClick={()=>{setShow(false);setErr("");}}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-12 gap-3 mb-3">
          <input value={nb.code} onChange={e=>{setNb(p=>({...p,code:e.target.value}));setErr("");}} placeholder="Code (e.g. 1.2)" className="col-span-3 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input value={nb.description} onChange={e=>{setNb(p=>({...p,description:e.target.value}));setErr("");}} placeholder="Description" className="col-span-9 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <select value={nb.category} onChange={e=>setNb(p=>({...p,category:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option>Civil</option><option>MEP</option><option>Finishing</option><option>External</option><option>Other</option></select>
          <select value={nb.unit} onChange={e=>setNb(p=>({...p,unit:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{BOQ_UNITS.map(u=><option key={u}>{u}</option>)}</select>
          <input type="number" min="0" step="0.001" value={nb.qty} onChange={e=>{setNb(p=>({...p,qty:e.target.value}));setErr("");}} placeholder="Qty" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input type="number" min="0" step="0.01" value={nb.rate} onChange={e=>{setNb(p=>({...p,rate:e.target.value}));setErr("");}} placeholder="Rate (₹)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
        </div>
        {err&&<div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">{err}</div>}
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Line amount: <strong className="text-slate-800">{fmtCur((+nb.qty||0)*(+nb.rate||0))}</strong></div>
          <button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Line</button>
        </div>
      </div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase tracking-widest text-slate-400">
          <div className="col-span-1">Code</div><div className="col-span-5">Description</div><div className="col-span-1">Unit</div><div className="col-span-1 text-right">Qty</div><div className="col-span-2 text-right">Rate</div><div className="col-span-2 text-right">Amount</div>
        </div>
        {sorted.length===0?<div className="text-center py-16 text-slate-400"><Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/><p>No BOQ lines added</p></div>:<div className="divide-y divide-slate-50">
          {sorted.map(x=><div key={x.id} className="grid grid-cols-12 gap-3 px-5 py-3 hover:bg-slate-50 items-center text-sm">
            <div className="col-span-1 font-mono text-xs text-slate-500">{x.code||"—"}</div>
            <div className="col-span-5"><div className="font-semibold text-slate-800">{x.description}</div><div className={`text-[10px] font-bold uppercase tracking-widest inline-block px-2 py-0.5 rounded-md mt-1 ${catColor[x.category]||catColor.Other}`}>{x.category}</div></div>
            <div className="col-span-1 text-slate-600">{x.unit}</div>
            <div className="col-span-1 text-right font-semibold text-slate-700">{x.qty}</div>
            <div className="col-span-2 text-right text-slate-600">{fmtCur(x.rate)}</div>
            <div className="col-span-1 text-right font-bold text-slate-800">{fmtCur(x.qty*x.rate)}</div>
            <div className="col-span-1 text-right">{canEdit&&<button onClick={()=>del(x.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={14}/></button>}</div>
          </div>)}
          <div className="grid grid-cols-12 gap-3 px-5 py-4 bg-slate-50 items-center font-bold text-slate-800 text-sm border-t-2 border-slate-200">
            <div className="col-span-10 text-right">Grand Total</div>
            <div className="col-span-2 text-right">{fmtCur(total)}</div>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ── Estimate Tab (client-facing quote built on top of BOQ) ───────────────────
function EstimateTab({pid,bq,est,setEstimate,user,addActivity,proj}){
  const canEdit=user.role==="architect"||user.role==="pm";
  const[draft,setDraft]=useState(null);   // null = view mode; object = editing
  const[err,setErr]=useState("");

  // Base = sum of all BOQ line amounts. Estimate is purely derived from BOQ.
  const baseCost = bq.reduce((s,x)=>s+(x.qty*x.rate||0),0);
  const e = draft||est;
  const overhead = Math.round(baseCost*(+e.overhead||0)/100);
  const markup = Math.round(baseCost*(+e.markup||0)/100);
  const contingency = Math.round(baseCost*(+e.contingency||0)/100);
  const subtotal = baseCost + overhead + markup + contingency;
  const gst = Math.round(subtotal*(+e.gst||0)/100);
  const total = subtotal + gst;

  const validate=()=>{
    const ks=["markup","overhead","contingency","gst"];
    for(const k of ks){
      const v=+draft[k];
      if(!Number.isFinite(v)||v<0) return `${k} must be zero or positive.`;
      if(v>100) return `${k} cannot exceed 100%.`;
    }
    return "";
  };
  const save=()=>{
    const v=validate();if(v){setErr(v);return;}
    const next={...draft,version:(est.version||0)+1,updated:new Date().toISOString().split("T")[0]};
    setEstimate(p=>({...p,[pid]:next}));
    addActivity(pid,proj.name,"general","Updated estimate",`v${next.version} · markup ${next.markup}% · overhead ${next.overhead}%`,user.name,user.role);
    setDraft(null);setErr("");
  };
  const startEdit=()=>{setDraft({...e});setErr("");};
  const cancelEdit=()=>{setDraft(null);setErr("");};

  if(bq.length===0) return (
    <div className="text-center py-20 text-slate-400">
      <Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/>
      <p className="font-semibold mb-1">No BOQ lines yet</p>
      <p className="text-xs">Add Bill of Quantities first, then come back to generate an estimate.</p>
    </div>
  );

  const fld=(k,label,suffix="%")=>(
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">{label}</label>
      {draft?<div className="flex items-center gap-1"><input type="number" min="0" max="100" step="0.1" value={draft[k]} onChange=
        {ev=>{setDraft(p=>({...p,[k]:ev.target.value}));setErr("");}} className="w-20 p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-400"/><span className="text-xs text-slate-400">{suffix}</span></div>
      :<div className="text-lg font-black text-slate-800">{e[k]}{suffix}</div>}
    </div>
  );

  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Client quote</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Project Estimate</h2>
          <p className="text-xs text-ink-500 mt-1.5">v{e.version||1}{e.updated?` · updated ${fmtDate(e.updated)}`:""} · derived from {bq.length} BOQ lines</p>
        </div>
        {canEdit&&!draft&&<button onClick={startEdit} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="pencil" s={14}/>Edit Estimate</button>}
        {canEdit&&draft&&<div className="flex gap-2"><button onClick={save} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm tracking-wide">Save Version</button><button onClick={cancelEdit} className="px-4 py-2.5 bg-cream-200 hover:bg-cream-100 text-ink-700 font-semibold rounded-xl text-sm">Cancel</button></div>}
      </div>

      {/* Cost waterfall */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <h3 className="font-bold text-slate-800 text-sm mb-4">Cost Build-Up</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Base (BOQ)</div>
            <div className="text-lg font-black text-slate-800">{fmtCur(baseCost)}</div>
            <div className="text-xs text-slate-400 mt-0.5">100%</div>
          </div>
          {fld("overhead","Overhead")}
          {fld("markup","Markup / Profit")}
          {fld("contingency","Contingency")}
          {fld("gst","GST")}
        </div>
        {err&&<div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">{err}</div>}
      </div>

      {/* Breakdown table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-bold text-slate-700 text-sm">Estimate Breakdown</h3></div>
        <div className="divide-y divide-slate-50">
          {[
            ["Base cost (sum of BOQ amounts)",baseCost,"text-slate-700"],
            [`Overhead (${e.overhead}%)`,overhead,"text-slate-700"],
            [`Markup / Profit (${e.markup}%)`,markup,"text-slate-700"],
            [`Contingency (${e.contingency}%)`,contingency,"text-slate-700"],
          ].map(([label,amt,col])=>(
            <div key={label} className="px-5 py-3 flex items-center justify-between text-sm">
              <span className={col}>{label}</span>
              <span className="font-semibold text-slate-800">{fmtCur(amt)}</span>
            </div>
          ))}
          <div className="px-5 py-3 flex items-center justify-between text-sm bg-slate-50">
            <span className="font-bold text-slate-800">Subtotal (before GST)</span>
            <span className="font-bold text-slate-800">{fmtCur(subtotal)}</span>
          </div>
          <div className="px-5 py-3 flex items-center justify-between text-sm">
            <span className="text-slate-700">GST ({e.gst}%)</span>
            <span className="font-semibold text-slate-800">{fmtCur(gst)}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between text-base bg-orange-50 border-t-2 border-orange-200">
            <span className="font-black text-orange-800">Total Estimate</span>
            <span className="font-black text-orange-700 text-lg">{fmtCur(total)}</span>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-2">Notes for Client</h3>
        {draft?
          <textarea value={draft.note} onChange={ev=>setDraft(p=>({...p,note:ev.target.value}))} placeholder="Scope, exclusions, payment terms..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
          :<p className="text-sm text-slate-600 whitespace-pre-line">{e.note||<span className="text-slate-400 italic">No notes added.</span>}</p>
        }
      </div>

      <p className="text-xs text-slate-400 mt-4">
        This estimate is auto-derived from BOQ totals. Save creates a new version; previous versions are kept in localStorage history (backend audit log when migrated per BACKEND_PLAN.md).
      </p>
    </div>
  );
}

// ── Inventory Ledger Tab (inward / outward / GRN) ────────────────────────────
function LedgerTab({pid,lg,setLedger,mats,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[filter,setFilter]=useState("all");
  const[err,setErr]=useState("");
  const today=new Date().toISOString().split("T")[0];
  const matNames=Array.from(new Set([...(mats||[]).map(m=>m.material),...(lg||[]).map(x=>x.material)])).filter(Boolean);
  const[nt,setNt]=useState({date:today,material:matNames[0]||"",unit:"bag",qty:"",direction:"inward",source:"",ref_no:"",notes:""});
  const canEdit=user.role!=="client";
  const validate=()=>{
    if(!nt.material.trim()) return "Material name is required.";
    const q=+nt.qty;
    if(!Number.isFinite(q) || q<=0) return "Quantity must be a positive number.";
    if(q>1e9) return "Quantity is unrealistically large.";
    if(!nt.date) return "Transaction date is required.";
    if(nt.date>today) return "Date cannot be in the future (anti-backdating in reverse).";
    // Stock check for outward/wastage — prevent removing more than available
    if(["outward","wastage"].includes(nt.direction)){
      const inSum=lg.filter(x=>x.material===nt.material.trim()&&(x.direction==="inward"||x.direction==="return")).reduce((s,x)=>s+(+x.qty||0),0);
      const outSum=lg.filter(x=>x.material===nt.material.trim()&&(x.direction==="outward"||x.direction==="wastage")).reduce((s,x)=>s+(+x.qty||0),0);
      const balance=inSum-outSum;
      if(q>balance) return `Cannot remove ${q} ${nt.unit} — current stock balance is only ${balance} ${nt.unit}.`;
    }
    return "";
  };
  const add=()=>{
    const v=validate();
    if(v){setErr(v);return;}
    setLedger(p=>({...p,[pid]:[{id:"lg_"+Date.now(),...nt,material:nt.material.trim(),source:nt.source.trim(),ref_no:nt.ref_no.trim(),notes:nt.notes.trim(),qty:+nt.qty,by:user.name},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"material",`Recorded ${nt.direction}`,`${nt.material} — ${nt.qty} ${nt.unit}`,user.name,user.role);
    setNt({date:today,material:matNames[0]||"",unit:"bag",qty:"",direction:"inward",source:"",ref_no:"",notes:""});setErr("");setShow(false);
  };
  const del=id=>{
    const it=lg.find(x=>x.id===id);if(!it)return;
    if(!window.confirm(`Delete ${it.direction} transaction?\n${it.material} — ${it.qty} ${it.unit}\nDate: ${fmtDate(it.date)}\n\nThis cannot be undone.`))return;
    setLedger(p=>({...p,[pid]:(p[pid]||[]).filter(x=>x.id!==id)}));
    addActivity(pid,proj.name,"material","Removed ledger entry",`${it.material} — ${it.qty}`,user.name,user.role);
  };
  const rows=filter==="all"?lg:lg.filter(x=>x.direction===filter);
  // Material-wise stock summary
  const stockMap={};
  for(const x of lg){
    const k=x.material;if(!stockMap[k])stockMap[k]={material:k,unit:x.unit,inward:0,outward:0,balance:0};
    if(x.direction==="inward"||x.direction==="return")stockMap[k].inward+=+x.qty||0;
    else stockMap[k].outward+=+x.qty||0;
    stockMap[k].balance=stockMap[k].inward-stockMap[k].outward;
  }
  const stockRows=Object.values(stockMap).sort((a,b)=>b.balance-a.balance);
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Inventory</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Stock Ledger</h2>
          <p className="text-xs text-ink-500 mt-1.5">{lg.length} transactions · {stockRows.length} materials tracked</p>
        </div>
        {canEdit&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Record Transaction</button>}
      </div>
      {stockRows.length>0&&<div className="bg-white rounded-2xl border border-slate-200 mb-5 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-bold text-slate-700 text-sm">Current Stock Balance</h3></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {stockRows.map(s=><div key={s.material} className={`rounded-xl border p-3 ${s.balance<0?"bg-red-50 border-red-200":s.balance===0?"bg-slate-50 border-slate-200":"bg-emerald-50 border-emerald-200"}`}>
            <div className="font-semibold text-slate-800 text-sm">{s.material}</div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-emerald-700">In: <strong>{s.inward}</strong></span>
              <span className="text-amber-700">Out: <strong>{s.outward}</strong></span>
              <span className={s.balance<0?"text-red-700":"text-slate-700"}>Bal: <strong>{s.balance} {s.unit}</strong></span>
            </div>
          </div>)}
        </div>
      </div>}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["all","inward","outward","return","wastage"].map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${filter===f?"bg-orange-500 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{f}{f!=="all"&&` (${lg.filter(x=>x.direction===f).length})`}</button>)}
      </div>
      {show&&canEdit&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Stock Transaction</h3><button onClick={()=>{setShow(false);setErr("");}}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <input type="date" max={today} value={nt.date} onChange={e=>{setNt(p=>({...p,date:e.target.value}));setErr("");}} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <select value={nt.direction} onChange={e=>{setNt(p=>({...p,direction:e.target.value}));setErr("");}} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="inward">Inward (GRN)</option><option value="outward">Outward (Issue)</option><option value="return">Return</option><option value="wastage">Wastage</option></select>
          <input value={nt.qty} type="number" min="0" step="0.001" onChange={e=>{setNt(p=>({...p,qty:e.target.value}));setErr("");}} placeholder="Qty" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <select value={nt.unit} onChange={e=>setNt(p=>({...p,unit:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{BOQ_UNITS.map(u=><option key={u}>{u}</option>)}</select>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <input value={nt.material} onChange={e=>{setNt(p=>({...p,material:e.target.value}));setErr("");}} placeholder="Material name" list="ledger-materials" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <datalist id="ledger-materials">{matNames.map(m=><option key={m} value={m}/>)}</datalist>
          <input value={nt.source} onChange={e=>setNt(p=>({...p,source:e.target.value}))} placeholder={nt.direction==="inward"?"Supplier":"Issued to / Location"} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input value={nt.ref_no} onChange={e=>setNt(p=>({...p,ref_no:e.target.value}))} placeholder="GRN / DC / Ref no" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
        </div>
        <textarea value={nt.notes} onChange={e=>setNt(p=>({...p,notes:e.target.value}))} placeholder="Notes (optional)" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-16 mb-3"/>
        {err&&<div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">{err}</div>}
        <button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Record</button>
      </div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {rows.length===0?<div className="text-center py-16 text-slate-400"><Ic n="truck" s={32} c="mx-auto mb-3 opacity-30"/><p>No transactions</p></div>:<div className="divide-y divide-slate-50">
          {rows.map(x=>{const d=LEDGER_DIRS[x.direction]||LEDGER_DIRS.inward;return(
            <div key={x.id} className="px-5 py-3 flex items-center gap-3">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${d.bg} ${d.text} ${d.border}`}>{d.label}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-sm truncate">{x.material} — <span className="text-orange-600">{x.qty} {x.unit}</span></div>
                <div className="text-xs text-slate-400 mt-0.5">{fmtDate(x.date)}{x.ref_no?` · ${x.ref_no}`:""}{x.source?` · ${x.source}`:""}{x.by?` · by ${x.by}`:""}</div>
              </div>
              {canEdit&&<button onClick={()=>del(x.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={14}/></button>}
            </div>
          );})}
        </div>}
      </div>
    </div>
  );
}

// ── OTHER VIEWS ───────────────────────────────────────────────────────────────
function CreateView({user,setView,setProjects}){
  // Hooks must be called unconditionally (react-hooks/rules-of-hooks).
  const[f,setF]=useState({name:"",cn:"",ce:"",loc:"",sd:"",ed:"",budget:"",desc:""});const[done,setDone]=useState(false);const[err,setErr]=useState({});
  if(!can(user,"createProject")) return <div className="p-8"><AccessDenied msg="Only Architects can create new projects."/></div>;
  const val=()=>{const e={};if(!f.name.trim())e.name="Required";if(!f.cn.trim())e.cn="Required";if(!f.loc.trim())e.loc="Required";if(!f.sd)e.sd="Required";return e;};
  const sub=()=>{const e=val();if(Object.keys(e).length){setErr(e);return;}setProjects(p=>[...p,{id:"p_"+Date.now(),name:f.name,client_name:f.cn,client_email:f.ce,location:f.loc,start_date:f.sd,expected_end_date:f.ed,budget:parseFloat(f.budget)||0,description:f.desc,status:"active",progress:0}]);setDone(true);setTimeout(()=>setView("projects"),1800);};
  if(done) return <div className="p-8 flex items-center justify-center min-h-96"><div className="text-center"><div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><Ic n="check" s={28} c="text-emerald-600"/></div><h2 className="text-xl font-black text-slate-800 mb-2">Project Created!</h2></div></div>;
  const inp=(key,lbl,type="text",ph="",fk)=>{const k=fk||key;return<div><label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">{lbl}</label><input type={type} value={f[k]} onChange={e=>{setF(p=>({...p,[k]:e.target.value}));setErr(p=>({...p,[key]:""}));}} placeholder={ph} className={`w-full p-3.5 border rounded-xl text-sm outline-none transition-all ${err[key]?"border-red-300 bg-red-50":"border-slate-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-50"}`}/>{err[key]&&<p className="text-red-500 text-xs mt-1">{err[key]}</p>}</div>;};
  return(<div className="p-4 md:p-8 max-w-2xl"><button onClick={()=>setView("projects")} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm mb-6"><Ic n="arrow" s={16}/>Back</button><h1 className="text-2xl font-black text-slate-800 mb-6">Create New Project</h1><div className="bg-white rounded-2xl border border-slate-200 p-7 space-y-5">{inp("name","Project Name","text","Skyline Tower Phase III")}<div className="grid grid-cols-2 gap-4">{inp("cn","Client Name","text","Nair Holdings","cn")}{inp("ce","Client Email","email","client@co.in","ce")}</div>{inp("loc","Location","text","Jubilee Hills, Hyderabad","loc")}<div className="grid grid-cols-2 gap-4">{inp("sd","Start Date","date","","sd")}{inp("ed","End Date","date","","ed")}</div>{inp("budget","Budget (₹)","number","45000000")}<div><label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">Description</label><textarea value={f.desc} onChange={e=>setF(p=>({...p,desc:e.target.value}))} className="w-full p-3.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/></div><button onClick={sub} className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all">Create Project →</button></div></div>);
}
function NotifsView({notifs,setNotifs}){const u=notifs.filter(n=>!n.read).length;return(<div className="p-4 md:p-8 max-w-2xl"><div className="flex items-start justify-between mb-8"><div><h1 className="text-2xl font-black text-slate-800">Site Updates</h1><p className="text-slate-500 text-sm mt-1">{u} unread</p></div>{u>0&&<button onClick={()=>setNotifs(p=>p.map(n=>({...n,read:true})))} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm"><Ic n="mailCheck" s={15}/>Mark all</button>}</div><div className="space-y-3">{notifs.map(n=><div key={n.id} className={`bg-white rounded-2xl border p-5 flex gap-4 ${n.read?"border-slate-100 opacity-70":"border-orange-100 shadow-sm"}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.read?"bg-slate-100":"bg-orange-50"}`}><Ic n="bell" s={18} c={n.read?"text-slate-400":"text-orange-500"}/></div><div className="flex-1"><div className="flex items-start justify-between gap-2"><div className="font-semibold text-slate-800 text-sm">{n.title}</div>{!n.read&&<button onClick={()=>setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x))} className="text-xs text-orange-500 font-semibold flex-shrink-0">Mark read</button>}</div><p className="text-slate-500 text-xs mt-1">{n.message}</p><p className="text-slate-400 text-xs mt-2">{fmtDate(n.created_at)}</p></div></div>)}</div></div>);}
function MessagesView({user,projects,messages,setMessages}){
  const visible=projects.filter(p=>user.role==="client"?p.client_email===user.email:true);
  const[pid,setPid]=useState(visible[0]?.id||projects[0]?.id||"");
  const[text,setText]=useState("");
  const[files,setFiles]=useState([]);
  const cur=visible.find(p=>p.id===pid)||visible[0]||projects[0];
  const list=messages[cur?.id]||[];
  const send=()=>{if(!text.trim()&&!files.length)return;setMessages(p=>({...p,[cur.id]:[...(p[cur.id]||[]),{id:"msg_"+Date.now(),by:user.name,role:user.role,text,attachments:files,time:new Date().toISOString()}]}));setText("");setFiles([]);};
  if(!cur)return <div className="p-8"><AccessDenied msg="No message-enabled project found."/></div>;
  return(<div className="p-4 md:p-8 max-w-5xl"><div className="flex items-start justify-between gap-3 mb-6"><div><h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Ic n="msgcircle" s={22} c="text-orange-500"/>Messages</h1><p className="text-slate-500 text-sm mt-1">Project chat with file/photo context</p></div><select value={cur.id} onChange={e=>setPid(e.target.value)} className="p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{visible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="p-5 border-b border-slate-100"><div className="font-bold text-slate-800">{cur.name}</div><div className="text-xs text-slate-400">{list.length} messages</div></div><div className="p-5 space-y-3 min-h-[360px] max-h-[520px] overflow-y-auto bg-slate-50">{list.map(m=><div key={m.id} className={`max-w-[82%] ${m.by===user.name?"ml-auto":""}`}><div className={`rounded-2xl border p-4 ${m.by===user.name?"bg-orange-500 text-white border-orange-500":"bg-white text-slate-700 border-slate-200"}`}><div className={`text-xs font-bold mb-1 ${m.by===user.name?"text-orange-100":"text-slate-400"}`}>{m.by} · {ROLE_META[m.role]?.label||m.role} · {fmtTime(m.time)}</div><p className="text-sm whitespace-pre-wrap">{m.text}</p>{m.attachments?.length>0&&<AttachmentList files={m.attachments}/>}</div></div>)}{list.length===0&&<div className="text-center py-20 text-slate-400">No messages yet</div>}</div>{user.role!=="client"&&<div className="p-4 border-t border-slate-100 space-y-3"><AttachmentInput files={files} onChange={setFiles} label="Attach chat files / site photos"/><div className="flex gap-2"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} placeholder="Type project message..." className="flex-1 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><button onClick={send} className="px-5 py-3 bg-orange-500 text-white font-bold rounded-xl text-sm flex items-center gap-2"><Ic n="send" s={14}/>Send</button></div></div>}</div></div>);
}
function PMView({user,projects,setView,setSP,notifs}){const unread=notifs.filter(n=>!n.read);return(<div className="p-4 md:p-8"><div className="mb-6 flex items-start justify-between"><h1 className="text-2xl font-black text-slate-800">PM Dashboard</h1><div className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-blue-100 text-blue-700"><Ic n="shield" s={12}/>Project Manager</div></div><div className="grid grid-cols-3 gap-4 mb-8"><SC icon="building" label="Projects" value={projects.length} accent="blue"/><SC icon="trend" label="Active" value={projects.filter(p=>p.status==="active").length} accent="orange"/><SC icon="bell" label="Unread" value={unread.length} accent="violet"/></div>{unread.length>0&&<div className="mb-8"><h2 className="font-bold text-slate-800 text-base mb-4">Notifications</h2><div className="space-y-3">{unread.map(n=><div key={n.id} className="bg-white rounded-2xl border border-orange-100 p-4 flex gap-3 shadow-sm"><div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="bell" s={16} c="text-orange-500"/></div><div><div className="font-semibold text-slate-800 text-sm">{n.title}</div><p className="text-slate-500 text-xs mt-0.5">{n.message}</p></div></div>)}</div></div>}<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{projects.map(p=><button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:shadow-md hover:border-orange-200 transition-all group"><div className="flex items-start justify-between mb-3"><h3 className="font-bold text-slate-800 text-sm group-hover:text-orange-600">{p.name}</h3><Badge status={p.status}/></div><div className="text-xs text-slate-400 mb-3 flex items-center gap-1.5"><Ic n="map" s={11}/>{p.location}</div><PBar v={p.progress}/><div className="text-xs text-slate-400 mt-1">{p.progress}%</div></button>)}</div></div>);}
function ClientPortal({user,projects,notifs,setView,setSP}){const mp=projects.filter(p=>p.client_email===user.email);const unread=notifs.filter(n=>!n.read);return(<div className="p-4 md:p-8"><div className="mb-6 flex items-start justify-between"><h1 className="text-2xl font-black text-slate-800">Client Portal</h1><div className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-emerald-100 text-emerald-700"><Ic n="shield" s={12}/>Client View</div></div><div className="grid grid-cols-3 gap-4 mb-8"><SC icon="building" label="Projects" value={mp.length} accent="blue"/><SC icon="check" label="Milestones" value={3} accent="emerald"/><SC icon="bell" label="Updates" value={unread.length} accent="orange"/></div>{unread.length>0&&<div className="mb-8 bg-orange-50 border border-orange-100 rounded-2xl p-5"><h3 className="font-bold text-orange-800 text-sm mb-3 flex items-center gap-2"><Ic n="bell" s={16} c="text-orange-600"/>{unread.length} New Updates</h3>{unread.map(n=><div key={n.id} className="py-2 border-t border-orange-100 first:border-0"><div className="font-semibold text-orange-900 text-xs">{n.title}</div><div className="text-orange-700 text-xs mt-0.5">{n.message}</div></div>)}</div>}<div className="space-y-4">{mp.map(p=><button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="w-full bg-white rounded-2xl border border-slate-200 p-6 text-left hover:shadow-md hover:border-orange-200 transition-all group"><div className="flex items-start justify-between mb-4"><div><h3 className="font-bold text-slate-800 group-hover:text-orange-600">{p.name}</h3><div className="flex items-center gap-1.5 text-slate-400 text-xs mt-1"><Ic n="map" s={12}/>{p.location}</div></div><Badge status={p.status}/></div><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">Progress</span><span className="font-black">{p.progress}%</span></div><PBar v={p.progress}/></button>)}{mp.length===0&&<div className="text-center py-20 text-slate-400"><Ic n="building" s={32} c="mx-auto mb-3 opacity-30"/><p>No projects assigned to your account</p></div>}</div></div>);}

// ── CLIENT SHARE VIEW ─────────────────────────────────────────────────────────
function ClientShareView({project,milestones,updates,drawings}){
  if(!project) return <div className="min-h-screen bg-cream flex items-center justify-center"><div className="text-center text-ink-500"><Ic n="building" s={40} c="mx-auto mb-4 opacity-30"/><p className="font-display text-lg">Project not found</p></div></div>;
  const ms=milestones||[];const us=updates||[];const done=ms.filter(m=>m.status==="completed").length;
  const clientDrawings=(drawings||[]).filter(d=>isReleasedCurrentDrawing(d,"client"));
  return(
    <div className="min-h-screen bg-cream font-sans">
      {/* Editorial masthead */}
      <header className="relative bg-ink-900 text-cream overflow-hidden">
        <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full pointer-events-none" style={{background:"radial-gradient(circle, rgba(217,119,6,.18) 0%, transparent 65%)"}}/>
        <div className="absolute -bottom-20 -right-20 w-[28rem] h-[28rem] rounded-full pointer-events-none" style={{background:"radial-gradient(circle, rgba(245,158,11,.12) 0%, transparent 65%)"}}/>
        <div className="relative max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg"><Ic n="hardhat" s={20} c="text-white"/></div>
              <div>
                <div className="font-display text-xl font-bold tracking-editorial leading-none">SiteTrack</div>
                <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-gradient-gold mt-1">Client Report</div>
              </div>
            </div>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-500/80">Read-only</div>
          </div>

          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-4">— Project Progress · {new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
          <h1 className="font-display text-4xl md:text-5xl font-light leading-[1.05] tracking-editorial mb-4">{project.name}</h1>
          <div className="flex items-center gap-2 text-cream/60 text-sm"><Ic n="map" s={14}/>{project.location}</div>

          <div className="mt-8 grid grid-cols-3 gap-6 pt-6" style={{borderTop:"1px solid rgba(255,251,235,.1)"}}>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Progress</div>
              <div className="font-display text-3xl font-light tracking-editorial">{project.progress}<span className="text-amber-500 text-xl">%</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Milestones</div>
              <div className="font-display text-3xl font-light tracking-editorial">{done}<span className="text-cream/50 text-xl"> / {ms.length}</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Handover</div>
              <div className="font-display text-base font-medium tracking-editorial leading-snug pt-2">{fmtDate(project.expected_end_date)}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
        {/* Progress card */}
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Overall completion</div>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Project Progress</h2>
            <Badge status={project.status}/>
          </div>
          <PBar v={project.progress}/>
          <p className="text-ink-600 text-sm mt-4 leading-relaxed">{project.description}</p>
        </section>

        {ms.length>0&&<section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Phases</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Milestones</h2>
          <div className="space-y-4">{ms.map((m,i)=>
            <div key={m.id} className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs ${m.status==="completed"?"bg-gradient-gold border-transparent":m.status==="in_progress"?"bg-amber-500 border-amber-500":"bg-white border-stone-200"}`}>
                {m.status==="completed"?<Ic n="check" s={13} c="text-white"/>:<span className="font-bold text-ink-500">{i+1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-base font-medium text-ink-900 tracking-editorial leading-tight">{m.title}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">Due {fmtDate(m.due_date)}{m.completed_date?` · Completed ${fmtDate(m.completed_date)}`:""}</div>
              </div>
              <Badge status={m.status}/>
            </div>
          )}</div>
        </section>}

        {clientDrawings.length>0&&<section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Documents</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Released Drawings</h2>
          <div className="space-y-3">{clientDrawings.map(d=>
            <div key={d.id} className="p-4 bg-cream-200/50 rounded-xl" style={{border:"1px solid var(--st-line)"}}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="doc" s={18} c="text-amber-700"/></div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base font-semibold text-ink-900 tracking-editorial leading-tight">{d.title}</div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-ink-500 mt-1">
                    <span className="text-amber-700 font-bold tracking-wider uppercase">{d.type}</span>
                    <span>·</span><span>{d.revision}</span>
                    <span>·</span><span>{fmtDate(d.date)}</span>
                    {(d.files||[]).length>0&&<><span>·</span><span>{(d.files||[]).length} file(s)</span></>}
                  </div>
                  {d.notes&&<p className="text-xs text-ink-600 mt-2">{d.notes}</p>}
                </div>
                <Badge status={d.status}/>
              </div>
              <AttachmentList files={d.files||d.attachments||[]}/>
            </div>
          )}</div>
        </section>}

        {us.length>0&&<section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Field</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Recent Updates</h2>
          <div className="space-y-5">{us.slice(0,3).map(u=>
            <article key={u.id} className="pb-5 last:pb-0" style={{borderBottom:"1px solid var(--st-line)"}}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-amber-700">{fmtDate(u.update_date)}</div>
                {u.weather&&<span className="text-[10px] bg-amber-50 text-amber-800 font-semibold px-2 py-1 rounded-full tracking-wider">{u.weather}</span>}
              </div>
              <p className="text-ink-700 text-base leading-relaxed font-display tracking-editorial">"{u.notes}"</p>
              {u.workers_count&&<div className="text-[11px] text-ink-500 mt-3 flex items-center gap-1.5"><Ic n="users" s={11}/>{u.workers_count} workers on site</div>}
            </article>
          )}</div>
        </section>}

        <footer className="text-center pt-4 pb-2">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.32em] uppercase text-ink-500">
            <span>—</span>
            <span>SiteTrack Pro · Construction Suite</span>
            <span>—</span>
          </div>
          <p className="text-[11px] text-ink-500 mt-2">A confidential project record prepared for {project.client_name}.</p>
        </footer>
      </main>
    </div>
  );
}

// ── CALENDAR VIEW (cross-project deadlines) ──────────────────────────────────
function CalendarView({user,projects,milestones,tasks,invoices}){
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

// ── VENDORS VIEW ─────────────────────────────────────────────────────────────
function VendorsView({user,vendors,setVendors}){
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
      ))}{fl.length===0&&<div className="col-span-2 text-center py-16 text-slate-400"><Ic n="truck" s={32} c="mx-auto mb-3 opacity-30"/><p>No vendors yet</p></div>}</div>
    </div>
  );
}

// ── PURCHASE ORDERS VIEW (cross-project) ─────────────────────────────────────
function POsView({user,projects,pos,vendors,setView,setSP}){
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

// ── GLOBAL SEARCH ────────────────────────────────────────────────────────────
function GlobalSearch({projects,milestones,issues,vendors,setView,setSP,lang,user}){
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

// ── COMMENTS THREAD (reusable) ───────────────────────────────────────────────
function Comments({entityId,comments,setComments,user}){
  const[txt,setTxt]=useState("");
  const list=comments.filter(c=>c.entity===entityId);
  const add=()=>{if(!txt.trim())return;setComments(p=>[...p,{id:"cm_"+Date.now(),entity:entityId,text:txt,by:user.name,role:user.role,time:new Date().toISOString()}]);setTxt("");};
  return(
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2"><Ic n="msgcircle" s={12}/>Comments ({list.length})</div>
      <div className="space-y-2 mb-2">{list.map(c=>(
        <div key={c.id} className="flex gap-2 items-start text-xs">
          <span className={`font-bold px-1.5 py-0.5 rounded ${ROLE_META[c.role]?.bg} ${ROLE_META[c.role]?.text}`}>{c.by.split(" ")[0]}</span>
          <span className="text-slate-600 flex-1">{c.text}</span>
          <span className="text-slate-300 text-[10px] flex-shrink-0">{fmtTime(c.time)}</span>
        </div>
      ))}</div>
      <div className="flex gap-2"><input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add();}} placeholder="Add comment..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-orange-400"/><button onClick={add} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-lg"><Ic n="send" s={12}/></button></div>
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App(){
  const initialView = () => new URLSearchParams(window.location.search).get("view") || "dashboard";
  const[user,setUser]=useLS("user",null);const[view,setViewRaw]=useState(initialView);const[sp,setSP]=useState(null);
  const[projects,setProjects]=useLS("projects",INIT_PROJECTS);
  const[milestones,setMilestones]=useLS("milestones",INIT_MILESTONES);
  const[updates,setUpdates]=useLS("updates",INIT_UPDATES);
  const[expenses,setExpenses]=useLS("expenses",INIT_EXPENSES);
  const[notifs,setNotifs]=useLS("notifs",INIT_NOTIFS);
  const[teams,setTeams]=useLS("teams",INIT_TEAMS);
  const[attendance,setAttendance]=useLS("attendance",INIT_ATTENDANCE);
  const[issues,setIssues]=useLS("issues",INIT_ISSUES);
  const[materials,setMaterials]=useLS("materials",INIT_MATERIALS);
  const[drawings,setDrawings]=useLS("drawings",INIT_DRAWINGS);
  const[activity,setActivity]=useLS("activity",INIT_ACTIVITY);
  // New feature state
  const[tasks,setTasks]=useLS("tasks",INIT_TASKS);
  const[punch,setPunch]=useLS("punch",INIT_PUNCH);
  const[rfi,setRfi]=useLS("rfi",INIT_RFI);
  const[co,setCo]=useLS("co",INIT_CO);
  const[inspections,setInspections]=useLS("inspections",INIT_INSPECTIONS);
  const[safety,setSafety]=useLS("safety",INIT_SAFETY);
  const[vendors,setVendors]=useLS("vendors",INIT_VENDORS);
  const[pos,setPos]=useLS("pos",INIT_POS);
  const[invoices,setInvoices]=useLS("invoices",INIT_INVOICES);
  const[labour,setLabour]=useLS("labour",INIT_LABOUR);
  const[ra,setRa]=useLS("ra",INIT_RA);
  const[comments,setComments]=useLS("comments",INIT_COMMENTS);
  const[equipment,setEquipment]=useLS("equipment",INIT_EQUIPMENT);
  const[diary,setDiary]=useLS("diary",INIT_DIARY);
  const[worklogs,setWorklogs]=useLS("worklogs",INIT_WORKLOGS);
  const[checklists,setChecklists]=useLS("checklists",INIT_CHECKLISTS);
  const[submittals,setSubmittals]=useLS("submittals",INIT_SUBMITTALS);
  const[permits,setPermits]=useLS("permits",INIT_PERMITS);
  const[messages,setMessages]=useLS("messages",INIT_MESSAGES);
  const[boq,setBoq]=useLS("boq",INIT_BOQ);
  const[ledger,setLedger]=useLS("ledger",INIT_LEDGER);
  const[estimate,setEstimate]=useLS("estimate",INIT_ESTIMATE);
  const[orgs,setOrgs]=useLS("orgs",INIT_ORGS);
  const[adminUsers,setAdminUsers]=useLS("admin_users",INIT_ADMIN_USERS);
  const[adminFlags,setAdminFlags]=useLS("admin_flags",{drawing_markup:true,ai_insights:true,dpr_auto:false,whatsapp_share:true,e_signature:true,offline_queue:true});
  const[lang,setLang]=useLS("lang","en");
  // Offline-first state — surfaced as a pill in the top bar
  const[online,setOnline]=useState(isOnline());
  const[pendingOps,setPendingOps]=useState(queueLength());
  useEffect(()=>{
    const off=onConnectivityChange(setOnline);
    const tick=setInterval(()=>setPendingOps(queueLength()),3000);
    return ()=>{off();clearInterval(tick);};
  },[]);
  const[dark,setDark]=useLS("dark",false);
  const[mobileOpen,setMobileOpen]=useState(false);

  // Share view
  const urlParams=new URLSearchParams(window.location.search);const shareId=urlParams.get("share");
  if(shareId&&!user) return <LoginScreen onLogin={u=>{setUser(u);setViewRaw("dashboard");}} dark={dark} toggleDark={()=>setDark(p=>!p)}/>;

  // Activity logger - all PM/client actions visible to architect
  const addActivity=(pid,pname,type,action,detail,byName,byRole)=>{
    if(byRole==="architect") return; // architect actions don't log to feed
    setActivity(p=>[{id:"ac_"+Date.now(),pid,pname,type,by:byName,role:byRole,action,detail,time:new Date().toISOString(),read:false},...p]);
  };

  const setView=v=>{if(v==="logout"){setUser(null);return;}setViewRaw(user&&v!=="detail"&&!canOpenView(user,v)?fallbackViewForUser(user):v);setMobileOpen(false);};
  if(!user) return <LoginScreen onLogin={u=>{const next=initialView();setUser(u);setViewRaw(PERMS[u.role]?.nav.includes(next)?next:"dashboard");}} dark={dark} toggleDark={()=>setDark(p=>!p)}/>;
  if(shareId){
    const shp=projects.find(p=>p.id===shareId);
    if(!canAccessProject(user,shp)) return <div className="p-8"><AccessDenied msg="This project share is not available for your account."/></div>;
    return <ClientShareView project={shp} milestones={milestones[shareId]||[]} updates={updates[shareId]||[]} drawings={(drawings[shareId]||[]).filter(d=>user.role==="architect"||isReleasedCurrentDrawing(d,user.role))}/>;
  }

  const uc=notifs.filter(n=>!n.read).length;
  const ac=activity.filter(a=>!a.read).length;
  const selectedProject=projects.find(p=>p.id===sp);
  const effectiveView=(canOpenView(user,view) && (view!=="detail" || !selectedProject || canAccessProject(user,selectedProject))) ? view : fallbackViewForUser(user);
  const dp={projects,setProjects,milestones,setMilestones,updates,setUpdates,expenses,setExpenses,teams,setTeams,attendance,setAttendance,issues,setIssues,materials,setMaterials,drawings,setDrawings,addActivity,
    tasks,setTasks,punch,setPunch,rfi,setRfi,co,setCo,inspections,setInspections,safety,setSafety,vendors,pos,setPos,invoices,setInvoices,labour,setLabour,ra,setRa,comments,setComments,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,submittals,setSubmittals,permits,setPermits,messages,setMessages,boq,setBoq,ledger,setLedger,estimate,setEstimate,lang};

  const renderView=()=>{
    switch(effectiveView){
      case"dashboard": return <DashboardView user={user} projects={projects} updates={updates} issues={issues} activity={activity} setView={setView} setSP={setSP}/>;
      case"projects": return <ProjectsView user={user} projects={projects} setView={setView} setSP={setSP}/>;
      case"analytics": return <AnalyticsView user={user} projects={projects} expenses={expenses} updates={updates} teams={teams}/>;
      case"activity": return <ActivityView user={user} activity={activity} setActivity={setActivity} projects={projects}/>;
      case"detail": return <DetailView pid={sp} user={user} setView={setView} {...dp}/>;
      case"create": return <CreateView user={user} setView={setView} setProjects={setProjects}/>;
      case"notifications": return <NotifsView notifs={notifs} setNotifs={setNotifs}/>;
      case"messages": return <MessagesView user={user} projects={projects} messages={messages} setMessages={setMessages}/>;
      case"pm": return <PMView user={user} projects={projects} setView={setView} setSP={setSP} notifs={notifs}/>;
      case"client": return <ClientPortal user={user} projects={projects} notifs={notifs} setView={setView} setSP={setSP}/>;
      case"calendar": return <CalendarView user={user} projects={projects} milestones={milestones} tasks={tasks} invoices={invoices}/>;
      case"vendors": return <VendorsView user={user} vendors={vendors} setVendors={setVendors}/>;
      case"po": return <POsView user={user} projects={projects} pos={pos} vendors={vendors} setView={setView} setSP={setSP}/>;
      case"admin-dashboard": return <SuperAdminDashboard user={user} orgs={orgs} adminUsers={adminUsers} projects={projects} issues={issues} activity={activity} setView={setView}/>;
      case"admin-orgs": return <OrgsAdminView user={user} orgs={orgs} setOrgs={setOrgs} adminUsers={adminUsers} projects={projects}/>;
      case"admin-users": return <UsersAdminView user={user} adminUsers={adminUsers} setAdminUsers={setAdminUsers} orgs={orgs}/>;
      case"admin-billing": return <BillingAdminView user={user} orgs={orgs} setOrgs={setOrgs}/>;
      case"admin-settings": return <SettingsAdminView user={user} flags={adminFlags} setFlags={setAdminFlags}/>;
      default: return <DashboardView user={user} projects={projects} updates={updates} issues={issues} activity={activity} setView={setView} setSP={setSP}/>;
    }
  };

  const DCSS=`.dark .bg-white{background-color:#1e293b!important}.dark .bg-slate-50{background-color:#0f172a!important}.dark .bg-slate-100{background-color:#1e293b!important}.dark .border-slate-200{border-color:#334155!important}.dark .border-slate-100{border-color:#293548!important}.dark .text-slate-800{color:#f1f5f9!important}.dark .text-slate-700{color:#e2e8f0!important}.dark .text-slate-600{color:#cbd5e1!important}.dark .text-slate-500{color:#94a3b8!important}.dark .text-slate-400{color:#64748b!important}.dark .divide-slate-50>*+*{border-color:#1e293b!important}.dark input,.dark textarea,.dark select{background-color:#1e293b!important;color:#f1f5f9!important;border-color:#334155!important}.dark .hover\\:bg-slate-50:hover{background-color:#1e293b!important}`;

  return(
    <div className={`flex h-screen overflow-hidden ${dark?"dark bg-ink-900":"bg-cream"} font-sans`}>
      <style>{`*{box-sizing:border-box;}.line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}.line-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}${DCSS}`}</style>
      <Sidebar user={user} active={effectiveView} setView={setView} uc={uc} ac={user.role==="architect"?ac:0} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile header */}
        <div className="md:hidden flex-shrink-0 flex items-center justify-between px-4 py-3" style={{backgroundColor:"#1c1917",borderBottom:"1px solid rgba(217,119,6,.12)"}}>
          <button onClick={()=>setMobileOpen(true)} className="text-cream/70 hover:text-cream p-1"><Ic n="menu" s={22}/></button>
          <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-lg bg-gradient-gold flex items-center justify-center"><Ic n="hardhat" s={14} c="text-white"/></div><span className="font-display text-cream font-bold text-lg tracking-editorial">SiteTrack</span></div>
          <button onClick={()=>setDark(p=>!p)} className="text-cream/70 hover:text-cream p-1"><Ic n={dark?"sun2":"moon"} s={18}/></button>
        </div>
        {/* Desktop top bar — stays put while main scrolls below */}
        <div className="hidden md:flex flex-shrink-0 items-center justify-between gap-4 px-6 py-3 bg-white" style={{borderBottom:"1px solid var(--st-line)",boxShadow:"0 1px 2px rgba(28,25,23,.03)"}}>
          <div className={`flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full flex-shrink-0 ${ROLE_META[user.role].bg} ${ROLE_META[user.role].text}`}><Ic n="shield" s={11}/>{ROLE_META[user.role].label}</div>
          {!online&&<div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full flex-shrink-0 bg-red-50 text-red-700" style={{border:"1px solid rgba(220,38,38,.2)"}} title={`${pendingOps} ops queued`}>● Offline {pendingOps>0&&`(${pendingOps})`}</div>}
          {online&&pendingOps>0&&<div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full flex-shrink-0 bg-amber-50 text-amber-800" style={{border:"1px solid rgba(217,119,6,.2)"}} title="Backend not connected; ops stay queued locally">↻ {pendingOps} queued</div>}
          <GlobalSearch projects={projects} milestones={milestones} issues={issues} vendors={vendors} setView={setView} setSP={setSP} lang={lang} user={user}/>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={lang} onChange={e=>setLang(e.target.value)} className="px-2.5 py-1.5 text-[11px] font-bold bg-cream-200 border border-stone-200 rounded-lg outline-none cursor-pointer tracking-wider"><option value="en">EN</option><option value="te">తె</option><option value="hi">हि</option></select>
            <button onClick={()=>setDark(p=>!p)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider transition-all ${dark?"bg-ink-900 text-amber-500":"bg-cream-200 text-ink-700 hover:bg-cream-100"}`}><Ic n={dark?"sun2":"moon"} s={13}/>{dark?t(lang,"lightMode"):t(lang,"darkMode")}</button>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">{renderView()}</main>
      </div>
    </div>
  );
}
