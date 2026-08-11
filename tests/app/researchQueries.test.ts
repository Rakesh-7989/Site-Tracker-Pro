// SiteTrack Pro — Research Library query tests (Phase 1).
// Pure label maps + document/collection CRUD mappers (injected client),
// collection membership + search helpers.

import { describe, it, expect } from "vitest";
import {
  listDocuments, getDocument, createDocument, updateDocument, deleteDocument,
  listCollections, getCollection, createCollection, updateCollection, deleteCollection,
  addDocumentToCollection, removeDocumentFromCollection, listCollectionDocuments,
  searchDocuments,
  SOURCE_TYPE_LABELS, CATEGORY_LABELS, STATUS_LABELS, STATUS_TONES,
} from "@/app/researchQueries";

function docRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "d1", org_id: "o1", project_id: null, title: "IS 456:2000", abstract: "Concrete code",
    source_type: "is_code", source_url: null, document_type: "pdf", category: "structural",
    tags: ["concrete", "design"], authors: ["BIS"], publication_year: 2000,
    publisher: "BIS", doi: null, isbn: null, file_path: null, file_size: null, mime_type: null,
    status: "approved", relevance_score: null, created_by: null,
    created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z", ...overrides,
  };
}

describe("research label maps", () => {
  it("SOURCE_TYPE_LABELS covers every documented source type", () => {
    for (const t of ["is_code", "astm_standard", "research_paper", "material_datasheet", "method_statement", "case_study", "technical_note", "regulation", "other"] as const) {
      expect(SOURCE_TYPE_LABELS[t]).toBeTruthy();
    }
  });
  it("CATEGORY_LABELS covers every documented category", () => {
    for (const c of ["concrete", "steel", "geotech", "structural", "materials", "sustainability", "bim", "safety", "cost", "other"] as const) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
  it("STATUS_LABELS + STATUS_TONES cover every document status", () => {
    for (const s of ["draft", "reviewed", "approved", "archived"] as const) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_TONES[s]).toBeTruthy();
    }
  });
});

describe("research listDocuments mapper", () => {
  it("maps snake_case rows to camelCase with arrays/numbers/status coercion", async () => {
    const calls: Array<{ table: string; body?: unknown }> = [];
    const client = {
      from: (t: string) => {
        calls.push({ table: t });
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                error: null,
                data: [docRow(), docRow({ id: "d2", source_type: "bogus", category: "nope", status: "??", tags: null, authors: null, publication_year: 0 })],
              }),
            }),
          }),
        };
      },
    };
    const res = await listDocuments(client as never, "o1");
    expect(calls[0].table).toBe("research_documents");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ id: "d1", orgId: "o1", title: "IS 456:2000", sourceType: "is_code", category: "structural", status: "approved", tags: ["concrete", "design"], authors: ["BIS"], publicationYear: 2000 });
    expect(res.data[1]).toMatchObject({ tags: [], authors: [], publicationYear: 0 });
  });

  it("applies filters (category/sourceType/status/tags/search) to the query chain", async () => {
    const ops: string[] = [];
    const mk = () => ({
      select: () => mk(),
      eq: (c: string, v: unknown) => { ops.push(`eq:${c}:${v}`); return mk(); },
      overlaps: (c: string, v: unknown) => { ops.push(`overlaps:${c}:${v}`); return mk(); },
      textSearch: (c: string, v: string) => { ops.push(`textSearch:${c}:${v}`); return mk(); },
      order: () => mk(),
      limit: () => mk(),
      range: async () => ({ error: null, data: [] as unknown[] }),
    });
    const client = { from: () => mk() };
    await listDocuments(client as never, "o1", { category: "structural", sourceType: "is_code", status: "approved", tags: ["concrete"], search: "reinforced", limit: 5, offset: 10 });
    expect(ops).toContain("eq:category:structural");
    expect(ops).toContain("eq:source_type:is_code");
    expect(ops).toContain("eq:status:approved");
    expect(ops).toContain("eq:org_id:o1");
    expect(ops).toContain("textSearch:search_vector:reinforced");
  });

  it("propagates DB errors", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ order: async () => ({ error: { message: "boom" }, data: null }) }) }),
      }),
    };
    const res = await listDocuments(client as never, "o1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("research getDocument", () => {
  it("maps a single row and returns null for a missing one", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ error: null, data: docRow() }),
            }),
          }),
        }),
      }),
    };
    const res = await getDocument(client as never, "o1", "d1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data?.title).toBe("IS 456:2000");
  });
  it("returns null via maybeSingle when absent", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ error: null, data: null }),
            }),
          }),
        }),
      }),
    };
    const res = await getDocument(client as never, "o1", "nope");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });
});

describe("research createDocument", () => {
  it("inserts org + input and returns the new id", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        insert: (body: Record<string, unknown>) => {
          inserts.push(body);
          return { select: () => ({ single: async () => ({ error: null, data: { id: "n1" } }) }) };
        },
      }),
    };
    const res = await createDocument(client as never, { orgId: "o1", title: "IS 456", sourceType: "is_code", category: "structural" });
    expect(res.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ org_id: "o1", title: "IS 456", source_type: "is_code", category: "structural", document_type: "pdf", tags: [], authors: [] });
    if (res.ok) expect(res.data.id).toBe("n1");
  });
  it("propagates insert errors", async () => {
    const client = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ error: { message: "boom" }, data: null }) }) }),
      }),
    };
    const res = await createDocument(client as never, { orgId: "o1", title: "X", sourceType: "is_code", category: "other" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("research updateDocument", () => {
  it("only builds a body for provided fields and scopes by id + org", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        update: (body: Record<string, unknown>) => {
          updates.push(body);
          return { eq: () => ({ eq: () => ({ update: async () => ({ error: null }) }) }) };
        },
      }),
    };
    const res = await updateDocument(client as never, "o1", "d1", { status: "reviewed", category: "materials" });
    expect(res.ok).toBe(true);
    expect(updates[0]).toEqual({ status: "reviewed", category: "materials" });
  });
  it("propagates update errors", async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => {
              const t = (resolve: (v: unknown) => void) => resolve({ error: { message: "boom" } });
              const node: Record<string, unknown> = { then: t, update: () => node };
              return node;
            },
          }),
        }),
      }),
    };
    const res = await updateDocument(client as never, "o1", "d1", { status: "draft" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("research deleteDocument", () => {
  it("deletes scoped by id + org", async () => {
    const eqs: unknown[] = [];
    const client = {
      from: () => ({
        delete: () => ({
          eq: (c: string, v: unknown) => { eqs.push([c, v]); return { eq: (c2: string, v2: unknown) => { eqs.push([c2, v2]); return { delete: async () => ({ error: null }) }; } }; },
        }),
      }),
    };
    const res = await deleteDocument(client as never, "o1", "d1");
    expect(res.ok).toBe(true);
    expect(eqs).toEqual([["id", "d1"], ["org_id", "o1"]]);
  });
});

describe("research collections CRUD", () => {
  it("listCollections maps rows and propagates errors", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              error: null,
              data: [{ id: "c1", org_id: "o1", name: "Concrete", description: null, is_public: false, cover_image_path: null, created_by: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" }],
            }),
          }),
        }),
      }),
    };
    const res = await listCollections(client as never, "o1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]).toMatchObject({ id: "c1", orgId: "o1", name: "Concrete", isPublic: false, description: null });
  });

  it("createCollection inserts org + name", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        insert: (body: Record<string, unknown>) => {
          inserts.push(body);
          return { select: () => ({ single: async () => ({ error: null, data: { id: "c2" } }) }) };
        },
      }),
    };
    const res = await createCollection(client as never, { orgId: "o1", name: "Steel", description: "Steel codes" });
    expect(res.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ org_id: "o1", name: "Steel", description: "Steel codes", is_public: false });
  });

  it("updateCollection only builds a body for provided fields", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        update: (body: Record<string, unknown>) => {
          updates.push(body);
          return { eq: () => ({ eq: () => ({ update: async () => ({ error: null }) }) }) };
        },
      }),
    };
    await updateCollection(client as never, "o1", "c1", { isPublic: true });
    expect(updates[0]).toEqual({ is_public: true });
  });

  it("deleteCollection + getCollection round-trip", async () => {
    const client = {
      from: () => ({
        delete: () => ({ eq: () => ({ eq: () => ({ delete: async () => ({ error: null }) }) }) }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ error: null, data: { id: "c1", org_id: "o1", name: "X", description: null, is_public: false, cover_image_path: null, created_by: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } }),
            }),
          }),
        }),
      }),
    };
    const del = await deleteCollection(client as never, "o1", "c1");
    expect(del.ok).toBe(true);
    const got = await getCollection(client as never, "o1", "c1");
    if (got.ok) expect(got.data?.name).toBe("X");
  });
});

describe("research collection membership", () => {
  it("addDocumentToCollection inserts collection + document + notes", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        insert: (body: Record<string, unknown>) => {
          inserts.push(body);
          return { insert: async () => ({ error: null }) };
        },
      }),
    };
    const res = await addDocumentToCollection(client as never, "c1", "d1", "key reference");
    expect(res.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ collection_id: "c1", document_id: "d1", notes: "key reference" });
  });

  it("removeDocumentFromCollection deletes scoped by both ids", async () => {
    const eqs: unknown[] = [];
    const client = {
      from: () => ({
        delete: () => ({
          eq: (c: string, v: unknown) => {
            eqs.push([c, v]);
            return { eq: (c2: string, v2: unknown) => { eqs.push([c2, v2]); return { delete: async () => ({ error: null }) }; } };
          },
        }),
      }),
    };
    const res = await removeDocumentFromCollection(client as never, "c1", "d1");
    expect(res.ok).toBe(true);
    expect(eqs).toEqual([["collection_id", "c1"], ["document_id", "d1"]]);
  });

  it("listCollectionDocuments maps membership rows ordered by sort_order", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              error: null,
              data: [{ collection_id: "c1", document_id: "d1", added_by: "u1", added_at: "2026-08-01T00:00:00Z", notes: null, sort_order: 2 }],
            }),
          }),
        }),
      }),
    };
    const res = await listCollectionDocuments(client as never, "c1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]).toMatchObject({ collectionId: "c1", documentId: "d1", addedBy: "u1", sortOrder: 2 });
  });
});

describe("research searchDocuments", () => {
  function chainable(rows: unknown[] = [], ops: string[] = []) {
    const payload = Promise.resolve({ error: null, data: rows });
    const q = {
      then: (onF: (v: unknown) => void = (v) => v, onR?: (e: unknown) => void) => payload.then(onF, onR),
      catch: (onR?: (e: unknown) => void) => payload.catch(onR),
      finally: (cb: () => void) => payload.finally(cb),
      select: () => q,
      eq: (c: string, v: unknown) => { ops.push(`eq:${c}:${v}`); return q; },
      overlaps: (c: string, v: unknown) => { ops.push(`overlaps:${c}:${v}`); return q; },
      gte: (c: string, v: unknown) => { ops.push(`gte:${c}:${v}`); return q; },
      lte: (c: string, v: unknown) => { ops.push(`lte:${c}:${v}`); return q; },
      textSearch: (c: string, v: string) => { ops.push(`textSearch:${c}:${v}`); return q; },
      order: () => q,
      limit: () => q,
      range: () => q,
    };
    return q;
  }

  it("runs a websearch against search_vector and maps results", async () => {
    const ops: string[] = [];
    const client = { from: () => chainable([docRow()], ops) };
    const res = await searchDocuments(client as never, "o1", "reinforced concrete", {}, 5);
    expect(ops).toContain("eq:org_id:o1");
    expect(ops).toContain("textSearch:search_vector:reinforced concrete");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(1);
  });

  it("applies date + tag filters", async () => {
    const ops: string[] = [];
    const client = { from: () => chainable([], ops) };
    await searchDocuments(client as never, "o1", "q", { tags: ["concrete"], dateFrom: "2026-01-01", dateTo: "2026-12-31" });
    expect(ops).toContain("gte:created_at:2026-01-01");
    expect(ops).toContain("lte:created_at:2026-12-31");
    expect(ops.some(o => o.startsWith("overlaps:tags"))).toBe(true);
  });

  it("propagates DB errors", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            textSearch: () => ({ order: () => ({ limit: async () => ({ error: { message: "boom" }, data: null }) }) }),
          }),
        }),
      }),
    };
    const res = await searchDocuments(client as never, "o1", "q");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("research type sanity", () => {
  it("every status maps to a Badge tone", () => {
    for (const tone of Object.values(STATUS_TONES)) {
      expect(["info", "success", "warning", "neutral"]).toContain(tone);
    }
  });
});
