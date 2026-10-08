import {
  customType,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import type { BBox } from "@patent/shared";

const vector768 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .filter((part) => part.length > 0)
      .map(Number);
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("organization_members_org_user").on(table.organizationId, table.userId)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    title: text("title"),
    abstractText: text("abstract_text"),
    originalFilename: text("original_filename").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    pageCount: integer("page_count"),
    status: text("status").notNull(),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("documents_project_idx").on(table.projectId)],
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    width: doublePrecision("width"),
    height: doublePrecision("height"),
    text: text("text").notNull().default(""),
    ocrApplied: boolean("ocr_applied").notNull().default(false),
  },
  (table) => [uniqueIndex("document_pages_doc_page").on(table.documentId, table.pageNumber)],
);

export const documentSections = pgTable("document_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  heading: text("heading"),
  text: text("text").notNull().default(""),
  pageStart: integer("page_start"),
  pageEnd: integer("page_end"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").references(() => documentPages.id, { onDelete: "set null" }),
    sectionId: uuid("section_id").references(() => documentSections.id, { onDelete: "set null" }),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    pageNumber: integer("page_number").notNull(),
    bbox: jsonb("bbox").$type<BBox | null>(),
  },
  (table) => [index("document_chunks_document_idx").on(table.documentId)],
);

export const embeddings = pgTable("embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  chunkId: uuid("chunk_id")
    .notNull()
    .unique()
    .references(() => documentChunks.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  dimensions: integer("dimensions").notNull(),
  embedding: vector768("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    claimNumber: integer("claim_number").notNull(),
    text: text("text").notNull(),
    isIndependent: boolean("is_independent").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("claims_project_idx").on(table.projectId)],
);

export const claimElements = pgTable(
  "claim_elements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    elementKey: text("element_key").notNull(),
    text: text("text").notNull(),
    elementType: text("element_type").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("claim_elements_claim_idx").on(table.claimId)],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").references(() => documentChunks.id, { onDelete: "set null" }),
    pageNumber: integer("page_number").notNull(),
    evidenceText: text("evidence_text").notNull(),
    explanation: text("explanation").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    relationship: text("relationship").notNull(),
    model: text("model"),
    bbox: jsonb("bbox").$type<BBox | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("evidence_project_idx").on(table.projectId)],
);

export const claimElementEvidence = pgTable(
  "claim_element_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimElementId: uuid("claim_element_id")
      .notNull()
      .references(() => claimElements.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id").references(() => evidence.id, { onDelete: "cascade" }),
    priorArtDocumentId: uuid("prior_art_document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    aiRelationship: text("ai_relationship").notNull(),
    aiConfidence: doublePrecision("ai_confidence"),
    analystRelationship: text("analyst_relationship"),
    analystNote: text("analyst_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("claim_element_evidence_element_idx").on(table.claimElementId)],
);

export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  docxStorageKey: text("docx_storage_key"),
  pdfStorageKey: text("pdf_storage_key"),
  error: text("error"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id").references(() => claims.id, { onDelete: "cascade" }),
    claimElementId: uuid("claim_element_id").references(() => claimElements.id, {
      onDelete: "cascade",
    }),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull(),
    bullJobId: text("bull_job_id"),
    attempt: integer("attempt").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("processing_jobs_document_idx").on(table.documentId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_logs_org_idx").on(table.organizationId, table.createdAt)],
);

export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  operation: text("operation").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiResultCache = pgTable("ai_result_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  cacheKey: text("cache_key").notNull().unique(),
  operation: text("operation").notNull(),
  model: text("model").notNull(),
  response: jsonb("response").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
