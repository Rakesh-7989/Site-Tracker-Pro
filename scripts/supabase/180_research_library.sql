-- SiteTrack Pro — V6 Phase Research: Research Core Library.
-- Searchable repository of construction literature (IS codes, ASTM standards,
-- research papers, material datasheets, method statements, case studies).
-- Run AFTER 179_project_financial_depth.sql. Idempotent.

BEGIN;

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. research_documents — core literature repository
CREATE TABLE IF NOT EXISTS public.research_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  abstract text,
  source_type text NOT NULL CHECK (source_type IN ('is_code', 'astm_standard', 'research_paper', 'material_datasheet', 'method_statement', 'case_study', 'technical_note', 'regulation', 'other')),
  source_url text,
  document_type text NOT NULL CHECK (document_type IN ('pdf', 'docx', 'txt', 'md', 'url', 'other')),
  category text NOT NULL CHECK (category IN ('concrete', 'steel', 'geotech', 'structural', 'materials', 'sustainability', 'bim', 'safety', 'cost', 'other')),
  tags text[] DEFAULT '{}',
  authors text[],
  publication_year int,
  publisher text,
  doi text,
  isbn text,
  file_path text,                    -- storage bucket path
  file_size bigint,
  mime_type text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'archived')),
  relevance_score numeric(3,2),      -- AI relevance 0-1
  embedding_vector vector(384),      -- pgvector for semantic search
  search_vector tsvector,            -- tsvector for full-text search
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_docs_org ON public.research_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_research_docs_project ON public.research_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_research_docs_category ON public.research_documents(category);
CREATE INDEX IF NOT EXISTS idx_research_docs_source_type ON public.research_documents(source_type);
CREATE INDEX IF NOT EXISTS idx_research_docs_tags ON public.research_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_research_docs_search ON public.research_documents USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_research_docs_embedding ON public.research_documents USING hnsw (embedding_vector vector_cosine_ops) WHERE embedding_vector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_docs_status ON public.research_documents(status);

-- 2. research_collections — curated sets of documents
CREATE TABLE IF NOT EXISTS public.research_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_public boolean DEFAULT false,
  cover_image_path text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_collections_org ON public.research_collections(org_id);

-- 3. collection_documents — many-to-many with notes
CREATE TABLE IF NOT EXISTS public.collection_documents (
  collection_id uuid NOT NULL REFERENCES public.research_collections(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.research_documents(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  sort_order int DEFAULT 0,
  PRIMARY KEY (collection_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_docs_collection ON public.collection_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_docs_document ON public.collection_documents(document_id);

-- 4. RLS Policies
ALTER TABLE public.research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_documents ENABLE ROW LEVEL SECURITY;

-- research_documents: org members can read; managers can write
DROP POLICY IF EXISTS research_docs_read ON public.research_documents;
CREATE POLICY research_docs_read ON public.research_documents FOR SELECT
  USING (
    org_id = ANY(public.user_org_ids())
  );

DROP POLICY IF EXISTS research_docs_write ON public.research_documents;
CREATE POLICY research_docs_write ON public.research_documents FOR INSERT
  WITH CHECK (
    org_id = ANY(public.user_org_ids())
    AND public.is_orgadmin()
  );

DROP POLICY IF EXISTS research_docs_update ON public.research_documents;
CREATE POLICY research_docs_update ON public.research_documents FOR UPDATE
  USING (
    org_id = ANY(public.user_org_ids())
    AND public.is_orgadmin()
  )
  WITH CHECK (
    org_id = ANY(public.user_org_ids())
    AND public.is_orgadmin()
  );

DROP POLICY IF EXISTS research_docs_delete ON public.research_documents;
CREATE POLICY research_docs_delete ON public.research_documents FOR DELETE
  USING (
    org_id = ANY(public.user_org_ids())
    AND public.is_orgadmin()
  );

-- research_collections
DROP POLICY IF EXISTS research_collections_read ON public.research_collections;
CREATE POLICY research_collections_read ON public.research_collections FOR SELECT
  USING (org_id = ANY(public.user_org_ids()));

DROP POLICY IF EXISTS research_collections_write ON public.research_collections;
CREATE POLICY research_collections_write ON public.research_collections FOR INSERT
  WITH CHECK (
    org_id = ANY(public.user_org_ids())
    AND public.is_orgadmin()
  );

DROP POLICY IF EXISTS research_collections_update ON public.research_collections;
CREATE POLICY research_collections_update ON public.research_collections FOR UPDATE
  USING (
    org_id = ANY(public.user_org_ids())
    AND public.is_orgadmin()
  )
  WITH CHECK (
    org_id = ANY(public.user_org_ids())
    AND public.is_orgadmin()
  );

-- collection_documents
DROP POLICY IF EXISTS collection_docs_read ON public.collection_documents;
CREATE POLICY collection_docs_read ON public.collection_documents FOR SELECT
  USING (
    collection_id IN (SELECT id FROM public.research_collections WHERE org_id = ANY(public.user_org_ids()))
  );

DROP POLICY IF EXISTS collection_docs_write ON public.collection_documents;
CREATE POLICY collection_docs_write ON public.collection_documents FOR INSERT
  WITH CHECK (
    collection_id IN (SELECT id FROM public.research_collections WHERE org_id = ANY(public.user_org_ids()) AND public.is_orgadmin())
  );

DROP POLICY IF EXISTS collection_docs_delete ON public.collection_documents;
CREATE POLICY collection_docs_delete ON public.collection_documents FOR DELETE
  USING (
    collection_id IN (SELECT id FROM public.research_collections WHERE org_id = ANY(public.user_org_ids()) AND public.is_orgadmin())
  );

-- 5. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_collections TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.collection_documents TO authenticated;
REVOKE ALL ON public.research_documents FROM anon;
REVOKE ALL ON public.research_collections FROM anon;
REVOKE ALL ON public.collection_documents FROM anon;

-- 6. Helper: auto-update search_vector and updated_at
CREATE OR REPLACE FUNCTION public.update_research_document_search()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.abstract, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.authors, ' '), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.source_type, '')), 'D');
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_research_doc_search ON public.research_documents;
CREATE TRIGGER trigger_research_doc_search
BEFORE INSERT OR UPDATE ON public.research_documents
FOR EACH ROW EXECUTE FUNCTION public.update_research_document_search();

-- Backfill search_vector for existing rows
UPDATE public.research_documents SET search_vector = (
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(abstract, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(authors, ' '), '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(source_type, '')), 'D')
);

-- 7. Collection updated_at trigger
CREATE OR REPLACE FUNCTION public.update_collection_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_collection_updated ON public.research_collections;
CREATE TRIGGER trigger_collection_updated
BEFORE UPDATE ON public.research_collections
FOR EACH ROW EXECUTE FUNCTION public.update_collection_timestamp();

-- 8. Storage bucket for research documents
-- Note: bucket creation via Supabase dashboard or separate script
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('research-docs', 'research-docs', false, 52428800, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown']);

-- 9. Vector search helper (requires pgvector extension)

-- ALTER TABLE public.research_documents ALTER COLUMN embedding_vector TYPE vector(384) USING embedding_vector::vector(384);

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.research_documents;
  RAISE NOTICE '180_research_library: ready. % documents currently.', n;
END $$;

COMMIT;