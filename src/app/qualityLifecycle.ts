// SiteTrack Pro — Quality, Checklists, Lab Tests, NCR & CAPA Engine
// Enterprise Quality Lifecycle supporting Civil, MEP, Interior & Consultancy domains.

export type TradeCategory = "civil" | "mep" | "interior" | "consultancy";

export interface ChecklistItemTemplate {
  id: string;
  code: string;
  description: string;
  standardRef?: string;
  requiresMeasurement?: boolean;
  unit?: string;
  expectedMin?: number;
  expectedMax?: number;
}

export interface TradeTemplate {
  id: string;
  trade: TradeCategory;
  title: string;
  scopeDescription: string;
  items: ChecklistItemTemplate[];
}

export interface ChecklistItemResult {
  itemId: string;
  status: "pass" | "fail" | "na" | "pending";
  measuredValue?: string;
  notes?: string;
  photoUrl?: string;
}

export interface ChecklistRun {
  id: string;
  projectId: string;
  templateId: string;
  title: string;
  location: string;
  workPackage: string;
  inspectedBy: string;
  inspectedAt: string;
  status: "draft" | "submitted" | "approved" | "failed_ncr_opened";
  items: ChecklistItemResult[];
}

export interface LabTestRecord {
  id: string;
  projectId: string;
  testType: "concrete_cube" | "slump" | "soil_compaction" | "rebar_tensile" | "water_pressure";
  materialLot: string;
  pourLocation: string;
  sampleDate: string;
  testDate: string;
  targetGradeOrSpec: string;
  ageDays?: number;
  expectedValue: number;
  actualValue: number;
  unit: string;
  status: "pass" | "fail" | "pending";
  testedByLab: string;
  certificateRef?: string;
}

export interface NcrRecord {
  id: string;
  projectId: string;
  ncrNumber: string;
  title: string;
  severity: "critical" | "major" | "minor";
  status: "issued" | "rca_submitted" | "capa_in_progress" | "action_completed" | "reinspected" | "verified_closed";
  location: string;
  workPackage: string;
  findingDescription: string;
  immediateCause?: string;
  rootCause?: string;
  contributingCause?: string;
  correctiveAction: string;
  preventiveAction: string;
  responsibleContractor: string;
  targetResolutionDate: string;
  slaHoursRemaining?: number;
  isBackchargeable: boolean;
  estimatedReworkCost: number;
  verifiedBy?: string;
  verifiedAt?: string;
}

export const TRADE_TEMPLATES: TradeTemplate[] = [
  {
    id: "tpl-rcc-pre-pour",
    trade: "civil",
    title: "RCC Pre-Pour Structural Inspection",
    scopeDescription: "Verification of formwork, rebar diameter, spacing, cover, and MEP sleeves prior to concrete pouring.",
    items: [
      { id: "i-1", code: "REBAR-01", description: "Rebar diameter and spacing as per structural drawings", standardRef: "IS 456 / BS 8110", requiresMeasurement: true, unit: "mm", expectedMin: 100, expectedMax: 200 },
      { id: "i-2", code: "COVER-02", description: "Clear cover verification with cover blocks installed", standardRef: "IS 456 Cl. 26.4", requiresMeasurement: true, unit: "mm", expectedMin: 25, expectedMax: 50 },
      { id: "i-3", code: "FORM-03", description: "Formwork alignment, plumb, rigidity and shuttering oil applied", standardRef: "Formwork Protocol" },
      { id: "i-4", code: "EMBED-04", description: "Embedded plates, anchor bolts and MEP conduit sleeves verified", standardRef: "MEP Coordinated Drawing" },
      { id: "i-5", code: "CLEAN-05", description: "Debris and standing water removed from pour area before signoff" },
    ],
  },
  {
    id: "tpl-waterproofing",
    trade: "civil",
    title: "Waterproofing 72-Hour Flood Test",
    scopeDescription: "Verification of membrane adhesion, coving, ponding depth, and zero underside leakage.",
    items: [
      { id: "w-1", code: "MEMB-01", description: "Surface preparation and primer coat uniform without pinholes" },
      { id: "w-2", code: "POND-02", description: "Ponding depth maintained at minimum 50mm for 72 hours", requiresMeasurement: true, unit: "mm", expectedMin: 50, expectedMax: 75 },
      { id: "w-3", code: "LEAK-03", description: "Zero moisture, dampness or staining on underside of slab" },
      { id: "w-4", code: "PROT-04", description: "Protection screed applied immediately after flood test approval" },
    ],
  },
  {
    id: "tpl-mep-pressure",
    trade: "mep",
    title: "Hydrostatic Pipe Pressure & Concealment",
    scopeDescription: "Plumbing and fire fighting pipeline hydrostatic pressure testing before shaft closure.",
    items: [
      { id: "m-1", code: "PRESS-01", description: "Hydrostatic test pressure applied for 2 hours", standardRef: "IS 2065", requiresMeasurement: true, unit: "bar", expectedMin: 10, expectedMax: 12 },
      { id: "m-2", code: "DROP-02", description: "Zero pressure drop observed over testing duration", requiresMeasurement: true, unit: "bar", expectedMin: 0, expectedMax: 0.1 },
      { id: "m-3", code: "SLOPE-03", description: "Drainage gradient verified with spirit level (minimum 1:100)" },
      { id: "m-4", code: "SLEEVE-04", description: "Firestop sealant installed at wall and slab penetrations" },
    ],
  },
  {
    id: "tpl-interior-joinery",
    trade: "interior",
    title: "Interior Joinery & False Ceiling Inspection",
    scopeDescription: "Suspended ceiling grid levelling, acoustic insulation, panel flushness and edge trims.",
    items: [
      { id: "int-1", code: "LEVEL-01", description: "False ceiling perimeter and main runner level laser verified", requiresMeasurement: true, unit: "mm deviation", expectedMin: 0, expectedMax: 3 },
      { id: "int-2", code: "CUTOUT-02", description: "Lighting, diffuser, and sprinkler cutouts aligned with drawing" },
      { id: "int-3", code: "JOINT-03", description: "Drywall tape and jointing compound sanded smooth without ridges" },
      { id: "int-4", code: "HARDW-04", description: "Door/cabinet hardware soft-close action and alignment verified" },
    ],
  },
  {
    id: "tpl-consultancy-review",
    trade: "consultancy",
    title: "Consultancy Drawing & BOQ Compliance Review",
    scopeDescription: "Peer review of structural drawings, statutory clearances, and BOQ variance audit.",
    items: [
      { id: "c-1", code: "IFC-01", description: "Issued for Construction (IFC) stamp with revision hash verified" },
      { id: "c-2", code: "STAT-02", description: "Fire NOC and municipal sanctioned plan constraints satisfied" },
      { id: "c-3", code: "BOQ-03", description: "BOQ line items reconcile within ±2% of structural bill of quantities" },
      { id: "c-4", code: "RFI-04", description: "All design clarification RFIs closed before site mobilization" },
    ],
  },
];

export const INITIAL_LAB_TESTS: LabTestRecord[] = [
  {
    id: "lab-01",
    projectId: "",
    testType: "concrete_cube",
    materialLot: "CON-LOT-2026-082",
    pourLocation: "Tower A — 3rd Floor Slab Pour #2",
    sampleDate: "2026-08-14",
    testDate: "2026-08-21",
    targetGradeOrSpec: "M30 Grade Concrete",
    ageDays: 7,
    expectedValue: 20.0,
    actualValue: 22.4,
    unit: "MPa",
    status: "pass",
    testedByLab: "Apex GeoTech & Materials Testing Lab",
    certificateRef: "CERT-CUBE-8921",
  },
  {
    id: "lab-02",
    projectId: "",
    testType: "concrete_cube",
    materialLot: "CON-LOT-2026-064",
    pourLocation: "Podium 2 — Column C12 to C18",
    sampleDate: "2026-07-24",
    testDate: "2026-08-21",
    targetGradeOrSpec: "M40 Grade High-Strength",
    ageDays: 28,
    expectedValue: 40.0,
    actualValue: 43.8,
    unit: "MPa",
    status: "pass",
    testedByLab: "Apex GeoTech & Materials Testing Lab",
    certificateRef: "CERT-CUBE-8412",
  },
  {
    id: "lab-03",
    projectId: "",
    testType: "soil_compaction",
    materialLot: "EARTH-FILL-B3",
    pourLocation: "Basement 2 Subgrade Road",
    sampleDate: "2026-08-18",
    testDate: "2026-08-19",
    targetGradeOrSpec: "Modified Proctor Density 98%",
    expectedValue: 98.0,
    actualValue: 99.2,
    unit: "% MDD",
    status: "pass",
    testedByLab: "GeoMatrix Soil Laboratory",
    certificateRef: "CERT-SOIL-103",
  },
];

export const INITIAL_NCRS: NcrRecord[] = [
  {
    id: "ncr-01",
    projectId: "",
    ncrNumber: "NCR-2026-0042",
    title: "Concrete Honeycombing at Column C-14 Junction",
    severity: "major",
    status: "capa_in_progress",
    location: "Villa 07 / Ground Floor Column C-14",
    workPackage: "Structural RCC Superstructure",
    findingDescription: "Surface honeycombing and exposed aggregate observed over 300x450mm area after formwork removal.",
    immediateCause: "Inadequate needle vibration due to congested beam-column rebar intersection.",
    rootCause: "Concrete pouring rate exceeded compaction crew capacity; standard 25mm vibrator nozzle was not used.",
    contributingCause: "Pump boom access restricted, forcing manual bucket transfer.",
    correctiveAction: "Chipping loose concrete, pressure washing, applying bonding agent and non-shrink high-strength micro-concrete.",
    preventiveAction: "Introduce 25mm slim vibrators for rebar junctions and enforce maximum 500mm pour layer thickness.",
    responsibleContractor: "G-Architects Superstructures Ltd.",
    targetResolutionDate: "2026-08-24",
    slaHoursRemaining: 72,
    isBackchargeable: true,
    estimatedReworkCost: 45000,
  },
  {
    id: "ncr-02",
    projectId: "",
    ncrNumber: "NCR-2026-0038",
    title: "Drainage Pipe Slope Defect in Shaft #3",
    severity: "minor",
    status: "verified_closed",
    location: "Block B / Level 2 Plumbing Shaft",
    workPackage: "Internal Plumbing & Sanitation",
    findingDescription: "Horizontal sewer line laid at 1:180 gradient instead of approved 1:100 slope.",
    immediateCause: "Pipe bracket fixed 15mm below specified invert level.",
    rootCause: "Subcontractor plumber did not verify ceiling laser datum line.",
    correctiveAction: "Re-anchor hanger brackets and reset invert elevation to 1:100 slope.",
    preventiveAction: "Laser level datum mandatory signoff on all shaft plumbing layouts.",
    responsibleContractor: "Apex MEP Solutions",
    targetResolutionDate: "2026-08-16",
    isBackchargeable: false,
    estimatedReworkCost: 12000,
    verifiedBy: "Senior QA/QC Engineer",
    verifiedAt: "2026-08-16 16:30",
  },
];
