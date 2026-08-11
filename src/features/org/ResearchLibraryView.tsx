// SiteTrack Pro — Research Library (Research module, Phase 1, /research).
//
// Org-wide technical literature repository: documents (IS codes, ASTM
// standards, papers, datasheets, method statements) with search + filters,
// plus curated collections.
//
// Gates: plan `research_library` (Pro+) via <PlanGate>, capability
// `research:view` via <AccessDenied>, module `research` via the plugin route
// <ModuleGuard>. Write actions (create/edit document, collections, add/remove
// docs) additionally gated by `research:manage`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClient } from "@/lib/supabase";
import { PlanGate, useOrgSwitcher, useCan } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Spinner, Alert, AccessDenied, Badge } from "@/components/ui/atoms";
import { Select, Input, Textarea, FormField } from "@/components/ui/forms";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import {
  listDocuments, createDocument, updateDocument, deleteDocument,
  listCollections, createCollection, deleteCollection,
  addDocumentToCollection, removeDocumentFromCollection, listCollectionDocuments,
  SOURCE_TYPE_LABELS, CATEGORY_LABELS, STATUS_LABELS, STATUS_TONES,
  type ResearchDocument, type DocumentSourceType, type DocumentCategory, type DocumentStatus,
  type ResearchCollection, type CollectionDocument,
} from "@/app/researchQueries";
import { useT } from "@/i18n/I18nProvider";

const SOURCE_TYPES = Object.keys(SOURCE_TYPE_LABELS) as DocumentSourceType[];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];
const STATUSES = Object.keys(STATUS_LABELS) as DocumentStatus[];

export function ResearchLibraryView(): JSX.Element {
  return <PlanGate feature="research_library"><ResearchInner /></PlanGate>;
}

function ResearchInner(): JSX.Element {
  const t = useT();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("research:view", { orgId: activeOrg?.orgId });
  if (!canView) return <AccessDenied message={t("research.denied")} />;
  if (!activeOrg) return <Alert variant="warning">{t("research.selectOrg")}</Alert>;
  return <Library orgId={activeOrg.orgId} />;
}

interface DocInput {
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
}

function Library({ orgId }: { orgId: string }): JSX.Element {
  const t = useT();
  const canManage = useCan("research:manage", { orgId });
  const [docs, setDocs] = useState<ResearchDocument[]>([]);
  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [collectionDocs, setCollectionDocs] = useState<Record<string, CollectionDocument[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ResearchDocument | null>(null);
  const [creatingColl, setCreatingColl] = useState(false);
  const [collName, setCollName] = useState("");
  const [collDesc, setCollDesc] = useState("");
  const [activeColl, setActiveColl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError(t("research.backendError")); setLoading(false); return; }
    const [d, c] = await Promise.all([listDocuments(client, orgId), listCollections(client, orgId)]);
    if (!d.ok) { setError(d.error); setLoading(false); return; }
    if (!c.ok) { setError(c.error); setLoading(false); return; }
    setDocs(d.data); setCollections(c.data);
    const map: Record<string, CollectionDocument[]> = {};
    for (const col of c.data) {
      const r = await listCollectionDocuments(client, col.id);
      if (r.ok) map[col.id] = r.data;
    }
    setCollectionDocs(map);
    setLoading(false);
  }, [orgId, t]);
  useEffect(() => { void reload(); }, [reload]);

  const { run } = useAction(reload, setError);

  const shown = useMemo(() => {
    let rows = docs;
    if (category !== "all") rows = rows.filter(d => d.category === category);
    if (sourceFilter !== "all") rows = rows.filter(d => d.sourceType === sourceFilter);
    if (statusFilter !== "all") rows = rows.filter(d => d.status === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.abstract ?? "").toLowerCase().includes(q) ||
        d.tags.some(tag => tag.toLowerCase().includes(q)) ||
        d.authors.some(a => a.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [docs, query, category, sourceFilter, statusFilter]);

  const stats = useMemo(() => {
    const byStatus: Record<DocumentStatus, number> = { draft: 0, reviewed: 0, approved: 0, archived: 0 };
    for (const d of docs) byStatus[d.status]++;
    return { total: docs.length, approved: byStatus.approved, reviewed: byStatus.reviewed, draft: byStatus.draft, collections: collections.length };
  }, [docs, collections]);

  const handleCreate = async (input: DocInput) => {
    const client = await getClient(); if (!client) return;
    let done = false;
    await run("create", async c => { const r = await createDocument(c, { orgId, ...input }); done = r.ok; return r; });
    if (done) setCreating(false);
  };

  const handleUpdate = async (doc: ResearchDocument, input: DocInput) => {
    const client = await getClient(); if (!client) return;
    await run("update", c => updateDocument(c, orgId, doc.id, input));
    setEditing(null);
  };

  const handleDelete = async (doc: ResearchDocument) => {
    const client = await getClient(); if (!client) return;
    await run("delete", c => deleteDocument(c, orgId, doc.id));
  };

  const handleSetStatus = async (doc: ResearchDocument, status: DocumentStatus) => {
    const client = await getClient(); if (!client) return;
    await run("status", c => updateDocument(c, orgId, doc.id, { status }));
  };

  const handleCreateColl = async () => {
    if (!collName.trim()) return;
    const client = await getClient(); if (!client) return;
    await run("coll-create", c => createCollection(c, { orgId, name: collName.trim(), description: collDesc.trim() || null }));
    setCollName(""); setCollDesc(""); setCreatingColl(false);
  };

  const handleDeleteColl = async (col: ResearchCollection) => {
    const client = await getClient(); if (!client) return;
    await run("coll-delete", c => deleteCollection(c, orgId, col.id));
    if (activeColl === col.id) setActiveColl(null);
  };

  const toggleDocInCollection = async (colId: string, doc: ResearchDocument, present: boolean) => {
    const client = await getClient(); if (!client) return;
    if (present) await run("coll-remove", c => removeDocumentFromCollection(c, colId, doc.id));
    else await run("coll-add", c => addDocumentToCollection(c, colId, doc.id));
  };

  const columns = [
    {
      key: "doc", header: t("research.colDoc"), className: "flex-1 min-w-0",
      render: (d: ResearchDocument) => (
        <div>
          <div className="text-sm font-semibold text-fg-primary truncate">{d.title}</div>
          <div className="text-[11px] text-fg-tertiary truncate">
            {SOURCE_TYPE_LABELS[d.sourceType]}{d.publicationYear ? ` · ${d.publicationYear}` : ""}{d.authors.length ? ` · ${d.authors.join(", ")}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "category", header: t("research.colCategory"), hideOnMobile: true, className: "flex-shrink-0",
      render: (d: ResearchDocument) => <span className="text-xs text-fg-secondary">{CATEGORY_LABELS[d.category]}</span>,
    },
    {
      key: "tags", header: t("research.colTags"), hideOnMobile: true, className: "flex-shrink-0 max-w-56",
      render: (d: ResearchDocument) => (
        <div className="flex flex-wrap gap-1">
          {d.tags.slice(0, 3).map(tag => <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-elevated text-fg-secondary">{tag}</span>)}
        </div>
      ),
    },
    {
      key: "status", header: t("research.colStatus"), className: "flex-shrink-0",
      render: (d: ResearchDocument) => <Badge tone={STATUS_TONES[d.status]}>{STATUS_LABELS[d.status]}</Badge>,
    },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— {t("research.eyebrow")}</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">{t("research.title")}</h1>
            <p className="text-fg-secondary text-sm mt-2">{t("research.subtitle")}</p>
          </div>
          {canManage && <Button onClick={() => setCreating(true)}>{t("research.newDocument")}</Button>}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("research.statDocuments")}</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{stats.total}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("research.statApproved")}</div><div className="font-display text-2xl font-bold text-success mt-1">{stats.approved}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("research.statReviewed")}</div><div className="font-display text-2xl font-bold text-info mt-1">{stats.reviewed}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("research.statDraft")}</div><div className="font-display text-2xl font-bold text-warning mt-1">{stats.draft}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("research.statCollections")}</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{stats.collections}</div></Card>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-[280px_1fr] gap-6">
        <Card className="p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">{t("research.collectionsTitle")}</div>
            {canManage && <button onClick={() => setCreatingColl(true)} className="text-xs text-accent">+ {t("research.addCollection")}</button>}
          </div>
          {collections.length === 0 ? (
            <div className="text-xs text-fg-tertiary py-4">{t("research.noCollections")}</div>
          ) : (
            <div className="space-y-2">
              {collections.map(col => {
                const count = collectionDocs[col.id]?.length ?? 0;
                const open = activeColl === col.id;
                const present = new Set((collectionDocs[col.id] ?? []).map(cd => cd.documentId));
                return (
                  <div key={col.id} className="rounded-lg bg-elevated px-3 py-2">
                    <button onClick={() => setActiveColl(open ? null : col.id)} className="w-full text-left flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-fg-primary truncate">{col.name}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-panel text-fg-tertiary">{count}</span>
                    </button>
                    {open && (
                      <div className="mt-2 space-y-1.5">
                        {col.description ? <div className="text-[11px] text-fg-tertiary">{col.description}</div> : null}
                        <div className="text-[11px] text-fg-tertiary truncate">{col.updatedAt ? new Date(col.updatedAt).toLocaleDateString() : ""}</div>
                        <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto">
                          {docs.slice(0, 8).map(d => (
                            <button
                              key={d.id}
                              disabled={!canManage}
                              onClick={() => void toggleDocInCollection(col.id, d, present.has(d.id))}
                              className={`text-[10px] truncate rounded-md px-1.5 py-1 text-left ${present.has(d.id) ? "bg-success-tint text-success" : "bg-panel text-fg-secondary"}`}
                              title={d.title}
                            >{present.has(d.id) ? "✓ " : ""}{d.title}</button>
                          ))}
                        </div>
                        {canManage && (
                          <Button size="sm" variant="ghost" className="mt-1" onClick={() => void handleDeleteColl(col)}>{t("research.deleteCollection")}</Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 mb-4">
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("research.searchPlaceholder")} className="flex-1 min-w-40" />
            <Select className="w-40" value={category} onChange={e => setCategory(e.target.value)}
              options={[{ value: "all", label: t("research.filterAllCategories") }, ...CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c] }))]} />
            <Select className="w-40" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              options={[{ value: "all", label: t("research.filterAllSources") }, ...SOURCE_TYPES.map(s => ({ value: s, label: SOURCE_TYPE_LABELS[s] }))]} />
            <Select className="w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              options={[{ value: "all", label: t("research.filterAllStatuses") }, ...STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))]} />
          </div>

          {loading ? (
            <div className="grid place-items-center py-16"><Spinner size={22} /></div>
          ) : (
            <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-border">
              <DataTable
                columns={columns}
                rows={shown}
                rowKey={d => d.id}
                variant="card"
                emptyMessage={t("research.emptyDocuments")}
                onRowClick={d => setEditing(d)}
              />
            </div>
          )}
        </div>
      </div>

      {creating && <DocumentModal onClose={() => setCreating(false)} onSave={handleCreate} t={t} />}

      {editing && (
        <DocumentModal
          doc={editing}
          onClose={() => setEditing(null)}
          onSave={i => void handleUpdate(editing, i)}
          t={t}
        />
      )}

      {canManage && editing && (
        <div className="flex items-center gap-2 mt-4 justify-end">
          <Select className="w-40" value={editing.status} onChange={e => void handleSetStatus(editing, e.target.value as DocumentStatus)}
            options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))} />
          <Button size="sm" variant="ghost" onClick={() => void handleDelete(editing)}>{t("research.deleteDocument")}</Button>
        </div>
      )}

      {creatingColl && (
        <Modal open onClose={() => setCreatingColl(false)} title={t("research.newCollectionTitle")}>
          <div className="space-y-3">
            <FormField label={t("research.fieldName")} htmlFor="coll-name"><Input value={collName} onChange={e => setCollName(e.target.value)} placeholder={t("research.collNamePlaceholder")} /></FormField>
            <FormField label={t("research.fieldDescription")} htmlFor="coll-desc"><Textarea value={collDesc} onChange={e => setCollDesc(e.target.value)} rows={2} /></FormField>
            <Button className="w-full" onClick={() => void handleCreateColl()} disabled={!collName.trim()}>{t("research.saveCollection")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DocumentModal({ doc, onClose, onSave, t }: {
  doc?: ResearchDocument;
  onClose: () => void;
  onSave: (i: DocInput) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}): JSX.Element {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [abstract, setAbstract] = useState(doc?.abstract ?? "");
  const [sourceType, setSourceType] = useState<DocumentSourceType>(doc?.sourceType ?? "technical_note");
  const [sourceUrl, setSourceUrl] = useState(doc?.sourceUrl ?? "");
  const [category, setCategory] = useState<DocumentCategory>(doc?.category ?? "structural");
  const [tags, setTags] = useState(doc?.tags.join(", ") ?? "");
  const [authors, setAuthors] = useState(doc?.authors.join(", ") ?? "");
  const [year, setYear] = useState(doc?.publicationYear ? String(doc.publicationYear) : "");
  const [publisher, setPublisher] = useState(doc?.publisher ?? "");
  const [doi, setDoi] = useState(doc?.doi ?? "");
  const [isbn, setIsbn] = useState(doc?.isbn ?? "");

  const save = () => {
    if (!title.trim()) return;
    const y = year.trim() ? Number(year) : null;
    onSave({
      title: title.trim(),
      abstract: abstract.trim() || null,
      sourceType,
      sourceUrl: sourceUrl.trim() || null,
      documentType: "pdf",
      category,
      tags: tags.split(",").map(x => x.trim()).filter(Boolean),
      authors: authors.split(",").map(x => x.trim()).filter(Boolean),
      publicationYear: y != null && Number.isFinite(y) ? y : null,
      publisher: publisher.trim() || null,
      doi: doi.trim() || null,
      isbn: isbn.trim() || null,
    });
  };

  return (
    <Modal open onClose={onClose} title={doc ? t("research.editDocumentTitle") : t("research.newDocumentTitle")}>
      <div className="space-y-3">
        <FormField label={t("research.fieldTitle")} htmlFor="doc-title"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("research.titlePlaceholder")} /></FormField>
        <FormField label={t("research.fieldAbstract")} htmlFor="doc-abstract"><Textarea value={abstract} onChange={e => setAbstract(e.target.value)} rows={2} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("research.fieldSourceType")} htmlFor="doc-source"><Select value={sourceType} onChange={e => setSourceType(e.target.value as DocumentSourceType)} options={SOURCE_TYPES.map(s => ({ value: s, label: SOURCE_TYPE_LABELS[s] }))} /></FormField>
          <FormField label={t("research.fieldCategory")} htmlFor="doc-category"><Select value={category} onChange={e => setCategory(e.target.value as DocumentCategory)} options={CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c] }))} /></FormField>
        </div>
        <FormField label={t("research.fieldSourceUrl")} htmlFor="doc-url"><Input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("research.fieldTags")} htmlFor="doc-tags"><Input value={tags} onChange={e => setTags(e.target.value)} placeholder={t("research.tagsPlaceholder")} /></FormField>
          <FormField label={t("research.fieldAuthors")} htmlFor="doc-authors"><Input value={authors} onChange={e => setAuthors(e.target.value)} placeholder="A, B" /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("research.fieldYear")} htmlFor="doc-year"><Input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-28" /></FormField>
          <FormField label={t("research.fieldPublisher")} htmlFor="doc-publisher"><Input value={publisher} onChange={e => setPublisher(e.target.value)} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="DOI" htmlFor="doc-doi"><Input value={doi} onChange={e => setDoi(e.target.value)} /></FormField>
          <FormField label="ISBN" htmlFor="doc-isbn"><Input value={isbn} onChange={e => setIsbn(e.target.value)} /></FormField>
        </div>
        <Button className="w-full" onClick={save} disabled={!title.trim()}>{t("research.saveDocument")}</Button>
      </div>
    </Modal>
  );
}