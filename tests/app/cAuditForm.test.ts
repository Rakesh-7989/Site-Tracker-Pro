// SiteTrack Pro — VNext P1.2: inspection-checklist form schema parity.
import { describe, it, expect } from "vitest";
import { checklistFormSchema, CL_KIND_LABEL, CL_STATUS_LABEL } from "@/app/queries/consultancyAuditQueries";
import { defaultValues, validateForm, isFieldVisible } from "@/app/engines/formEngine";

const labels = {
  fieldKind: "Type",
  fieldTitle: "Title",
  fieldStatus: "Status",
  titlePlaceholder: "e.g. Site visit #3",
  titleRequired: "Title is required.",
  kindLabel: (k: string) => CL_KIND_LABEL[k as keyof typeof CL_KIND_LABEL] ?? k,
  statusLabel: (s: string) => CL_STATUS_LABEL[s as keyof typeof CL_STATUS_LABEL] ?? s,
};

describe("checklistFormSchema", () => {
  it("builds kind + title for the create form (no status)", () => {
    const s = checklistFormSchema(labels, false);
    expect(s.id).toBe("inspection-checklist");
    expect(s.fields.map(f => f.name)).toEqual(["kind", "title"]);
  });

  it("adds status for the edit form", () => {
    const s = checklistFormSchema(labels, true);
    expect(s.fields.map(f => f.name)).toEqual(["kind", "title", "status"]);
  });

  it("kinds options cover every ChecklistKind with English labels", () => {
    const s = checklistFormSchema(labels, true);
    const kind = s.fields.find(f => f.name === "kind");
    expect(kind?.options?.map(o => o.value)).toEqual(["site_visit", "design_review", "quality_audit", "other"]);
    expect(kind?.options?.map(o => o.label)).toContain("Site visit");
  });

  it("status options cover every ChecklistStatus", () => {
    const s = checklistFormSchema(labels, true);
    const status = s.fields.find(f => f.name === "status");
    expect(status?.options?.map(o => o.value)).toEqual(["draft", "in_progress", "passed", "failed", "cancelled"]);
  });

  it("title is required with the translated message", () => {
    const s = checklistFormSchema(labels, false);
    const title = s.fields.find(f => f.name === "title");
    expect(title?.validate?.required).toBe(true);
    expect(title?.requiredMessage).toBe("Title is required.");
  });

  it("default values prefill kind and empty title", () => {
    const s = checklistFormSchema(labels, false);
    const d = defaultValues(s);
    expect(d.kind).toBe("site_visit");
    expect(d.title).toBe("");
  });

  it("create-form validation rejects an empty title", () => {
    const s = checklistFormSchema(labels, false);
    const { valid, errors } = validateForm(s, { kind: "other", title: "" });
    expect(valid).toBe(false);
    expect(errors.title).toBe("Title is required.");
  });

  it("create-form validation passes with a title", () => {
    const s = checklistFormSchema(labels, false);
    const { valid } = validateForm(s, { kind: "quality_audit", title: "QA #1" });
    expect(valid).toBe(true);
  });

  it("edit-form defaults map an existing row", () => {
    const s = checklistFormSchema(labels, true);
    const d = defaultValues(s);
    expect(d.status).toBe("draft");
    expect(isFieldVisible(s.fields.find(f => f.name === "status")!, d)).toBe(true);
  });
});
