// SiteTrack Pro — Privacy Policy + Terms content.
//
// ⚠️ FOUNDER NOTE: these are good-faith drafts aligned to India's DPDP Act 2023.
// Have a lawyer review before relying on them commercially. Update CONSENT_VERSION
// (and the "last updated" date) whenever the text materially changes — the new
// version is what fresh signups record agreeing to.

export const CONSENT_VERSION = "2026-06-06";
export const LAST_UPDATED = "6 June 2026";
export const COMPANY = "Rakesh Boyapati";
export const PRODUCT = "SiteTrack Pro";
export const CONTACT_EMAIL = "support@sitetrack.in"; // TODO: confirm a real inbox
export const JURISDICTION = "Hyderabad, Telangana, India";

export interface LegalSection { heading: string; body: string[]; }

export const PRIVACY: LegalSection[] = [
  { heading: "1. Who we are", body: [
    `${PRODUCT} is a construction project-management platform operated by ${COMPANY}, based in ${JURISDICTION}. This policy explains what personal data we collect, why, and your rights under India's Digital Personal Data Protection Act, 2023 (DPDP Act).`,
  ] },
  { heading: "2. Data we collect", body: [
    "Account data: your firm/company name, your name, work email, and phone number (provided at signup).",
    "Workspace data you enter: projects, daily site reports, photos, materials, attendance, finance records (POs, invoices, RA bills), drawings and messages.",
    "Sensitive personal data: where your organisation chooses to use the Labour register, your admins may enter worker details including Aadhaar/EPF/ESI numbers. You are responsible for collecting these lawfully and with the worker's consent.",
    "Technical data: session tokens stored in your browser, IP address (used to rate-limit signups), and error diagnostics.",
  ] },
  { heading: "3. Why we use your data", body: [
    "To provide and operate the service, authenticate you, and keep your workspace secure.",
    "To respond to support requests and send service emails (e.g. workspace invites, password resets, important notices).",
    "To process billing where applicable, and to comply with legal obligations.",
  ] },
  { heading: "4. Legal basis & consent", body: [
    "We process your data on the basis of your consent (captured at signup) and for the legitimate purpose of delivering a service you requested. You may withdraw consent at any time by writing to us (see §11), though this may mean we can no longer provide the service.",
  ] },
  { heading: "5. How we protect it", body: [
    "Data is encrypted in transit (HTTPS) and at rest. Each organisation's data is isolated by database row-level security so one tenant cannot access another's records. Access is role-based and least-privilege.",
  ] },
  { heading: "6. Sub-processors", body: [
    "We rely on trusted infrastructure providers who process data on our behalf: Supabase (database, authentication, hosting), Vercel (application hosting), and Resend (transactional email). Payment processing, where enabled, is handled by your chosen gateway (e.g. Razorpay/Cashfree). Each is bound by its own data-protection terms.",
  ] },
  { heading: "7. Data retention", body: [
    "We retain your data for as long as your account is active. After account closure we delete or anonymise personal data within a reasonable period, except where we must retain certain records to meet legal or accounting obligations.",
  ] },
  { heading: "8. Your rights (DPDP)", body: [
    "You have the right to access, correct, and update your personal data, to request its erasure, and to nominate a representative. To exercise any right, contact us at the address in §11. We will respond within the timelines required by law.",
  ] },
  { heading: "9. Cookies & local storage", body: [
    "We use browser local storage to keep you signed in. We do not use third-party advertising or cross-site tracking cookies.",
  ] },
  { heading: "10. Children", body: [
    "The service is intended for business use and is not directed at anyone under 18.",
  ] },
  { heading: "11. Grievances & contact", body: [
    `For any privacy question, request, or grievance, contact our Grievance Officer at ${CONTACT_EMAIL}. We take complaints seriously and will work to resolve them promptly.`,
  ] },
  { heading: "12. Changes", body: [
    `We may update this policy; the "last updated" date reflects the latest version. Material changes will be notified in-app or by email.`,
  ] },
];

export const TERMS: LegalSection[] = [
  { heading: "1. Acceptance", body: [
    `By signing up for or using ${PRODUCT} you agree to these Terms of Service and to our Privacy Policy. If you do not agree, do not use the service.`,
  ] },
  { heading: "2. The service", body: [
    `${PRODUCT} provides software to help construction firms manage projects, site reporting, materials, labour, finance, compliance and team collaboration. Features available depend on your plan.`,
  ] },
  { heading: "3. Accounts & eligibility", body: [
    "New organisations are onboarded after a review of the signup request. The person who creates an organisation is its administrator and is responsible for managing members, roles and access. Keep your credentials confidential; you are responsible for activity under your account.",
  ] },
  { heading: "4. Your data & content", body: [
    "You retain ownership of the data you put into the service. You grant us a limited licence to host and process it solely to provide the service. You are responsible for the lawfulness of data you upload — including obtaining any consent required for workers' personal data (e.g. Aadhaar/EPF/ESI) you record.",
  ] },
  { heading: "5. Acceptable use", body: [
    "Do not use the service for any unlawful purpose, to infringe others' rights, to upload malicious code, or to attempt to breach security or access another organisation's data. Do not reverse-engineer or resell the service without our written permission.",
  ] },
  { heading: "6. Plans, billing & cancellation", body: [
    "Paid plans are billed through the payment method/gateway you provide. Unless stated otherwise in writing, fees are non-refundable. You may cancel at any time; cancellation stops future billing and your workspace may be deactivated after the current period.",
  ] },
  { heading: "7. Availability & support", body: [
    "We aim for high availability but do not guarantee uninterrupted service, especially during the pilot phase. Support is provided on a best-effort basis via the contact channel published in-app.",
  ] },
  { heading: "8. Intellectual property", body: [
    `${COMPANY} owns all rights in the ${PRODUCT} software, design and trademarks. These Terms grant you a limited, non-exclusive, non-transferable right to use the service per your plan.`,
  ] },
  { heading: "9. Limitation of liability", body: [
    "To the maximum extent permitted by law, the service is provided “as is”. We are not liable for indirect or consequential losses, and our total liability is limited to the fees you paid in the three months before the claim.",
  ] },
  { heading: "10. Termination", body: [
    "We may suspend or terminate access for breach of these Terms or unlawful use. You may stop using the service at any time. On termination, your data is handled per the Privacy Policy.",
  ] },
  { heading: "11. Governing law", body: [
    `These Terms are governed by the laws of India. Courts at ${JURISDICTION} have exclusive jurisdiction over any dispute.`,
  ] },
  { heading: "12. Contact", body: [
    `Questions about these Terms? Email ${CONTACT_EMAIL}.`,
  ] },
];
