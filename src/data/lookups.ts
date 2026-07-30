// SiteTrack Pro -- UI lookup tables.
//
// Category arrays + status color maps + tab labels -- everything that's pure
// data driving dropdowns and pills. Extracted from App.jsx (LOW-5 / Split-2).

// v2 Phase A: project type taxonomy -- see docs/ROLE_MODEL_V2.md.
// Every project belongs to exactly one type. Drives tab visibility,
// default team template, and BOQ category presets per type.

export interface ProjectType {
  id: string;
  label: string;
  desc: string;
}

export const PROJECT_TYPES: ProjectType[] = [
  { id: "construction", label: "Construction",  desc: "Full execution \u2014 civil, MEP, finishing. Heaviest team." },
  { id: "interior",     label: "Interior",      desc: "Fit-out / decoration. Architect + Interior Designer + Site Eng." },
  { id: "design",       label: "Design",        desc: "Pure design consultancy \u2014 drawings + specs, no execution." },
  { id: "consultant",   label: "Consultant",    desc: "Specialist engagement (structural, MEP, vastu, sustainability)." },
];
export const PROJECT_TYPE_IDS: string[] = PROJECT_TYPES.map(t => t.id);
export const DEFAULT_PROJECT_TYPE = "construction" as const;

export const CONSTRUCTION_INDUSTRIES: { id: string; label: string; desc: string }[] = [
  { id: "residential",    label: "Residential",    desc: "Single-family homes, apartments, housing developments" },
  { id: "commercial",     label: "Commercial",     desc: "Office buildings, retail spaces, hotels, malls" },
  { id: "industrial",     label: "Industrial",     desc: "Manufacturing plants, warehouses, processing facilities" },
  { id: "infrastructure", label: "Infrastructure", desc: "Roads, bridges, utilities, public works" },
  { id: "institutional",  label: "Institutional",  desc: "Government buildings, schools, hospitals, religious facilities" },
  { id: "mixed_use",      label: "Mixed-Use",      desc: "Properties combining multiple uses" },
];

export const EXPENSE_CATS: string[] = ["Materials","Labour","Equipment","Misc","Consultancy","Permits"];
export const VENDOR_CATS: string[]  = ["Steel","Cement","Concrete","Electrical","Plumbing","Tiles","Paint","Glass","Wood","Sand","Aggregate","Tools","Other"];
export const TRADES: string[]       = ["Mason","Helper","Carpenter","Electrician","Plumber","Painter","Welder","Steel Fixer","Tile Worker","Operator"];
export const PUNCH_TRADES: string[] = ["Carpentry","Painting","Plumbing","Electrical","Tiling","Glazing","HVAC","Civil","Other"];
export const DRAW_TYPES: string[]   = ["Architectural","Structural","MEP","Civil","Landscape","Interior","Electrical"];
export const ROLES_LIST: string[]   = ["Site Engineer","Foreman","Safety Officer","Electrician","Plumber","Mason","Carpenter","Supervisor"];

interface SeverityColor {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

interface SeverityColorMap {
  high: SeverityColor;
  medium: SeverityColor;
  low: SeverityColor;
}

export const SEV_COLOR: SeverityColorMap = {
  high:   {bg:"bg-red-50",   text:"text-red-600",     border:"border-red-200",   dot:"bg-red-500"},
  medium: {bg:"bg-amber-50", text:"text-amber-700",   border:"border-amber-200", dot:"bg-amber-400"},
  low:    {bg:"bg-blue-50",  text:"text-blue-600",    border:"border-blue-200",  dot:"bg-blue-400"},
};

interface MaterialStatusColor {
  bg: string;
  text: string;
  border: string;
}

interface MaterialStatusColorMap {
  received: MaterialStatusColor;
  expected: MaterialStatusColor;
  rejected: MaterialStatusColor;
}

export const MAT_STATUS: MaterialStatusColorMap = {
  received: {bg:"bg-emerald-50", text:"text-emerald-700", border:"border-emerald-200"},
  expected: {bg:"bg-blue-50",    text:"text-blue-600",    border:"border-blue-200"},
  rejected: {bg:"bg-red-50",     text:"text-red-600",     border:"border-red-200"},
};

export const CAT_COLORS: Record<string, string> = {
  Materials:   "bg-blue-50 text-blue-600",
  Labour:      "bg-violet-50 text-violet-600",
  Equipment:   "bg-amber-50 text-amber-600",
  Misc:        "bg-cream-200 text-ink-500",
  Consultancy: "bg-emerald-50 text-emerald-600",
  Permits:     "bg-orange-50 text-orange-600",
};

interface AttendanceStatus {
  label: string;
  bg: string;
  text: string;
}

interface AttendanceStatusMap {
  present: AttendanceStatus;
  absent: AttendanceStatus;
  half_day: AttendanceStatus;
}

export const ATT_STATUS: AttendanceStatusMap = {
  present:  {label:"Present",  bg:"bg-emerald-100", text:"text-emerald-700"},
  absent:   {label:"Absent",   bg:"bg-red-100",     text:"text-red-600"},
  half_day: {label:"Half Day", bg:"bg-amber-100",   text:"text-amber-700"},
};

export const ACTIVITY_ICONS: Record<string, string> = {
  update:"hardhat", issue:"alert", milestone:"flag", material:"truck",
  drawing:"doc", expense:"wallet", team:"users", general:"bell",
};

export const CHART_COLORS: string[] = ["#f97316","#3b82f6","#10b981","#8b5cf6","#f59e0b","#ef4444"];

export const TAB_LABELS: Record<string, string> = {
  fieldops:"Field Ops", approvals:"Approvals", changeorders:"Change Orders",
  punchlist:"Punch List", rabills:"RA Bills", po:"PO", rfi:"RFI",
  ai:"AI", map:"Map", boq:"BOQ", ledger:"Stock Ledger", estimate:"Estimate",
};

export const BOQ_UNITS: string[] = ["cum","sqm","sqft","kg","ton","nos","rmt","ltr","bag","trip"];

interface LedgerDirection {
  label: string;
  bg: string;
  text: string;
  border: string;
}

interface LedgerDirectionMap {
  inward: LedgerDirection;
  outward: LedgerDirection;
  return: LedgerDirection;
  wastage: LedgerDirection;
}

export const LEDGER_DIRS: LedgerDirectionMap = {
  inward:  {label:"Inward",  bg:"bg-emerald-50", text:"text-emerald-700", border:"border-emerald-200"},
  outward: {label:"Outward", bg:"bg-amber-50",   text:"text-amber-700",   border:"border-amber-200"},
  return:  {label:"Return",  bg:"bg-blue-50",    text:"text-blue-700",    border:"border-blue-200"},
  wastage: {label:"Wastage", bg:"bg-red-50",     text:"text-red-700",     border:"border-red-200"},
};
