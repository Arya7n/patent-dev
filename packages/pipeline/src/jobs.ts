import { asc, eq, sql } from "drizzle-orm";
import {
  aiResultCache,
  aiUsage,
  claimElementEvidence,
  claimElements,
  claims,
  documentChunks,
  documentPages,
  documentSections,
  documents,
  embeddings,
  evidence,
  processingJobs,
  projects,
  reports,
  type Database,
} from "@patent/db";
import {
  buildClaimChart,
  chartRowLabel,
  decideInvalidModelOutput,
  decompositionLooksFragmented,
  patentLabel,
  evidenceRelationships,
  extractClaimsFromSections,
  extractJsonObject,
  needsOcr,
  normalizeClaimDecomposition,
  normalizeEvidenceAssessment,
  planEvidenceUpdate,
  type BBox,
  type ClaimChart,
  type EvidenceRelationship,
} from "@patent/shared";
import type { ObjectStorage } from "@patent/storage";
import { cacheKey, estimateCost, type AiClient, type CostRates, type TokenUsage } from "./ai";
import { extractPdf } from "./pdf";
import { chunksFromExtraction, sectionsFromExtraction } from "./prepare";
import { renderDocx, renderPdf } from "./reports";
import { toVectorLiteral } from "./vector";

export type PipelineContext = {
  db: Database;
  storage: ObjectStorage;
  ai: AiClient;
  pythonBin: string;
  repoRoot: string;
  costs: CostRates;
  dimensions: number;
};

type SearchHit = {
  id: string;
  document_id: string;
  text: string;
  page_number: number;
  bbox: BBox | null;
  score: number;
};

function asRelationship(value: string | null | undefined): EvidenceRelationship {
  if (value && (evidenceRelationships as readonly string[]).includes(value)) {
    return value as EvidenceRelationship;
  }
  return "needs_review";
}

async function recordUsage(
  ctx: PipelineContext,
  input: { organizationId: string; projectId: string; operation: string; model: string; usage: TokenUsage; kind: "chat" | "embedding" },
) {
  await ctx.db.insert(aiUsage).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    provider: ctx.ai.provider,
    model: input.model,
    operation: input.operation,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    estimatedCostUsd: estimateCost(input.usage, ctx.costs, input.kind),
  });
}

async function generateObject(
  ctx: PipelineContext,
  scope: { organizationId: string; projectId: string; operation: string },
  prompt: string,
): Promise<unknown> {
  const key = cacheKey(ctx.ai.chatModel, scope.operation, prompt);
  const cached = await ctx.db
    .select()
    .from(aiResultCache)
    .where(eq(aiResultCache.cacheKey, key))
    .limit(1);
  if (cached[0]) return cached[0].response;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await ctx.ai.generateJson(prompt);
    await recordUsage(ctx, {
      ...scope,
      model: ctx.ai.chatModel,
      usage: result.usage,
      kind: "chat",
    });
    try {
      const json = extractJsonObject(result.text);
      await ctx.db.insert(aiResultCache).values({
        cacheKey: key,
        operation: scope.operation,
        model: ctx.ai.chatModel,
        response: json,
      }).onConflictDoNothing();
      return json;
    } catch (error) {
      lastError = error;
      if (decideInvalidModelOutput(attempt) === "needs_review") break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Model output could not be validated");
}

export async function processDocument(ctx: PipelineContext, documentId: string) {
  const [document] = await ctx.db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!document) throw new Error("Document not found");
  await ctx.db
    .update(documents)
    .set({ status: "extracting", error: null, updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  const bytes = await ctx.storage.get(document.storageKey);
  const { extraction, ocrApplied } = await extractPdf(bytes, {
    pythonBin: ctx.pythonBin,
    repoRoot: ctx.repoRoot,
  });
  const sections = sectionsFromExtraction(extraction);
  const chunks = chunksFromExtraction(extraction);
  const abstractText = sections.find((section) => section.kind === "abstract")?.text ?? null;
  const lowText = needsOcr(extraction.pages);

  await ctx.db.transaction(async (tx) => {
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    await tx.delete(documentSections).where(eq(documentSections.documentId, documentId));
    await tx.delete(documentPages).where(eq(documentPages.documentId, documentId));
    const pageIds = new Map<number, string>();
    for (const page of extraction.pages) {
      const [inserted] = await tx
        .insert(documentPages)
        .values({
          documentId,
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          text: page.text,
          ocrApplied,
        })
        .returning();
      pageIds.set(page.pageNumber, inserted.id);
    }
    for (const [index, section] of sections.entries()) {
      await tx.insert(documentSections).values({
        documentId,
        kind: section.kind,
        heading: section.heading,
        text: section.text,
        sortOrder: index,
      });
    }
    for (const [index, chunk] of chunks.entries()) {
      await tx.insert(documentChunks).values({
        documentId,
        pageId: pageIds.get(chunk.pageNumber) ?? null,
        chunkIndex: index,
        text: chunk.text,
        pageNumber: chunk.pageNumber,
        bbox: chunk.bbox,
      });
    }
  });

  if (chunks.length === 0) {
    await ctx.db
      .update(documents)
      .set({
        status: "ocr_required",
        pageCount: extraction.pageCount,
        title: patentLabel(document.originalFilename, extraction.metadata?.title) || document.originalFilename,
        abstractText,
        error: "Little or no text was extracted. Install Tesseract and OCRmyPDF, then retry.",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
    return;
  }

  await ctx.db
    .update(documents)
    .set({ status: "embedding", pageCount: extraction.pageCount, updatedAt: new Date() })
    .where(eq(documents.id, documentId));
  await embedDocument(ctx, document.organizationId, document.projectId, documentId);
  await ctx.db
    .update(documents)
    .set({
      status: "completed",
      title: patentLabel(document.originalFilename, extraction.metadata?.title || document.title) || document.originalFilename,
      abstractText,
      error: lowText ? "Text was extracted, but OCR may recover more from scanned pages." : null,
      metadata: { ocrApplied, ocrRecommended: lowText },
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function embedDocument(
  ctx: PipelineContext,
  organizationId: string,
  projectId: string,
  documentId: string,
) {
  const chunks = await ctx.db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId));
  const pending = [];
  for (const chunk of chunks) {
    const key = cacheKey(ctx.ai.embeddingModel, "embed", chunk.text);
    const cached = await ctx.db.select().from(aiResultCache).where(eq(aiResultCache.cacheKey, key)).limit(1);
    const vector = cached[0]?.response;
    if (Array.isArray(vector) && vector.every((value) => typeof value === "number")) {
      await saveEmbedding(ctx, chunk.id, vector as number[]);
      continue;
    }
    pending.push(chunk);
  }

  for (let index = 0; index < pending.length; index += 8) {
    const batch = pending.slice(index, index + 8);
    const embedded = await ctx.ai.embed(batch.map((chunk) => chunk.text));
    await recordUsage(ctx, {
      organizationId,
      projectId,
      operation: "embed",
      model: ctx.ai.embeddingModel,
      usage: embedded.usage,
      kind: "embedding",
    });
    for (let offset = 0; offset < batch.length; offset += 1) {
      const vector = embedded.vectors[offset] ?? [];
      if (vector.length !== ctx.dimensions) throw new Error("Embedding size did not match the configured dimensions");
      await saveEmbedding(ctx, batch[offset].id, vector);
      await ctx.db.insert(aiResultCache).values({
        cacheKey: cacheKey(ctx.ai.embeddingModel, "embed", batch[offset].text),
        operation: "embed",
        model: ctx.ai.embeddingModel,
        response: vector,
      }).onConflictDoNothing();
    }
  }
}

async function saveEmbedding(ctx: PipelineContext, chunkId: string, vector: number[]) {
  await ctx.db
    .insert(embeddings)
    .values({
      chunkId,
      model: ctx.ai.embeddingModel,
      dimensions: vector.length,
      embedding: vector,
    })
    .onConflictDoUpdate({
      target: embeddings.chunkId,
      set: { model: ctx.ai.embeddingModel, dimensions: vector.length, embedding: vector },
    });
}

export async function extractClaims(ctx: PipelineContext, documentId: string) {
  const [document] = await ctx.db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!document) throw new Error("Document not found");
  const existing = await ctx.db.select().from(claims).where(eq(claims.documentId, documentId));
  if (existing.length > 0) return;
  const sections = await ctx.db
    .select()
    .from(documentSections)
    .where(eq(documentSections.documentId, documentId));
  let drafts = extractClaimsFromSections(sections.map((section) => ({ kind: section.kind, text: section.text })));
  let source: "parser" | "ai" = "parser";
  if (drafts.length === 0) {
    const claimsText =
      sections.filter((section) => section.kind === "claims").map((section) => section.text).join("\n") ||
      sections.map((section) => section.text).join("\n").slice(0, 12_000);
    const json = await generateObject(
      ctx,
      { organizationId: document.organizationId, projectId: document.projectId, operation: "extract_claims" },
      [
        "Identify patent claims in the text.",
        "Do not give a legal conclusion.",
        "Return JSON {\"claims\":[{\"claimNumber\":1,\"text\":\"...\",\"isIndependent\":true}]}",
        claimsText,
      ].join("\n\n"),
    );
    const parsed = parseAiClaims(json);
    drafts = parsed;
    source = "ai";
  }
  for (const [index, draft] of drafts.entries()) {
    await ctx.db.insert(claims).values({
      projectId: document.projectId,
      documentId,
      claimNumber: draft.claimNumber,
      text: draft.text,
      isIndependent: draft.isIndependent,
      sortOrder: index,
      source,
    });
  }
}

function parseAiClaims(input: unknown): { claimNumber: number; text: string; isIndependent: boolean }[] {
  if (!input || typeof input !== "object" || !("claims" in input) || !Array.isArray(input.claims)) return [];
  return input.claims.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const claimNumber = Number("claimNumber" in item ? item.claimNumber : 0);
    const text = "text" in item && typeof item.text === "string" ? item.text.trim() : "";
    const isIndependent = "isIndependent" in item ? item.isIndependent !== false : !/\bclaims?\s+\d+\b/i.test(text);
    if (!text || claimNumber < 1) return [];
    return [{ claimNumber, text, isIndependent }];
  });
}

export async function decomposeClaim(ctx: PipelineContext, claimId: string) {
  const [claim] = await ctx.db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
  if (!claim) throw new Error("Claim not found");
  const [project] = await ctx.db.select().from(projects).where(eq(projects.id, claim.projectId)).limit(1);
  if (!project) throw new Error("Project not found");
  const existing = await ctx.db.select().from(claimElements).where(eq(claimElements.claimId, claimId));
  if (existing.length > 0) return;

  const basePrompt = [
    "You are preparing rows for a professional two-column claim chart used by patent research analysts.",
    "Split this claim into chart rows, in order, using exact contiguous wording copied from the claim.",
    "Row 1 is the preamble when the claim introduces an apparatus, method, system, or device, including processing/storage language through 'comprising', 'comprising the steps of', or 'wherein the program code instructs'.",
    "Each later limitation or step is its own row. Keep each step whole, including its wherein clauses.",
    "Do not invent wording. Do not paraphrase. Do not split a step into bare noun phrases such as 'a frame' or 'a wheel'.",
    "Dependent claims that only add one limitation may be a single row.",
    "Return JSON {\"claimNumber\":1,\"elements\":[{\"id\":\"E1\",\"text\":\"...\",\"type\":\"component|function|relationship|limitation|other\"}]}",
    `Claim number: ${claim.claimNumber}`,
    `Claim text: ${claim.text}`,
  ].join("\n\n");

  let parsed = normalizeClaimDecomposition(
    await generateObject(ctx, {
      organizationId: project.organizationId,
      projectId: project.id,
      operation: "decompose_claim",
    }, basePrompt),
  );
  if (
    parsed.success &&
    decompositionLooksFragmented(claim.text, parsed.data.elements)
  ) {
    parsed = normalizeClaimDecomposition(
      await generateObject(ctx, {
        organizationId: project.organizationId,
        projectId: project.id,
        operation: "decompose_claim_retry",
      }, [
        basePrompt,
        "Your previous split was too fragmented or not exact claim text.",
        "Retry with fewer rows. Every element text must be an exact contiguous excerpt from the claim.",
        "Keep each functional step intact.",
      ].join("\n\n")),
    );
  }
  if (!parsed.success) throw new Error("Claim decomposition could not be validated. Analyst review required.");
  if (decompositionLooksFragmented(claim.text, parsed.data.elements)) {
    throw new Error("Claim decomposition was too fragmented. Analyst review required.");
  }
  for (const [index, element] of parsed.data.elements.entries()) {
    await ctx.db.insert(claimElements).values({
      claimId,
      elementKey: element.id,
      text: element.text,
      elementType: element.type,
      sortOrder: index,
    });
  }
}

export async function mapElement(ctx: PipelineContext, elementId: string) {
  const [element] = await ctx.db.select().from(claimElements).where(eq(claimElements.id, elementId)).limit(1);
  if (!element) throw new Error("Claim element not found");
  const [claim] = await ctx.db.select().from(claims).where(eq(claims.id, element.claimId)).limit(1);
  if (!claim) throw new Error("Claim not found");
  const [project] = await ctx.db.select().from(projects).where(eq(projects.id, claim.projectId)).limit(1);
  if (!project) throw new Error("Project not found");
  const priorArt = await ctx.db
    .select()
    .from(documents)
    .where(eq(documents.projectId, project.id));
  const searchable = priorArt.filter(
    (document) => (document.role === "prior_art" || document.role === "reference") && document.status === "completed",
  );
  if (searchable.length === 0) throw new Error("No processed prior-art documents are available");

  const embedded = await ctx.ai.embed([element.text]);
  await recordUsage(ctx, {
    organizationId: project.organizationId,
    projectId: project.id,
    operation: "embed_element",
    model: ctx.ai.embeddingModel,
    usage: embedded.usage,
    kind: "embedding",
  });
  const vector = embedded.vectors[0] ?? [];
  const siblingElements = await ctx.db
    .select()
    .from(claimElements)
    .where(eq(claimElements.claimId, claim.id))
    .orderBy(asc(claimElements.sortOrder));
  const elementIndex = siblingElements.findIndex((row) => row.id === element.id);
  const rowLabel = chartRowLabel(
    claim.claimNumber,
    Math.max(0, elementIndex),
    element.text,
    siblingElements[0]?.text ?? element.text,
  );
  const hits = [];
  for (const document of searchable) {
    const found = await searchSimilarChunks(ctx.db, vector, [document.id], 5);
    const ranked = found
      .filter((hit) => hit.score >= 0.22)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    hits.push(...(ranked.length > 0 ? ranked : found.slice(0, 1)));
  }
  const target = priorArt.find((document) => document.role === "target" && document.status === "completed");
  const specHit = target ? (await searchSimilarChunks(ctx.db, vector, [target.id], 1))[0] : undefined;
  const incoming = [];
  for (const hit of hits) {
    let assessment;
    try {
      const json = await generateObject(
        ctx,
        { organizationId: project.organizationId, projectId: project.id, operation: "classify_evidence" },
        [
          "Write the Mapping cell for one row of a professional patent claim chart.",
          "Tone: careful patent research analyst. No firm name. No legal conclusion of invalidity, infringement, essentiality, or patentability.",
          "evidenceText must be a verbatim quote copied from the reference passage below. Prefer the longest continuous quote that shows the mapped feature. Do not invent section numbers, column numbers, or line numbers.",
          "commentary has three parts:",
          "1) For each alignment, one sentence: \"'<claim phrase>' in this clause corresponds to '<reference phrase>' in the reference.\"",
          "2) One technical correspondence paragraph. Quote the patent specification only when a passage is provided, and cite that page only.",
          `3) End with exactly one of: "Hence, the cited reference reads over ${rowLabel}." or "Hence, the cited reference does not read over ${rowLabel}." or "Analyst review is required."`,
          "Cite a section number only when that exact number appears in the reference passage.",
          "If the passage does not teach the clause, choose NO_EVIDENCE or WEAK_MATCH and say the reference does not read over the row. Do not force a match.",
          "alignments pair a phrase that appears in the clause with a phrase that appears in the reference passage. Use one fill color per concept: FFFFCC, C5E0B3, FFCCFF, BDD6EE, F7CAAC, F4B083, FFE599, FFDBB7, 00B0F0, 66FFFF, EF89A1, D0CECE, 9CC2E5.",
          "Return JSON with relationship (STRONG_MATCH, PARTIAL_MATCH, WEAK_MATCH, NO_EVIDENCE, or NEEDS_REVIEW), confidence from 0 to 1, reasoning as one sentence, commentary, evidenceText, sourcePage, and alignments as {claimPhrase, sourcePhrase, color}.",
          `Chart row: ${rowLabel}`,
          `Claim clause: ${element.text}`,
          `Reference page: ${hit.page_number}`,
          `Reference passage:\n${hit.text.slice(0, 6000)}`,
          specHit
            ? `Patent specification passage, page ${specHit.page_number}:\n${specHit.text.slice(0, 2500)}`
            : "No patent specification passage was retrieved.",
        ].join("\n\n"),
      );
      assessment = normalizeEvidenceAssessment(json, hit.page_number, {
        claimText: element.text,
        passageText: hit.text,
        rowLabel,
      });
    } catch {
      assessment = normalizeEvidenceAssessment(null, hit.page_number, {
        claimText: element.text,
        passageText: hit.text,
        rowLabel,
      });
    }
    const data = assessment.success
      ? assessment.data
      : {
          relationship: "needs_review" as const,
          confidence: 0,
          reasoning: "The model output could not be validated. Analyst review required.",
          commentary: "The model output could not be validated. Analyst review required.",
          evidenceText: hit.text.slice(0, 500),
          sourcePage: hit.page_number,
          alignments: [],
        };
    incoming.push({ hit, data });
  }

  const existing = await ctx.db
    .select({
      id: claimElementEvidence.id,
      chunkId: evidence.chunkId,
      analystRelationship: claimElementEvidence.analystRelationship,
      analystNote: claimElementEvidence.analystNote,
      evidenceId: claimElementEvidence.evidenceId,
      documentId: claimElementEvidence.priorArtDocumentId,
    })
    .from(claimElementEvidence)
    .leftJoin(evidence, eq(evidence.id, claimElementEvidence.evidenceId))
    .where(eq(claimElementEvidence.claimElementId, elementId));

  const plan = planEvidenceUpdate(
    existing.map((row) => ({
      id: row.id,
      chunkId: row.chunkId,
      analystRelationship: row.analystRelationship ? asRelationship(row.analystRelationship) : null,
      analystNote: row.analystNote,
    })),
    incoming.map((item) => ({
      chunkId: item.hit.id,
      relationship: item.data.relationship,
      confidence: item.data.confidence,
      reasoning: item.data.reasoning,
      evidenceText: item.data.evidenceText || item.hit.text.slice(0, 500),
      sourcePage: item.data.sourcePage,
    })),
  );

  const byChunk = new Map(incoming.map((item) => [item.hit.id, item]));
  await ctx.db.transaction(async (tx) => {
    for (const update of plan.update) {
      const item = byChunk.get(update.hit.chunkId);
      const row = existing.find((candidate) => candidate.id === update.id);
      if (!item || !row?.evidenceId) continue;
      await tx
        .update(evidence)
        .set({
          evidenceText: update.hit.evidenceText,
          explanation: item.data.commentary || update.hit.reasoning,
          mapping: item.data.alignments,
          confidence: update.hit.confidence,
          relationship: update.hit.relationship,
          pageNumber: update.hit.sourcePage,
          model: ctx.ai.chatModel,
          bbox: item.hit.bbox,
        })
        .where(eq(evidence.id, row.evidenceId));
      await tx
        .update(claimElementEvidence)
        .set({
          aiRelationship: update.hit.relationship,
          aiConfidence: update.hit.confidence,
          updatedAt: new Date(),
        })
        .where(eq(claimElementEvidence.id, update.id));
    }
    for (const id of plan.remove) {
      const row = existing.find((candidate) => candidate.id === id);
      if (row?.evidenceId) await tx.delete(evidence).where(eq(evidence.id, row.evidenceId));
      else await tx.delete(claimElementEvidence).where(eq(claimElementEvidence.id, id));
    }
    for (const created of plan.create) {
      const item = byChunk.get(created.chunkId);
      if (!item) continue;
      const [createdEvidence] = await tx
        .insert(evidence)
        .values({
          projectId: project.id,
          sourceDocumentId: item.hit.document_id,
          chunkId: item.hit.id,
          pageNumber: created.sourcePage,
          evidenceText: created.evidenceText,
          explanation: item.data.commentary || created.reasoning,
          mapping: item.data.alignments,
          confidence: created.confidence,
          relationship: created.relationship,
          model: ctx.ai.chatModel,
          bbox: item.hit.bbox,
        })
        .returning();
      await tx.insert(claimElementEvidence).values({
        claimElementId: elementId,
        evidenceId: createdEvidence.id,
        priorArtDocumentId: item.hit.document_id,
        aiRelationship: created.relationship,
        aiConfidence: created.confidence,
      });
    }
    const covered = new Set(
      existing
        .filter((row) => plan.preserve.includes(row.id) || plan.update.some((item) => item.id === row.id))
        .map((row) => row.documentId),
    );
    for (const created of plan.create) covered.add(byChunk.get(created.chunkId)?.hit.document_id ?? "");
    for (const document of searchable) {
      if (covered.has(document.id)) continue;
      await tx.insert(claimElementEvidence).values({
        claimElementId: elementId,
        priorArtDocumentId: document.id,
        aiRelationship: "no_evidence",
        aiConfidence: 0,
      });
    }
  });
}

async function searchSimilarChunks(
  db: Database,
  vector: number[],
  documentIds: string[],
  limit: number,
): Promise<SearchHit[]> {
  if (documentIds.length === 0) return [];
  const literal = toVectorLiteral(vector, vector.length);
  const idList = sql.join(
    documentIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    select c.id::text as id,
           c.document_id::text as document_id,
           c.text as text,
           c.page_number as page_number,
           c.bbox as bbox,
           (1 - (e.embedding <=> ${literal}::vector))::float8 as score
    from document_chunks c
    inner join embeddings e on e.chunk_id = c.id
    where c.document_id in (${idList})
    order by e.embedding <=> ${literal}::vector
    limit ${limit}
  `);
  return [...rows].flatMap((row) => {
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.text !== "string") return [];
    return [{
      id: record.id,
      document_id: String(record.document_id),
      text: record.text,
      page_number: Number(record.page_number),
      bbox: record.bbox && typeof record.bbox === "object" ? (record.bbox as BBox) : null,
      score: Number(record.score),
    }];
  });
}

export async function loadClaimChart(db: Database, projectId: string): Promise<ClaimChart> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found");
  const elementRows = await db
    .select({
      id: claimElements.id,
      key: claimElements.elementKey,
      text: claimElements.text,
      claimNumber: claims.claimNumber,
      claimText: claims.text,
    })
    .from(claimElements)
    .innerJoin(claims, eq(claims.id, claimElements.claimId))
    .where(eq(claims.projectId, projectId))
    .orderBy(claims.sortOrder, claimElements.sortOrder);
  const priorArt = await db.select().from(documents).where(eq(documents.projectId, projectId));
  const linkRows = await db
    .select({
      elementId: claimElementEvidence.claimElementId,
      documentId: claimElementEvidence.priorArtDocumentId,
      ai: claimElementEvidence.aiRelationship,
      analyst: claimElementEvidence.analystRelationship,
      confidence: claimElementEvidence.aiConfidence,
      evidenceId: evidence.id,
      evidenceText: evidence.evidenceText,
      pageNumber: evidence.pageNumber,
      explanation: evidence.explanation,
      analystNote: claimElementEvidence.analystNote,
      mapping: evidence.mapping,
    })
    .from(claimElementEvidence)
    .innerJoin(claimElements, eq(claimElements.id, claimElementEvidence.claimElementId))
    .innerJoin(claims, eq(claims.id, claimElements.claimId))
    .leftJoin(evidence, eq(evidence.id, claimElementEvidence.evidenceId))
    .where(eq(claims.projectId, projectId));

  const target = priorArt.find((document) => document.role === "target");
  return buildClaimChart({
    projectName: project.name,
    targetTitle: target ? patentLabel(target.originalFilename, target.title) : null,
    elements: elementRows,
    priorArt: priorArt
      .filter((document) => document.role === "prior_art" || document.role === "reference")
      .map((document) => ({
        id: document.id,
        title: patentLabel(document.originalFilename, document.title) || document.originalFilename,
      })),
    links: linkRows.map((row) => ({
      elementId: row.elementId,
      documentId: row.documentId,
      ai: asRelationship(row.ai),
      analyst: row.analyst ? asRelationship(row.analyst) : null,
      confidence: row.confidence,
      evidenceId: row.evidenceId,
      evidenceText: row.evidenceText,
      pageNumber: row.pageNumber,
      explanation: row.explanation,
      analystNote: row.analystNote,
      alignments: row.mapping ?? [],
    })),
  });
}

export async function generateReport(ctx: PipelineContext, reportId: string) {
  const [report] = await ctx.db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!report) throw new Error("Report not found");
  const [project] = await ctx.db.select().from(projects).where(eq(projects.id, report.projectId)).limit(1);
  if (!project) throw new Error("Project not found");
  const chart = await loadClaimChart(ctx.db, project.id);
  const docx = await renderDocx(chart);
  const pdf = await renderPdf(chart);
  const docxKey = `${project.organizationId}/reports/${report.id}.docx`;
  const pdfKey = `${project.organizationId}/reports/${report.id}.pdf`;
  await ctx.storage.put(
    docxKey,
    docx,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  await ctx.storage.put(pdfKey, pdf, "application/pdf");
  await ctx.db
    .update(reports)
    .set({
      status: "completed",
      snapshot: JSON.parse(JSON.stringify(chart)) as Record<string, unknown>,
      docxStorageKey: docxKey,
      pdfStorageKey: pdfKey,
      error: null,
    })
    .where(eq(reports.id, report.id));
}

export async function runQueuedJob(ctx: PipelineContext, jobId: string) {
  const [job] = await ctx.db.select().from(processingJobs).where(eq(processingJobs.id, jobId)).limit(1);
  if (!job) throw new Error("Job not found");
  const startedAt = new Date();
  await ctx.db
    .update(processingJobs)
    .set({ status: "processing", startedAt, attempt: job.attempt + 1, error: null })
    .where(eq(processingJobs.id, jobId));
  logJob(job, "processing");
  try {
    switch (job.type) {
      case "process_document":
        if (!job.documentId) throw new Error("Document is required");
        await processDocument(ctx, job.documentId);
        break;
      case "extract_claims":
        if (!job.documentId) throw new Error("Document is required");
        await extractClaims(ctx, job.documentId);
        break;
      case "decompose_claim":
        if (!job.claimId) throw new Error("Claim is required");
        await decomposeClaim(ctx, job.claimId);
        break;
      case "map_element":
        if (!job.claimElementId) throw new Error("Claim element is required");
        await mapElement(ctx, job.claimElementId);
        break;
      case "generate_report":
        if (!job.reportId) throw new Error("Report is required");
        await generateReport(ctx, job.reportId);
        break;
      default:
        throw new Error(`Unknown job type ${job.type}`);
    }
    await ctx.db
      .update(processingJobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(processingJobs.id, jobId));
    logJob(job, "completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    await ctx.db
      .update(processingJobs)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(processingJobs.id, jobId));
    if (job.documentId && job.type === "process_document") {
      await ctx.db
        .update(documents)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(documents.id, job.documentId));
    }
    if (job.reportId) {
      await ctx.db.update(reports).set({ status: "failed", error: message }).where(eq(reports.id, job.reportId));
    }
    logJob(job, "failed", message);
    throw error;
  }
}

function logJob(
  job: { id: string; projectId: string; documentId: string | null; type: string },
  status: string,
  error?: string,
) {
  console.log(JSON.stringify({
    level: error ? "error" : "info",
    jobId: job.id,
    projectId: job.projectId,
    documentId: job.documentId,
    type: job.type,
    status,
    error,
  }));
}
