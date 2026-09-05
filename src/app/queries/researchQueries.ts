// SiteTrack Pro — Research Library Queries (Phase 1).
// Document library: CRUD, search (full-text + semantic), collections.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

import type { TypedSupabaseClient } from "@/lib/supabase/db";

export type DocumentSourceType = 'is_code' | 'astm_standard' | 'research_paper' | 'material_datasheet' | 'method_statement' | 'case_study' | 'technical_note' | 'regulation' | 'other';
export type DocumentCategory = 'concrete' | 'steel' | 'geotech' | 'structural' | 'materials' | 'sustainability' | 'bim' | 'safety' | 'cost' | 'other';
export type DocumentStatus = 'draft' | 'reviewed' | 'approved' | 'archived';

export interface ResearchDocument {
  id: string;
  orgId: string;
  projectId: string | null;
  title: string;
  abstract: string | null;
  sourceType: DocumentSourceType;
  sourceUrl: string | null;
  documentType: string;
  category: DocumentCategory;
  tags: string[];
  authors: string[];
  publicationYear: number | null;
  publisher: string | null;
  doi: string | null;
  isbn: string | null;
  filePath: string | null;
  fileSize: number | null;
  mimeType: string | null;
  status: DocumentStatus;
  relevanceScore: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchCollection {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  coverImagePath: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDocument {
  collectionId: string;
  documentId: string;
  addedBy: string | null;
  addedAt: string;
  notes: string | null;
  sortOrder: number;
}

function mapDocument(r: Record<string, unknown>): ResearchDocument {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    projectId: r.project_id == null ? null : String(r.project_id),
    title: String(r.title ?? ''),
    abstract: r.abstract == null ? null : String(r.abstract),
    sourceType: String(r.source_type) as DocumentSourceType,
    sourceUrl: r.source_url == null ? null : String(r.source_url),
    documentType: String(r.document_type ?? 'pdf'),
    category: String(r.category) as DocumentCategory,
    tags: (r.tags as string[]) ?? [],
    authors: (r.authors as string[]) ?? [],
    publicationYear: r.publication_year == null ? null : Number(r.publication_year),
    publisher: r.publisher == null ? null : String(r.publisher),
    doi: r.doi == null ? null : String(r.doi),
    isbn: r.isbn == null ? null : String(r.isbn),
    filePath: r.file_path == null ? null : String(r.file_path),
    fileSize: r.file_size == null ? null : Number(r.file_size),
    mimeType: r.mime_type == null ? null : String(r.mime_type),
    status: String(r.status ?? 'draft') as DocumentStatus,
    relevanceScore: r.relevance_score == null ? null : Number(r.relevance_score),
    createdBy: r.created_by == null ? null : String(r.created_by),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapCollection(r: Record<string, unknown>): ResearchCollection {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    name: String(r.name ?? ''),
    description: r.description == null ? null : String(r.description),
    isPublic: Boolean(r.is_public),
    coverImagePath: r.cover_image_path == null ? null : String(r.cover_image_path),
    createdBy: r.created_by == null ? null : String(r.created_by),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

export async function listDocuments(client: TypedSupabaseClient, orgId: string, filters?: {
  projectId?: string;
  category?: string;
  sourceType?: string;
  status?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Result<ResearchDocument[]>> {
  try {
    let query = client.from('research_documents')
      .select('*')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });

    if (filters?.projectId) query = query.eq('project_id', filters.projectId);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.sourceType) query = query.eq('source_type', filters.sourceType);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.tags && filters.tags.length > 0) query = query.overlaps('tags', filters.tags);
    if (filters?.search) query = query.textSearch('search_vector', filters.search, { type: 'websearch' });
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset) query = query.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 20) - 1);

    const { data, error } = await query;
    if (error) return dbe(error);
    return ok(((data ?? []) as Record<string, unknown>[]).map(mapDocument));
  } catch (e) { return er(e); }
}

export async function getDocument(client: TypedSupabaseClient, orgId: string, id: string): Promise<Result<ResearchDocument | null>> {
  try {
    const { data, error } = await client.from('research_documents')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error) return dbe(error);
    return ok(data ? mapDocument(data as Record<string, unknown>) : null);
  } catch (e) { return er(e); }
}

export async function createDocument(client: TypedSupabaseClient, input: {
  orgId: string;
  projectId?: string | null;
  title: string;
  abstract?: string | null;
  sourceType: DocumentSourceType;
  sourceUrl?: string | null;
  documentType?: string;
  category: DocumentCategory;
  tags?: string[];
  authors?: string[];
  publicationYear?: number | null;
  publisher?: string | null;
  doi?: string | null;
  isbn?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from('research_documents').insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      title: input.title,
      abstract: input.abstract ?? null,
      source_type: input.sourceType,
      source_url: input.sourceUrl ?? null,
      document_type: input.documentType ?? 'pdf',
      category: input.category,
      tags: input.tags ?? [],
      authors: input.authors ?? [],
      publication_year: input.publicationYear ?? null,
      publisher: input.publisher ?? null,
      doi: input.doi ?? null,
      isbn: input.isbn ?? null,
      file_path: input.filePath ?? null,
      file_size: input.fileSize ?? null,
      mime_type: input.mimeType ?? null,
    }).select('id').single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

export async function updateDocument(client: TypedSupabaseClient, orgId: string, id: string, patch: Partial<ResearchDocument>): Promise<Result<{ ok: true }>> {
  try {
    const dbPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.abstract !== undefined) dbPatch.abstract = patch.abstract;
    if (patch.sourceType !== undefined) dbPatch.source_type = patch.sourceType;
    if (patch.sourceUrl !== undefined) dbPatch.source_url = patch.sourceUrl;
    if (patch.documentType !== undefined) dbPatch.document_type = patch.documentType;
    if (patch.category !== undefined) dbPatch.category = patch.category;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    if (patch.authors !== undefined) dbPatch.authors = patch.authors;
    if (patch.publicationYear !== undefined) dbPatch.publication_year = patch.publicationYear;
    if (patch.publisher !== undefined) dbPatch.publisher = patch.publisher;
    if (patch.doi !== undefined) dbPatch.doi = patch.doi;
    if (patch.isbn !== undefined) dbPatch.isbn = patch.isbn;
    if (patch.filePath !== undefined) dbPatch.file_path = patch.filePath;
    if (patch.fileSize !== undefined) dbPatch.file_size = patch.fileSize;
    if (patch.mimeType !== undefined) dbPatch.mime_type = patch.mimeType;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.relevanceScore !== undefined) dbPatch.relevance_score = patch.relevanceScore;

    const { error } = await client.from('research_documents').update(dbPatch as never).eq('id', id).eq('org_id', orgId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

export async function deleteDocument(client: TypedSupabaseClient, orgId: string, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from('research_documents').delete().eq('id', id).eq('org_id', orgId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// ── Collections ────────────────────────────────────────────────────────────

export async function listCollections(client: TypedSupabaseClient, orgId: string): Promise<Result<ResearchCollection[]>> {
  try {
    const { data, error } = await client.from('research_collections')
      .select('*')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Record<string, unknown>[]).map(mapCollection));
  } catch (e) { return er(e); }
}

export async function getCollection(client: TypedSupabaseClient, orgId: string, id: string): Promise<Result<ResearchCollection | null>> {
  try {
    const { data, error } = await client.from('research_collections')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error) return dbe(error);
    return ok(data ? mapCollection(data as Record<string, unknown>) : null);
  } catch (e) { return er(e); }
}

export async function createCollection(client: TypedSupabaseClient, input: { orgId: string; name: string; description?: string | null; isPublic?: boolean }): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client.from('research_collections').insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      is_public: input.isPublic ?? false,
    }).select('id').single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

export async function updateCollection(client: TypedSupabaseClient, orgId: string, id: string, patch: Partial<ResearchCollection>): Promise<Result<{ ok: true }>> {
  try {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.isPublic !== undefined) dbPatch.is_public = patch.isPublic;
    if (patch.coverImagePath !== undefined) dbPatch.cover_image_path = patch.coverImagePath;

    const { error } = await client.from('research_collections').update(dbPatch as never).eq('id', id).eq('org_id', orgId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

export async function deleteCollection(client: TypedSupabaseClient, orgId: string, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from('research_collections').delete().eq('id', id).eq('org_id', orgId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

export async function addDocumentToCollection(client: TypedSupabaseClient, collectionId: string, documentId: string, notes?: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from('collection_documents').insert({
      collection_id: collectionId,
      document_id: documentId,
      notes: notes ?? null,
    });
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

export async function removeDocumentFromCollection(client: TypedSupabaseClient, collectionId: string, documentId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from('collection_documents').delete()
      .eq('collection_id', collectionId).eq('document_id', documentId);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

export async function listCollectionDocuments(client: TypedSupabaseClient, collectionId: string): Promise<Result<CollectionDocument[]>> {
  try {
    const { data, error } = await client.from('collection_documents')
      .select('collection_id, document_id, added_by, added_at, notes, sort_order')
      .eq('collection_id', collectionId)
      .order('sort_order', { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Record<string, unknown>[]).map(r => ({
      collectionId: String(r.collection_id),
      documentId: String(r.document_id),
      addedBy: r.added_by == null ? null : String(r.added_by),
      addedAt: String(r.added_at ?? ''),
      notes: r.notes == null ? null : String(r.notes),
      sortOrder: Number(r.sort_order ?? 0),
    })));
  } catch (e) { return er(e); }
}

// ── Search Helpers ────────────────────────────────────────────────────────

export interface SearchFilters {
  category?: string;
  sourceType?: string;
  status?: string;
  tags?: string[];
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function searchDocuments(client: TypedSupabaseClient, orgId: string, query: string, filters?: SearchFilters, limit = 20): Promise<Result<ResearchDocument[]>> {
  try {
    let q = client.from('research_documents')
      .select('*')
      .eq('org_id', orgId)
      .textSearch('search_vector', query, { type: 'websearch' })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (filters?.category) q = q.eq('category', filters.category);
    if (filters?.sourceType) q = q.eq('source_type', filters.sourceType);
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.tags && filters.tags.length > 0) q = q.overlaps('tags', filters.tags);
    if (filters?.projectId) q = q.eq('project_id', filters.projectId);
    if (filters?.dateFrom) q = q.gte('created_at', filters.dateFrom);
    if (filters?.dateTo) q = q.lte('created_at', filters.dateTo);

    const { data, error } = await q;
    if (error) return dbe(error);
    return ok(((data ?? []) as Record<string, unknown>[]).map(mapDocument));
  } catch (e) { return er(e); }
}

// Pure: filter labels for UI
export const SOURCE_TYPE_LABELS: Record<DocumentSourceType, string> = {
  is_code: 'IS Code',
  astm_standard: 'ASTM Standard',
  research_paper: 'Research Paper',
  material_datasheet: 'Material Datasheet',
  method_statement: 'Method Statement',
  case_study: 'Case Study',
  technical_note: 'Technical Note',
  regulation: 'Regulation',
  other: 'Other',
};

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  concrete: 'Concrete',
  steel: 'Steel',
  geotech: 'Geotechnical',
  structural: 'Structural',
  materials: 'Materials',
  sustainability: 'Sustainability',
  bim: 'BIM / Digital',
  safety: 'Safety',
  cost: 'Cost Estimation',
  other: 'Other',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  reviewed: 'Reviewed',
  approved: 'Approved',
  archived: 'Archived',
};

export const STATUS_TONES: Record<DocumentStatus, 'info' | 'success' | 'warning' | 'neutral'> = {
  draft: 'neutral',
  reviewed: 'info',
  approved: 'success',
  archived: 'warning',
};