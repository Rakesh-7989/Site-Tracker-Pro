// SiteTrack Pro — UI lookup tables.
//
// Category arrays + status color maps + tab labels — everything that's pure
// data driving dropdowns and pills. Extracted from App.jsx (LOW-5 / Split-2).

// v2 Phase A: project type taxonomy — see docs/ROLE_MODEL_V2.md.
// Every project belongs to exactly one type. Drives tab visibility,
// default team template, and BOQ category presets per type.
export const PROJECT_TYPES = [
  { id: "construction", label: "Construction",  desc: "Full execution — civil, MEP, finishing. Heaviest team." },
  { id: "interior",     label: "Interior",      desc: "Fit-out / decoration. Architect + Interior Designer + Site Eng." },
  { id: "design",       label: "Design",        desc: "Pure design consultancy — drawings + specs, no execution." },
  { id: "consultant",   label: "Consultant",    desc: "Specialist engagement (structural, MEP, vastu, sustainability)." },
];
export const PROJECT_TYPE_IDS = PROJECT_TYPES.map(t => t.id);
export const DEFAULT_PROJECT_TYPE = "construction"; // back-compat: every existing project

export const EXPENSE_CATS = ["Materials","Labour","Equipment","Misc","Consultancy","Permits"];
export const VENDOR_CATS  = ["Steel","Cement","Concrete","Electrical","Plumbing","Tiles","Paint","Glass","Wood","Sand","Aggregate","Tools","Other"];
export const TRADES       = ["Mason","Helper","Carpenter","Electrician","Plumber","Painter","Welder","Steel Fixer","Tile Worker","Operator"];
export const PUNCH_TRADES = ["Carpentry","Painting","Plumbing","Electrical","Tiling","Glazing","HVAC","Civil","Other"];
export const DRAW_TYPES   = ["Architectural","Structural","MEP","Civil","Landscape","Interior","Electrical"];
export const ROLES_LIST   = ["Site Engineer","Foreman","Safety Officer","Electrician","Plumber","Mason","Carpenter","Supervisor"];

export const SEV_COLOR = {
  high:   {bg:"bg-red-50",   text:"text-red-600",     border:"border-red-200",   dot:"bg-red-500"},
  medium: {bg:"bg-amber-50", text:"text-amber-700",   border:"border-amber-200", dot:"bg-amber-400"},
  low:    {bg:"bg-blue-50",  text:"text-blue-600",    border:"border-blue-200",  dot:"bg-blue-400"},
};

export const MAT_STATUS = {
  received: {bg:"bg-emerald-50", text:"text-emerald-700", border:"border-emerald-200"},
  expected: {bg:"bg-blue-50",    text:"text-blue-600",    border:"border-blue-200"},
  rejected: {bg:"bg-red-50",     text:"text-red-600",     border:"border-red-200"},
};

export const CAT_COLORS = {
  Materials:   "bg-blue-50 text-blue-600",
  Labour:      "bg-violet-50 text-violet-600",
  Equipment:   "bg-amber-50 text-amber-600",
  Misc:        "bg-slate-100 text-slate-500",
  Consultancy: "bg-emerald-50 text-emerald-600",
  Permits:     "bg-orange-50 text-orange-600",
};

export const ATT_STATUS = {
  present:  {label:"Present",  bg:"bg-emerald-100", text:"text-emerald-700"},
  absent:   {label:"Absent",   bg:"bg-red-100",     text:"text-red-600"},
  half_day: {label:"Half Day", bg:"bg-amber-100",   text:"text-amber-700"},
};

export const ACTIVITY_ICONS = {
  update:"hardhat", issue:"alert", milestone:"flag", material:"truck",
  drawing:"doc", expense:"wallet", team:"users", general:"bell",
};

export const CHART_COLORS = ["#f97316","#3b82f6","#10b981","#8b5cf6","#f59e0b","#ef4444"];

export const TAB_LABELS = {
  fieldops:"Field Ops", approvals:"Approvals", changeorders:"Change Orders",
  punchlist:"Punch List", rabills:"RA Bills", po:"PO", rfi:"RFI",
  ai:"AI", map:"Map", boq:"BOQ", ledger:"Stock Ledger", estimate:"Estimate",
};

export const BOQ_UNITS = ["cum","sqm","sqft","kg","ton","nos","rmt","ltr","bag","trip"];

export const LEDGER_DIRS = {
  inward:  {label:"Inward",  bg:"bg-emerald-50", text:"text-emerald-700", border:"border-emerald-200"},
  outward: {label:"Outward", bg:"bg-amber-50",   text:"text-amber-700",   border:"border-amber-200"},
  return:  {label:"Return",  bg:"bg-blue-50",    text:"text-blue-700",    border:"border-blue-200"},
  wastage: {label:"Wastage", bg:"bg-red-50",     text:"text-red-700",     border:"border-red-200"},
};
