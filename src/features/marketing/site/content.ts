// SiteTrack Pro — public marketing site content.
//
// Honest content model: every feature, persona and claim below maps to
// capabilities the product actually ships (checked against the codebase).
// No fabricated customers, metrics or certifications.

import type { IconName } from "@/components/ui/icons";

// ── Shared site header / footer navigation ─────────────────────────────────
export interface SiteLink {
  label: string;
  to: string;
}

export interface SiteNav {
  product: SiteLink[];
  solutions: SiteLink[];
  resources: SiteLink[];
  company: SiteLink[];
}

export const SITE_NAV: SiteNav = {
  product: [
    { label: "Product overview", to: "/product" },
    { label: "Features", to: "/features" },
    { label: "Pricing", to: "/pricing" },
  ],
  solutions: [
    { label: "All solutions", to: "/solutions" },
    { label: "Developers & builders", to: "/solutions/developers" },
    { label: "Project managers", to: "/solutions/project-managers" },
    { label: "Site engineers", to: "/solutions/site-engineers" },
    { label: "Contractors & vendors", to: "/solutions/contractors" },
  ],
  resources: [
    { label: "Resources", to: "/resources" },
    { label: "Product updates", to: "/blog" },
  ],
  company: [
    { label: "About", to: "/about" },
    { label: "Security", to: "/security" },
    { label: "Contact", to: "/contact" },
    { label: "Privacy policy", to: "/privacy" },
    { label: "Terms of service", to: "/terms" },
  ],
};

// ── Features (grouped by product module) ───────────────────────────────────
export interface SiteFeature {
  title: string;
  body: string;
}

export interface FeatureGroup {
  id: string;
  title: string;
  blurb: string;
  icon: IconName;
  features: SiteFeature[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "field",
    title: "Field operations",
    blurb: "Daily work captured from the phone your team already carries.",
    icon: "camera",
    features: [
      { title: "Voice daily progress reports", body: "Site engineers dictate DPRs in Telugu, Hindi or English and the transcript is captured with the photos it belongs to." },
      { title: "Geotagged photos", body: "Photos carry location and capture time, so a visitor’s report shows exactly where each photo was taken." },
      { title: "Offline-first", body: "Reports queue on a poor-signal site and sync automatically when the phone comes back online." },
      { title: "WhatsApp share", body: "A DPR, digest or handover pack can be pushed to a promoter over WhatsApp as a link or file." },
      { title: "Inspections & punch lists", body: "Checklists, pass/fail results and corrective actions that auto-open from a failed inspection and track to closure." },
      { title: "Handover packets", body: "Assembly of approved images and documents for project handover, with sign-off." },
    ],
  },
  {
    id: "finance",
    title: "Construction finance",
    blurb: "Every rupee on the site, from purchase order to final bill.",
    icon: "wallet",
    features: [
      { title: "Budgets vs actuals", body: "Budget lines track every expense and commitment against what was planned, with burn and variance." },
      { title: "Purchase orders & receipts", body: "POs raise against quotes, deliveries post goods receipts, and GRN feeds the inventory ledger automatically." },
      { title: "Invoices & RA bills", body: "Issue, track and reconcile invoices and Running Account bills — with GST %, TDS and net receivable computed consistently." },
      { title: "Ledger & register", body: "A per-project ledger, an org-wide invoice register and a monthly statement roll the numbers up for stakeholders." },
      { title: "Consultancy billing", body: "Fee phases, billable time entries, retainers and hourly invoices for consultant and design engagements." },
      { title: "Cash-flow & projections", body: "Forecast, cash-flow views and org analytics keep the promoter ahead of problems instead of behind them." },
    ],
  },
  {
    id: "drawings",
    title: "Drawings, RFIs & approvals",
    blurb: "One register for the latest version — no more “which drawing is current?”.",
    icon: "doc",
    features: [
      { title: "Drawing register", body: "Files stored per project with revision history, change notes and approval status." },
      { title: "CAD preview & compare", body: "DXF files preview inline, and two revisions can be overlaid to diff what actually changed." },
      { title: "RFIs & change orders", body: "Requests for information and change orders tracked to resolution instead of living in email." },
      { title: "Design workflow", body: "A stage ladder (concept → approved) is derived from the register and tracks where each design actually is." },
      { title: "Deliverables register", body: "Phase-linked deliverables with review rounds for architecture and consultancy projects." },
      { title: "FF&E schedules", body: "Furniture, fixtures and equipment tracked per project for interior and design work." },
    ],
  },
  {
    id: "people",
    title: "People & workforce",
    blurb: "Roles, attendance, wages and the whole chain from site to promoter.",
    icon: "users",
    features: [
      { title: "Role-based access", body: "22 identity roles — promoter, PM, site engineer, contractor, client and more — each sees exactly their surface." },
      { title: "Custom rbac", body: "Organisations fine-tune who can do what with custom roles and fine-grained capability grants." },
      { title: "Attendance & labour", body: "Daily attendance, shift rosters, overtime, wages and EPF/ESI estimates for the workforce register." },
      { title: "Approvals & delegations", body: "Multi-step approval chains and delegations keep control while work keeps moving." },
      { title: "Org hierarchy", body: "Teams, members and project assignments visible across the organisation." },
      { title: "Multi-organisation", body: "One login, many organisations — a consultant’s practice and each client project stays isolated." },
    ],
  },
  {
    id: "compliance",
    title: "Compliance & risk",
    blurb: "RERA, GST, statutory approvals and risk signals in one place.",
    icon: "shield",
    features: [
      { title: "RERA stage tracking", body: "Registration stages recorded against the project so filings don’t slip." },
      { title: "Statutory approvals / NOC", body: "Fire, municipal, electrical, labour and occupancy approvals with expiry tracking." },
      { title: "Audit trail", body: "Every important change is recorded, and the trail is immutable and grant-locked." },
      { title: "Risk signals", body: "A nightly score flags schedule slip, budget burn and open high-severity issues before they become crises." },
      { title: "Digests", body: "A daily promoter digest summarises progress, burn and issues — delivered by email." },
    ],
  },
  {
    id: "collaboration",
    title: "Collaboration & sharing",
    blurb: "Chat, client portals and share links that keep everyone aligned.",
    icon: "msgcircle",
    features: [
      { title: "Org chat", body: "Channels, direct messages, @mentions and reactions — one workspace for site talk." },
      { title: "Client portal", body: "Clients see milestones, payments, approved drawings and updates — only what their role allows." },
      { title: "Secure share links", body: "Password/newsletter-OTP-gated links with expiry and download restriction for external review." },
      { title: "Partner organisations", body: "A partner firm can join a project under its own org with read-only access — no shared logins." },
      { title: "Vendor portal", body: "Vendors quote against requests and track POs and payment status from their own portal." },
      { title: "CRM & sales handoff", body: "Leads → meetings → quotations → agreements → project, with owner-based pipelines." },
    ],
  },
];

// ── Solutions (personas) ───────────────────────────────────────────────────
export interface SolutionRole {
  slug: string;
  name: string;
  short: string;
  tagline: string;
  pains: string[];
  howWeHelp: { title: string; body: string }[];
  highlights: string[];
  cta: string;
}

export const SOLUTION_ROLES: SolutionRole[] = [
  {
    slug: "developers",
    name: "Developers & builders",
    short: "Promoters, owners and their trusted teams",
    tagline: "See every site the way your promoters should — a single source of truth for progress, spend and risk.",
    pains: [
      "Site updates live in scattered WhatsApp chats and phone calls.",
      "Bills, RA bills and payments sit in ten different Excel sheets.",
      "You’re always the last to know when a site slips or the budget burns.",
    ],
    howWeHelp: [
      { title: "One workspace for every project", body: "Every DPR, photo, bill and drawing lands in the same per-project record your whole team works from." },
      { title: "Aerial view of the portfolio", body: "A promoter digest, org analytics, cash-flow forecast and risk signals bring the whole portfolio into view daily." },
      { title: "Finance you can defend", body: "Budgets vs actuals, RA bills, GST/TDS handling and an org-wide invoice register — trusted numbers for every stakeholder." },
    ],
    highlights: ["Voice DPRs in Telugu / Hindi", "Promoter digest", "RA bills & budget vs actuals", "Risk signals & cash-flow forecast"],
    cta: "Run your portfolio from one place",
  },
  {
    slug: "project-managers",
    name: "Project managers",
    short: "Running delivery across multiple sites",
    tagline: "Plan, delegate and track delivery without chasing anyone for the status.",
    pains: [
      "Status updates require chasing the site engineer every evening.",
      "Approvals, RFIs and change orders drift across emails.",
      "Budget confidence evaporates when costs aren’t linked to the project.",
    ],
    howWeHelp: [
      { title: "Milestones, tasks and boards", body: "Plan the schedule, assign work and watch progress move on a board and calendar the whole team shares." },
      { title: "Approval chains", body: "Route POs, bills and deliverables through multi-step approvals with full audit." },
      { title: "RFIs & change orders", body: "Track requests and variations to resolution, linked to drawings and finance." },
    ],
    highlights: ["Milestones & task boards", "Approval chains", "RFI / change-order register", "Project & cross-project dashboards"],
    cta: "Take control of delivery",
  },
  {
    slug: "site-engineers",
    name: "Site engineers",
    short: "On the ground, in the field",
    tagline: "Log the day in minutes from your phone — even when the site has no signal.",
    pains: [
      "Evening report-writing eats your time after a full day on site.",
      "Typing long DPRs in English when you think in Telugu.",
      "Photos of progress live in everyone’s personal gallery.",
    ],
    howWeHelp: [
      { title: "Speak your report", body: "Dictate the DPR in Telugu, Hindi or English; the transcript and your geotagged photos are captured together." },
      { title: "Works offline", body: "Queue reports when the site has poor signal and they sync when you’re back online." },
      { title: "Everything the site needs", body: "Attendance, materials, issues, inspections and material requests — all raised from the field against the right project." },
    ],
    highlights: ["Voice DPR (Telugu / Hindi)", "Geotagged photos", "Offline queue", "Attendance, materials & issues"],
    cta: "Log the day in minutes",
  },
  {
    slug: "contractors",
    name: "Contractors & vendors",
    short: "Executing and supplying on a builder’s projects",
    tagline: "Quote, deliver and get paid — with the purchase chain tracked end to end.",
    pains: [
      "Requests for quotations arrive by call and get lost.",
      "No shared record that materials were ordered, delivered and received.",
      "Payment status requires phoning the accounts person.",
    ],
    howWeHelp: [
      { title: "Quote against requests", body: "Submit quotations through the vendor portal for material requests, with a comparable score next to each rival." },
      { title: "Track delivery to payment", body: "Follow the PO → goods receipt → invoice → payment-status chain for everything you supplied." },
      { title: "Labour on the record", body: "Attendance, shift rosters, overtime and wage registers keep the workforce accounted for." },
    ],
    highlights: ["Vendor portal quotes", "PO → GRN → payment status", "Labour & attendance records", "Materials indents & stock"],
    cta: "Get on the record",
  },
];

// ── Cross-cutting value props used by several pages ────────────────────────
export interface ValueProp {
  icon: IconName;
  title: string;
  body: string;
}

export const WHY_ME: ValueProp[] = [
  { icon: "hardhat", title: "Construction-native", body: "Built for sites — DPRs, RA bills, RERA — not a generic project tool bent to fit." },
  { icon: "msgcircle", title: "Speaks your language", body: "Telugu, Hindi and English, with voice input so the field actually uses it." },
  { icon: "zap", title: "Built for the field", body: "Works on any phone and offline, and shares to WhatsApp — even on poor signal." },
  { icon: "lock", title: "Secure by default", body: "Row-level tenant isolation, role-based access and an immutable audit trail." },
];