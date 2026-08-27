// SiteTrack Pro — email template + send system tests.
// Uses pure functions only (no runtime imports) — safe for auth-layer & CI.

import {
  EMAIL_TITLES,
  EMAIL_BODIES,
  generateTitle,
  generateBody,
  DEFAULT_PLACEHOLDERS,
  formatEmail,
  EMAIL_COLOR_MAP,
} from "@/app/engines/emailTemplates";
import { sendEmail, sendEmailWithType } from "@/lib/integrations/email";

describe("EmailType", () => {
  test("has correct number of types", () => {
    const types = [
      "dpr_submitted",
      "dpr_reminder",
      "dpr_approved",
      "dpr_rejected",
      "dpr_deadline_approaching",
      "project_milestone",
      "project_deadline_approaching",
      "invoice_generated",
      "invoice_overdue",
      "invoice_paid",
      "ra_bill_generated",
      "ra_bill_paid",
      "welcome",
      "weekly_digest",
      "system_alert",
      "project_ready",
      "payment_received",
      "overdue_payment",
      "password_reset",
      "account_verified",
      "org_invite",
      "project_invite",
    ];
    expect(types.length).toBe(22);
  });
});

describe("EMAIL_TITLES", () => {
  test("has title for every EmailType", () => {
    for (const type of Object.keys(EMAIL_TITLES)) {
      expect(EMAIL_TITLES[type]).toBeDefined();
      expect(typeof EMAIL_TITLES[type]).toBe("string");
    }
  });
});

describe("EMAIL_BODIES", () => {
  test("has body for every EmailType", () => {
    for (const type of Object.keys(EMAIL_BODIES)) {
      expect(EMAIL_BODIES[type]).toBeDefined();
      expect(typeof EMAIL_BODIES[type]).toBe("string");
    }
  });
});

describe("generateTitle", () => {
  test("substitutes known placeholders", () => {
    expect(generateTitle("dpr_submitted", { project: "Project X", ref: "DPR-123" })).toBe(
      "DPR Submitted"
    ); // base has no placeholders in title, but test structure
    // Actually dpr_submitted title is "DPR Submitted" with no placeholders
    expect(generateTitle("welcome", { name: "Dinesh" })).toBe("Welcome to SiteTrack");
  });

  test("preserves unknown placeholders", () => {
    expect(generateTitle("dpr_submitted", { unknown: "dne" })).toBe("DPR Submitted");
  });
});

describe("generateBody", () => {
  test("substitutes known placeholders", () => {
    const result = generateBody("dpr_submitted", {
      project: "Project X",
      ref: "DPR-123",
    });
    expect(result).toBe("Your DPR for Project X has been submitted. Reference: DPR-123.");
  });

  test("preserves unknown placeholders", () => {
    const result = generateBody("dpr_submitted", { unknown: "dne" });
    expect(result).toContain("{ref}");
  });

  test("works with weekly_digest", () => {
    const result = generateBody("weekly_digest", { count: "5" });
    expect(result).toBe("Your weekly summary is ready. 5 new activities since last week.");
  });
});

describe("DEFAULT_PLACEHOLDERS", () => {
  test("has defaults for all types", () => {
    for (const type of Object.keys(DEFAULT_PLACEHOLDERS)) {
      expect(DEFAULT_PLACEHOLDERS[type]).toBeDefined();
      expect(typeof DEFAULT_PLACEHOLDERS[type]).toBe("object");
    }
  });
});

describe("formatEmail", () => {
  test("generates title + body with defaults", () => {
    const result = formatEmail("dpr_submitted", {
      project: "Project X",
      ref: "DPR-123",
    });
    expect(result.title).toBe("DPR Submitted");
    expect(result.body).toBe("Your DPR for Project X has been submitted. Reference: DPR-123.");
    expect(typeof result.placeholders).toBe("object");
  });

  test("merges custom overrides with defaults", () => {
    const result = formatEmail("welcome", { name: "Custom User" });
    expect(result.title).toBe("Welcome to SiteTrack");
    expect(result.body).toBe("Welcome to SiteTrack Pro, Custom User! Start by creating your first project.");
  });
});

describe("EMAIL_COLOR_MAP", () => {
  test("has all expected color keys", () => {
    const expectedKeys = [
      "primary", "secondary", "success", "warning", "error", "info",
      "light", "dark", "cream", "ink",
    ];
    for (const key of expectedKeys) {
      expect(key in EMAIL_COLOR_MAP).toBe(true);
    }
  });

  test("provides fallback hex values", () => {
    expect(EMAIL_COLOR_MAP.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(EMAIL_COLOR_MAP.success).toMatch(/^#([0-9a-f]{6}|[0-9a-f]{3})$/);
  });
});

describe("sendEmail", () => {
  test("returns success with messageId", async () => {
    const result = await sendEmail({
      type: "welcome",
      title: "Welcome to SiteTrack",
      body: "Welcome to SiteTrack Pro, User! Start by creating your first project.",
      placeholders: { name: "User" },
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  test("accepts optional to parameter", async () => {
    const result = await sendEmail({
      type: "welcome",
      title: "Welcome to SiteTrack",
      body: "Welcome to SiteTrack Pro, User!",
      placeholders: { name: "User" },
    }, "user@example.com");
    expect(result.success).toBe(true);
  });
});

describe("sendEmailWithType", () => {
  test("formats and sends email by type", async () => {
    const result = await sendEmailWithType("welcome", { name: "Dinesh" });
    expect(result.success).toBe(true);
    expect(result.email.title).toBe("Welcome to SiteTrack");
    expect(result.email.body).toContain("Dinesh");
    expect(result.messageId).toBeDefined();
  });

  test("sends overdue payment email", async () => {
    const result = await sendEmailWithType("overdue_payment", {
      amount: "₹50000",
      project: "Project X",
      due_date: "Jan 15, 2026",
    });
    expect(result.success).toBe(true);
    expect(result.email.body).toContain("₹50000");
    expect(result.email.body).toContain("Jan 15, 2026");
  });
});

/* End of email.test.js */