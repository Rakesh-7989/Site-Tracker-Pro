// SiteTrack Pro — DEMO dataset (opt-in).
//
// This file holds the rich showcase data: 5 customer orgs, 15 users, 4 projects,
// drawings, BOQ, RA bills, support tickets — everything a salesperson needs to
// walk a prospect through the full product in 5 minutes.
//
// IMPORTANT: This is NOT loaded by default in production. A new customer signs
// up to an empty workspace and starts by creating their first project. The
// demo dataset only loads when a user clicks "Load demo data" on the login
// screen.
//
// All named exports are also bundled into the DEMO_SEED object at the bottom
// of this file, whose keys match the useLS storage keys in App.jsx.

export const MOCK_USERS = {
  architect: {id:"u1",name:"Arjun Reddy",email:"arjun@buildco.in",role:"architect",avatar:"AR",org_id:"org1"},
  pm:        {id:"u2",name:"Priya Sharma",email:"priya@buildco.in",role:"pm",avatar:"PS",org_id:"org1"},
  contractor:{id:"u4",name:"Karthik Builders",email:"site@karthikbuilders.in",role:"contractor",avatar:"KB",org_id:"org1"},
  client:    {id:"u3",name:"Vikram Nair",email:"vikram@client.in",role:"client",avatar:"VN",org_id:"org1"},
  orgadmin:  {id:"u200",name:"Mohan Boyapati",email:"owner@buildco.in",role:"orgadmin",avatar:"MB",org_id:"org1"},
  superadmin:{id:"u100",name:"Rakesh Boyapati",email:"admin@sitetrack.in",role:"superadmin",avatar:"RB",org_id:null},
};

export const PLAN_META = {
  basic:{label:"Basic",price:999,color:"slate"},
  pro:{label:"Pro",price:2999,color:"blue"},
  business:{label:"Business",price:7999,color:"orange"},
  custom:{label:"Custom",price:0,color:"violet"},
};

export const INIT_ORGS = [
  {id:"org1",name:"BuildCo India",slug:"buildco",plan:"business",mrr:7999,users_count:4,projects_count:4,created:"2024-10-01",contact_email:"arjun@buildco.in",status:"active",trial_ends:null,city:"Hyderabad"},
  {id:"org2",name:"Skyline Architects",slug:"skyline-arch",plan:"pro",mrr:2999,users_count:3,projects_count:2,created:"2025-02-15",contact_email:"anika@skyline.in",status:"active",trial_ends:null,city:"Bangalore"},
  {id:"org3",name:"Premier Builders & Co.",slug:"premier",plan:"basic",mrr:999,users_count:2,projects_count:1,created:"2025-04-20",contact_email:"suresh@premier.in",status:"active",trial_ends:null,city:"Chennai"},
  {id:"org4",name:"Nair Holdings Construction",slug:"nair-holdings",plan:"pro",mrr:2999,users_count:5,projects_count:3,created:"2024-12-10",contact_email:"head@nair.in",status:"active",trial_ends:null,city:"Kochi"},
  {id:"org5",name:"Greenfield Developers",slug:"greenfield",plan:"basic",mrr:999,users_count:2,projects_count:1,created:"2025-05-05",contact_email:"gf@green.in",status:"trial",trial_ends:"2025-06-04",city:"Pune"},
];

export const INIT_ADMIN_USERS = [
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
  {id:"u200",name:"Mohan Boyapati",email:"owner@buildco.in",role:"orgadmin",org_id:"org1",status:"active",joined:"2024-10-01",last_seen:"2025-04-21T10:30:00Z"},
  {id:"u100",name:"Rakesh Boyapati",email:"admin@sitetrack.in",role:"superadmin",org_id:null,status:"active",joined:"2024-09-01",last_seen:"2025-04-21T10:00:00Z"},
];

export const INIT_SUPPORT = [
  {id:"st1",org_id:"org1",subject:"How do I add a new contractor user?",from:"Priya Sharma <priya@buildco.in>",body:"Hi team,\n\nA new contractor joined our project this week. How do I send them an invite so they can log in and submit worklogs from the field?\n\nThanks,\nPriya",status:"open",created:"2025-05-20T11:30:00Z",messages:[]},
  {id:"st2",org_id:"org2",subject:"GST percentage in invoices — can we customize per project?",from:"Anika Iyer <anika@skyline.in>",body:"For some commercial projects we're billing at 12% GST instead of the default 18%. Where do I change this per invoice?\n\nAnika",status:"open",created:"2025-05-19T14:00:00Z",messages:[]},
  {id:"st3",org_id:"org4",subject:"WhatsApp DPR not sending automatically",from:"Lakshmi Krishnan <lakshmi@nair.in>",body:"We configured the daily report but it isn't going out at 6PM. Could you check our WhatsApp Business integration?",status:"replied",created:"2025-05-18T09:00:00Z",replied_at:"2025-05-18T11:30:00Z",messages:[{id:"sr1",by:"Rakesh Boyapati",role:"superadmin",text:"Hi Lakshmi — the WhatsApp Business automation is queued behind the Supabase Edge Function rollout per docs/BACKEND_PLAN.md Phase B6. Right now the 'Daily Report' button generates the PDF + a wa.me link you can tap manually. Auto-send goes live next sprint.",time:"2025-05-18T11:30:00Z"}]},
  {id:"st4",org_id:"org3",subject:"Trial extension request",from:"Suresh Reddy <suresh@premier.in>",body:"Our 15-day trial is about to end but we are still evaluating with our team. Could we get a 7-day extension?",status:"open",created:"2025-05-21T10:00:00Z",messages:[]},
];

export const INIT_PROJECTS = [
  {id:"p1",name:"Skyline Tower Phase II",client_name:"Nair Holdings",client_email:"vikram@client.in",location:"Jubilee Hills, Hyderabad",lat:17.4326,lng:78.4071,status:"active",start_date:"2024-11-01",expected_end_date:"2026-06-30",budget:45000000,description:"28-floor commercial tower with underground parking.",progress:62},
  {id:"p2",name:"Green Valley Residences",client_name:"Greenfield Developers",client_email:"gf@green.in",location:"Gachibowli, Hyderabad",lat:17.4401,lng:78.3489,status:"active",start_date:"2025-01-15",expected_end_date:"2026-12-31",budget:18000000,description:"Eco-friendly residential complex with 120 units.",progress:34},
  {id:"p3",name:"Metro Link Office Park",client_name:"TechSpace Corp",client_email:"ts@techspace.in",location:"HITEC City, Hyderabad",lat:17.4504,lng:78.3800,status:"completed",start_date:"2023-06-01",expected_end_date:"2024-12-31",budget:32000000,description:"4-building IT campus.",progress:100},
  {id:"p4",name:"Heritage Mall Renovation",client_name:"RetailPlus Ltd",client_email:"rp@retailplus.in",location:"Banjara Hills, Hyderabad",lat:17.4126,lng:78.4483,status:"on_hold",start_date:"2025-03-01",expected_end_date:"2025-11-30",budget:8500000,description:"Modernization of 1990s commercial mall.",progress:15},
];

export const INIT_MILESTONES = {
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

export const INIT_UPDATES = {
  p1:[
    {id:"du1",update_date:"2025-04-20",notes:"MEP conduit routing floors 14-16 done. GHMC inspection passed.",weather:"Sunny 34°C",workers_count:67,photos:[]},
    {id:"du2",update_date:"2025-04-18",notes:"Concrete pour floor 21 complete. Mix design approved.",weather:"Cloudy 31°C",workers_count:54,photos:[]},
  ],
  p2:[{id:"du4",update_date:"2025-04-19",notes:"Ground floor columns — 8 of 24 done.",weather:"Overcast 28°C",workers_count:38,photos:[]}],
};

export const INIT_EXPENSES = {
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

export const INIT_TEAMS = {
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

export const INIT_ATTENDANCE = {
  p1:{"2025-04-20":{"t1":"present","t2":"present","t3":"present","t4":"absent"},"2025-04-19":{"t1":"present","t2":"half_day","t3":"present","t4":"absent"}},
  p2:{"2025-04-20":{"t5":"present","t6":"present"}},
};

export const INIT_ISSUES = {
  p1:[
    {id:"i1",title:"Crack in column C-12 floor 8",severity:"high",status:"open",reported_date:"2025-04-18",reported_by:"Ravi Kumar",description:"Hairline crack. Structural review needed."},
    {id:"i2",title:"Water seepage near foundation east wing",severity:"medium",status:"resolved",reported_date:"2025-04-10",reported_by:"Suresh Babu",description:"Waterproofing applied.",resolved_date:"2025-04-15"},
    {id:"i3",title:"Safety railing missing floor 14 south",severity:"high",status:"open",reported_date:"2025-04-20",reported_by:"Kiran Reddy",description:"Worker safety risk."},
  ],
  p2:[{id:"i4",title:"Formwork misalignment block B",severity:"low",status:"open",reported_date:"2025-04-17",reported_by:"Mahesh Rao",description:"Minor misalignment before pour."}],
};

export const INIT_MATERIALS = {
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

export const INIT_DRAWINGS = {
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

export const INIT_ACTIVITY = [
  {id:"ac1",pid:"p1",pname:"Skyline Tower Phase II",type:"update",by:"Priya Sharma",role:"pm",action:"Added site update",detail:"MEP conduit routing floors 14-16 done",time:"2025-04-20T10:30:00Z",read:false},
  {id:"ac2",pid:"p1",pname:"Skyline Tower Phase II",type:"issue",by:"Kiran Reddy",role:"pm",action:"Reported HIGH severity issue",detail:"Safety railing missing on floor 14 south",time:"2025-04-20T09:15:00Z",read:false},
  {id:"ac3",pid:"p1",pname:"Skyline Tower Phase II",type:"milestone",by:"Priya Sharma",role:"pm",action:"Changed milestone status",detail:"MEP Rough-In → in_progress",time:"2025-04-19T16:00:00Z",read:false},
  {id:"ac4",pid:"p2",pname:"Green Valley Residences",type:"material",by:"Mahesh Rao",role:"pm",action:"Marked material received",detail:"OPC Cement 53 Grade — 300 bags",time:"2025-04-19T14:00:00Z",read:true},
  {id:"ac5",pid:"p2",pname:"Green Valley Residences",type:"update",by:"Priya Sharma",role:"pm",action:"Added site update",detail:"Ground floor columns — 8 of 24 done",time:"2025-04-19T11:00:00Z",read:true},
];

export const INIT_NOTIFS = [
  {id:"n1",pid:"p1",title:"Update on Skyline Tower Phase II",message:"MEP conduit routing completed floors 14-16.",created_at:"2025-04-20T10:30:00Z",read:false},
  {id:"n2",pid:"p1",title:"Milestone: Frame 11-20 complete",message:"Marked complete 6 days ahead of schedule.",created_at:"2025-06-25T09:00:00Z",read:false},
  {id:"n3",pid:"p2",title:"Update on Green Valley Residences",message:"Ground floor column casting in progress.",created_at:"2025-04-19T11:00:00Z",read:true},
];

export const INIT_TASKS = {
  p1:[
    {id:"tk1",mid:"m4",title:"Electrical conduit floors 14-16",assignee:"Ravi Kumar",due:"2025-09-15",status:"in_progress",priority:"high"},
    {id:"tk2",mid:"m4",title:"Plumbing rough-in floor 12",assignee:"Anand Kumar",due:"2025-09-20",status:"pending",priority:"medium"},
    {id:"tk3",mid:"m5",title:"Facade sample approval",assignee:"Suresh Babu",due:"2025-12-10",status:"pending",priority:"high"},
  ],
  p2:[{id:"tk4",mid:"m10",title:"Column reinforcement check",assignee:"Mahesh Rao",due:"2025-07-25",status:"in_progress",priority:"high"}],
};

export const INIT_PUNCH = {
  p1:[
    {id:"pn1",title:"Door handle alignment - 1402",room:"Floor 14 Unit 02",trade:"Carpentry",assignee:"Suresh Babu",status:"open",created:"2025-04-19"},
    {id:"pn2",title:"Paint touch-up lobby",room:"Ground Lobby",trade:"Painting",assignee:"Suresh Babu",status:"in_progress",created:"2025-04-18"},
  ],
  p2:[],
};

export const INIT_RFI = {
  p1:[
    {id:"rfi1",no:"RFI-001",subject:"Beam B-14 reinforcement clarification",question:"Drawing shows 8#16 but BBS says 6#16. Please clarify.",from:"Priya Sharma",to:"Architect",status:"open",created:"2025-04-15",response:""},
    {id:"rfi2",no:"RFI-002",subject:"Window opening dimensions floor 12",question:"Variance of 50mm between architect and structural drawings.",from:"Priya Sharma",to:"Architect",status:"answered",created:"2025-04-10",response:"Use architect dimensions. Structural updated in Rev B.",responded:"2025-04-12"},
  ],
  p2:[],
};

export const INIT_CO = {
  p1:[
    {id:"co1",no:"CO-001",title:"Upgrade lobby flooring to Italian marble",reason:"Client request - premium upgrade",cost_impact:850000,time_impact:14,status:"pending_approval",created:"2025-04-16",created_by:"Priya Sharma"},
    {id:"co2",no:"CO-002",title:"Additional power outlets per floor",reason:"Revised electrical load requirements",cost_impact:340000,time_impact:7,status:"approved",created:"2025-03-20",created_by:"Priya Sharma",approved_date:"2025-03-25"},
  ],
  p2:[],
};

export const INIT_INSPECTIONS = {
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

export const INIT_SAFETY = {
  p1:[
    {id:"sf1",date:"2025-04-15",type:"near_miss",description:"Falling debris near entrance — no injury",severity:"medium",worker:"N/A",action:"Toolbox talk + helmet awareness",reported_by:"Kiran Reddy",status:"closed"},
  ],
  p2:[],
};

export const INIT_VENDORS = [
  {id:"v1",name:"Vizag Steel Ltd",category:"Steel",contact:"Mr. Rao",phone:"9876512340",gst:"36AABCV1234A1Z5",rating:4.5,projects:2},
  {id:"v2",name:"Ultratech RMC",category:"Concrete",contact:"Mr. Krishna",phone:"9876512341",gst:"36AABCU5678B1Z3",rating:4.2,projects:3},
  {id:"v3",name:"Havells India",category:"Electrical",contact:"Mr. Sharma",phone:"9876512342",gst:"36AABCH9876C1Z1",rating:4.7,projects:1},
  {id:"v4",name:"ACC Cement",category:"Cement",contact:"Mr. Reddy",phone:"9876512343",gst:"36AABCA4567D1Z9",rating:4.4,projects:2},
];

export const INIT_POS = {
  p1:[
    {id:"po1",no:"PO-001",vendor_id:"v1",items:"TMT Steel Fe500 - 25 tons",amount:1750000,gst:18,status:"approved",created:"2025-04-10",delivery:"2025-04-25"},
    {id:"po2",no:"PO-002",vendor_id:"v3",items:"Electrical conduit + boxes",amount:280000,gst:18,status:"pending",created:"2025-04-18",delivery:"2025-04-28"},
  ],
  p2:[],
};

export const INIT_INVOICES = {
  p1:[
    {id:"inv1",no:"INV-001",milestone:"Foundation Complete",amount:6750000,gst:18,tds:2,status:"paid",issued:"2025-01-15",paid:"2025-02-10"},
    {id:"inv2",no:"INV-002",milestone:"Frame Floors 1-10",amount:11250000,gst:18,tds:2,status:"paid",issued:"2025-04-05",paid:"2025-04-25"},
    {id:"inv3",no:"INV-003",milestone:"Frame Floors 11-20",amount:11250000,gst:18,tds:2,status:"sent",issued:"2025-06-28",paid:null},
  ],
  p2:[],
};

export const INIT_LABOUR = {
  p1:[
    {id:"lb1",name:"Ramesh Yadav",aadhaar:"XXXX-XXXX-1234",epf:"AP/HYD/1234567",esi:"4198765432",trade:"Mason",wage:850,joined:"2024-12-01"},
    {id:"lb2",name:"Sunita Devi",aadhaar:"XXXX-XXXX-5678",epf:"AP/HYD/1234568",esi:"4198765433",trade:"Helper",wage:550,joined:"2024-12-01"},
  ],
  p2:[],
};

export const INIT_RA = {
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

export const INIT_COMMENTS = [
  {id:"cm1",entity:"i1",text:"Structural consultant visiting tomorrow",by:"Priya Sharma",role:"pm",time:"2025-04-19T11:00:00Z"},
  {id:"cm2",entity:"i3",text:"Need urgent action — work stopped on F14",by:"Kiran Reddy",role:"pm",time:"2025-04-20T09:30:00Z"},
];

export const INIT_BOQ = {
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

export const INIT_ESTIMATE = {
  p1:{markup:12,overhead:8,contingency:5,gst:18,note:"Initial estimate for client approval — premium fit-out included",version:1,updated:"2025-04-10"},
  p2:{markup:10,overhead:7,contingency:4,gst:18,note:"",version:1,updated:"2025-04-12"},
};

export const INIT_LEDGER = {
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

export const INIT_EQUIPMENT = {
  p1:[
    {id:"eq1",name:"Tower Crane TC-01",type:"Crane",reg_no:"TC-01",supplier:"Own",hired:false,status:"on_site",entry_date:"2024-12-15",exit_date:null,notes:"Annual inspection valid till Dec 2026",attachments:[]},
    {id:"eq2",name:"Concrete Pump CP-01",type:"Concrete Pump",reg_no:"TS07CD5678",supplier:"Hyd Equipment Rental",hired:true,status:"on_site",entry_date:"2025-01-10",exit_date:null,notes:"Operator assigned for slab pours",attachments:[]},
  ],
  p2:[],
};

export const INIT_DIARY = {
  p1:[{id:"di1",date:"2025-04-20",weather:"Sunny 34C",visitors:"GHMC Inspector Mr. Reddy",instructions:"Ensure safety nets on floor 22 before next pour",work_done:"MEP conduit routing floors 14-16. Concrete pour floor 21. Safety audit.",workers_total:67,remarks:"Inspection passed. No non-compliance.",attachments:[]}],
  p2:[],
};

export const INIT_WORKLOGS = {
  p1:[
    {id:"wl1",date:"2025-04-20",contractor:"Karthik Builders",location:"Floor 21 slab",work:"Concrete pour and finishing",workers:24,hours:9,status:"approved",attachments:[]},
    {id:"wl2",date:"2025-04-21",contractor:"Prime MEP",location:"Floors 14-16",work:"Electrical conduit routing",workers:12,hours:8,status:"submitted",attachments:[]},
  ],
  p2:[],
};

export const INIT_CHECKLISTS = {
  p1:[
    {id:"cl1",title:"Foundation Inspection",type:"Quality",milestone_ref:"Foundation Complete",status:"passed",items:["Rebar spacing as per drawing","Cover blocks placed","Waterproofing applied"],checked_by:"Arjun Reddy",date:"2025-01-10",attachments:[]},
    {id:"cl2",title:"MEP Rough-in Inspection",type:"Quality",milestone_ref:"MEP Rough-In",status:"pending",items:["Conduit routes as per drawing","Pipe sizes correct","Pressure test passed"],checked_by:"",date:"",attachments:[]},
  ],
  p2:[],
};

export const INIT_SUBMITTALS = {
  p1:[
    {id:"sub1",no:"SUB-001",title:"TMT Steel Mill Certificate",trade:"Structural",package:"Rebar",due_date:"2025-04-22",status:"approved",bic:"Architect",notes:"Approved for current batch",attachments:[]},
    {id:"sub2",no:"SUB-002",title:"Facade Glass Sample",trade:"Facade",package:"Exterior",due_date:"2025-05-05",status:"submitted",bic:"Architect",notes:"Sample board pending review",attachments:[]},
  ],
  p2:[],
};

export const INIT_PERMITS = {
  p1:[
    {id:"per1",title:"GHMC Work Permit",authority:"GHMC",status:"approved",due_date:"2024-10-25",expiry:"2026-06-30",notes:"Main construction permit",attachments:[]},
    {id:"per2",title:"Fire NOC Renewal",authority:"Fire Department",status:"pending",due_date:"2025-05-15",expiry:"",notes:"Submit updated fire drawings",attachments:[]},
  ],
  p2:[],
};

export const INIT_MESSAGES = {
  p1:[
    {id:"msg1",by:"Priya Sharma",role:"pm",text:"Floor 21 pour completed. Uploaded photos in site update.",time:"2025-04-20T11:00:00Z",attachments:[]},
    {id:"msg2",by:"Karthik Builders",role:"contractor",text:"Need confirmation on B-14 reinforcement before bar bending.",time:"2025-04-20T14:30:00Z",attachments:[]},
  ],
  p2:[],
};

// Aggregator — keys MUST match the useLS storage keys in App.jsx so the
// demo loader can write each one into sitetrack_v2 in a single shot.
export const DEMO_SEED = {
  projects:   INIT_PROJECTS,
  milestones: INIT_MILESTONES,
  updates:    INIT_UPDATES,
  expenses:   INIT_EXPENSES,
  teams:      INIT_TEAMS,
  attendance: INIT_ATTENDANCE,
  issues:     INIT_ISSUES,
  materials:  INIT_MATERIALS,
  drawings:   INIT_DRAWINGS,
  activity:   INIT_ACTIVITY,
  notifs:     INIT_NOTIFS,
  tasks:      INIT_TASKS,
  punch:      INIT_PUNCH,
  rfi:        INIT_RFI,
  co:         INIT_CO,
  inspections:INIT_INSPECTIONS,
  safety:     INIT_SAFETY,
  vendors:    INIT_VENDORS,
  pos:        INIT_POS,
  invoices:   INIT_INVOICES,
  labour:     INIT_LABOUR,
  ra:         INIT_RA,
  comments:   INIT_COMMENTS,
  equipment:  INIT_EQUIPMENT,
  diary:      INIT_DIARY,
  worklogs:   INIT_WORKLOGS,
  checklists: INIT_CHECKLISTS,
  submittals: INIT_SUBMITTALS,
  permits:    INIT_PERMITS,
  messages:   INIT_MESSAGES,
  boq:        INIT_BOQ,
  ledger:     INIT_LEDGER,
  estimate:   INIT_ESTIMATE,
  orgs:       INIT_ORGS,
  admin_users: INIT_ADMIN_USERS,
  support_tickets: INIT_SUPPORT,
};
