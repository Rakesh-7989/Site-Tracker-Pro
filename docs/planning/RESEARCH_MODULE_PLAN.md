# SiteTrack Pro — Research Module Deep Dive & Plan

## Executive Summary
Build a unified **Research Module** combining:
1. **Technical Research Library** — searchable repository of construction literature (IS codes, ASTM standards, research papers, material datasheets, method statements)
2. **R&D Project Tracker** — manage internal research projects with phases, experiments, prototypes, budgets, deliverables
3. **AI-Assisted Intelligence** — semantic search, auto-summarization, cross-referencing with project data

---

## 1. Technical Research Library

### Data Model
```
research_documents
  id, org_id, project_id (nullable), title, abstract, source_type, source_url
  document_type: 'is_code' | 'astm_standard' | 'research_paper' | 'material_datasheet' | 'method_statement' | 'case_study' | 'technical_note' | 'regulation'
  category: 'concrete' | 'steel' | 'geotech' | 'structural' | 'materials' | 'sustainability' | 'bim' | 'safety' | 'cost' | 'other'
  tags: text[] (searchable)
  authors, publication_year, publisher, doi, isbn
  file_path (storage bucket), file_size, mime_type
  status: 'draft' | 'reviewed' | 'approved' | 'archived'
  relevance_score (AI), embedding_vector (pgvector)
  created_by, created_at, updated_at

research_collections
  id, org_id, name, description, is_public, created_by, created_at

collection_documents
  collection_id, document_id, added_by, added_at, notes
```

### Features
- **Full-text + semantic search** (pgvector embeddings + tsvector)
- **Filter by**: type, category, tags, year, author, project
- **Collections** — curated sets (e.g., "M30 Concrete Mix Designs", "Seismic Design IS 1893")
- **Version control** — track document revisions
- **Annotations** — highlights, notes, cross-references
- **Project linking** — attach docs to projects for contextual access

---

## 2. R&D Project Tracker

### Data Model
```
research_projects
  id, org_id, code, title, description, hypothesis
  project_type: 'material_development' | 'method_innovation' | 'process_optimization' | 'sustainability' | 'digital_tool' | 'feasibility_study'
  status: 'proposal' | 'approved' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  budget_allocated, budget_spent
  start_date, target_end_date, actual_end_date
  lead_researcher_id, team_members (profile_ids[])
  tags, created_at, updated_at

research_phases
  id, research_project_id, phase_number, name, description
  status: 'planned' | 'active' | 'completed' | 'blocked'
  start_date, end_date, deliverables (text[]), success_criteria
  budget_allocated, budget_spent

research_experiments
  id, research_project_id, phase_id, code, title, description
  experiment_type: 'lab_test' | 'field_trial' | 'simulation' | 'prototype' | 'literature_review'
  status: 'planned' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  methodology, materials_used, equipment, parameters (jsonb)
  results_summary, conclusions, next_steps
  started_at, completed_at, conducted_by

research_deliverables
  id, research_project_id, phase_id, name, type
  type: 'report' | 'prototype' | 'specification' | 'standard' | 'tool' | 'dataset' | 'publication' | 'patent'
  status: 'draft' | 'in_review' | 'approved' | 'published'
  file_path, version, reviewers (profile_ids[]), approved_at
  linked_document_id (research_documents)
```

### Features
- **Phase-gate workflow** — approvals between phases
- **Experiment tracking** — parameters, results, iterations
- **Budget tracking** — allocated vs spent per phase
- **Team collaboration** — assignments, comments, reviews
- **Integration** — link to project financials, procurement, documents

---

## 3. AI-Assisted Intelligence

### Capabilities
1. **Semantic Search** — pgvector embeddings for research_documents, natural language queries
2. **Auto-Summarization** — LLM-generated abstracts for papers, experiment reports
3. **Cross-Reference** — auto-link standards to projects (e.g., "IS 456" mentioned in project → link to IS 456 doc)
4. **Gap Analysis** — "What standards apply to this project type that we don't have in library?"
5. **Trend Detection** — emerging materials/methods from paper corpus
6. **Research-to-Project Bridge** — auto-suggest relevant research for active projects

### Implementation
- **Embeddings**: `text-embedding-3-small` (OpenAI) or `bge-small-en` (local) stored in `embedding_vector vector(1536)`
- **Search**: Hybrid (tsvector + cosine similarity) with RRF fusion
- **Summarization**: `gpt-4o-mini` / `claude-3-haiku` via existing `fetchLLMInsight`
- **Scheduled**: Nightly embedding generation for new docs

---

## 4. Database Migrations

### Migration 180: Research Core Tables
- `research_documents`, `research_collections`, `collection_documents`
- RLS: org-scoped, project-scoped where applicable
- Indexes: GIN on tags, tsvector, vector on embedding_vector

### Migration 181: R&D Project Tables
- `research_projects`, `research_phases`, `research_experiments`, `research_deliverables`
- RLS: org-scoped, manager write gates
- Triggers: auto-update timestamps, budget rollups

### Migration 182: Vector Search Setup
- `pgvector` extension, `embedding_vector` column, HNSW index
- `search_research_documents` RPC (hybrid search)

---

## 5. Query Layer
```
src/app/queries/researchQueries.ts
  - listDocuments, getDocument, createDocument, updateDocument, deleteDocument
  - searchDocuments(query, filters) — hybrid search
  - listCollections, createCollection, addToCollection
  - listResearchProjects, getResearchProject, createResearchProject
  - listPhases, createPhase, updatePhase
  - listExperiments, createExperiment, updateExperiment
  - listDeliverables, createDeliverable
  - autoSummarizeDocument, embedDocument
```

---

## 6. UI Components

### Research Library (`/research/library`)
- **Document Grid/List** — searchable, filterable, sortable
- **Document Viewer** — PDF viewer, metadata sidebar, annotations
- **Collections Panel** — drag-drop to organize
- **Upload Modal** — drag-drop, auto-extract metadata (title, authors, year)

### R&D Projects (`/research/projects`)
- **Project List** — kanban by status, filter by type/priority
- **Project Detail** — phases, experiments, deliverables, budget, team
- **Phase View** — experiments list, gate approvals
- **Experiment Log** — parameters, results, iterations

### Research Hub (`/research`)
- **Dashboard** — stats, recent activity, AI suggestions
- **AI Search** — natural language query bar
- **Gap Analysis** — missing standards for active projects

---

## 6. Navigation & Gating

### Tabs (Project-level)
- `research` tab — project-specific research docs + linked R&D projects

### Org Routes
- `/research` — hub (dashboard + AI search)
- `/research/library` — document library
- `/research/projects` — R&D project list
- `/research/projects/:id` — R&D project detail
- `/research/collections/:id` — collection view

### Capabilities
- `research:view` — read access
- `research:manage` — create/edit documents, collections, R&D projects
- `research:approve` — approve phases/deliverables
- `research:admin` — manage embeddings, AI config

### Plan Features
- `research_library` (Pro+) — document storage, search
- `research_rd` (Business+) — R&D project tracking
- `research_ai` (Business+) — AI search, summarization

---

## 7. Implementation Phases

| Phase | Scope | Deliverables |
|-------|-------|--------------|
| **1** | Core Library | Migration 180, documents/collections CRUD, basic search, upload |
| **2** | R&D Tracker | Migration 181, projects/phases/experiments/deliverables CRUD |
| **3** | Vector Search | Migration 182, pgvector, hybrid search RPC, embeddings job |
| **4** | AI Features | Summarization, gap analysis, cross-referencing, AI search UI |
| **5** | Polish | Collections, annotations, versioning, export, mobile |

---

## 8. Integration Points

| System | Integration |
|--------|-------------|
| Projects | Link research docs to projects; suggest relevant docs on project detail |
| Finance | R&D project budgets → org financial rollup |
| Procurement | Experiment materials → material requests |
| Documents | Research docs in handover packets |
| AI | Reuse `fetchLLMInsight`, `aiForecast` patterns; new `researchAI` module |
| Notifications | Phase gate approvals, experiment completions, new relevant papers |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| pgvector not available on Supabase | Use Supabase `pgvector` extension (supported); fallback to pure tsvector |
| Embedding costs | Batch nightly; cache embeddings; use small model (384-dim) |
| Document storage | Supabase Storage bucket `research-docs` (private, 50MB/file) |
| Search performance | HNSW index on embeddings; limit results to 50; pagination |
| Data migration | Provide CSV import for existing libraries |

---

## 10. Success Metrics

- **Adoption**: % projects with ≥1 linked research doc
- **Search utility**: AI search sessions/week, click-through rate
- **R&D velocity**: Phase cycle time, experiment iteration count
- **Knowledge reuse**: Document views per project, cross-project references
- **AI accuracy**: Summarization quality ratings, gap analysis relevance

---

## 11. Next Steps
1. Approve scope → create Migration 180 (Research Core)
2. Implement Phase 1 (Library + basic search)
2. Add to nav-config, tabs-config, plugin catalog
3. Smoke test + e2e-mock
4. Deploy → Phase 2