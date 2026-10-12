"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { PdfViewer } from "@/components/pdf-viewer";
import { api } from "@/lib/api";
import { errorMessage, waitForJob } from "@/lib/jobs";
import { STATUS_CLASS, type Claim, type ClaimElement, type EvidenceItem, type PatentDocument } from "@/lib/types";

const ELEMENT_TYPES = ["component", "function", "relationship", "limitation", "other"] as const;

export default function ClaimsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const client = useQueryClient();
  const [elementId, setElementId] = useState<string | null>(null);
  const [active, setActive] = useState<EvidenceItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api<PatentDocument[]>(`/projects/${projectId}/documents`),
  });
  const claims = useQuery({
    queryKey: ["claims", projectId],
    queryFn: () => api<Claim[]>(`/projects/${projectId}/claims`),
  });
  const evidence = useQuery({
    queryKey: ["evidence", elementId],
    queryFn: () => api<EvidenceItem[]>(`/claim-elements/${elementId}/evidence`),
    enabled: Boolean(elementId),
  });
  const target = documents.data?.find((document) => document.role === "target" && document.status === "completed")
    ?? documents.data?.find((document) => document.role === "target");
  const priorReady = (documents.data ?? []).some((document) => document.role === "prior_art" && document.status === "completed");
  const viewerDocument = active?.evidence?.documentId ?? target?.id ?? null;
  const selected = (claims.data ?? []).flatMap((claim) => claim.elements).find((element) => element.id === elementId) ?? null;

  function refreshClaims() {
    void client.invalidateQueries({ queryKey: ["claims", projectId] });
    void client.invalidateQueries({ queryKey: ["chart", projectId] });
  }

  async function runJob(key: string, start: () => Promise<{ jobId: string }>, done: string) {
    setPending(key);
    setError(null);
    setNotice("Working…");
    try {
      const job = await start();
      await waitForJob(job.jobId);
      setNotice(done);
      refreshClaims();
      if (elementId) void client.invalidateQueries({ queryKey: ["evidence", elementId] });
    } catch (reason) {
      setNotice(null);
      setError(errorMessage(reason, "The request failed"));
      refreshClaims();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid h-[calc(100vh-8.5rem)] min-h-[32rem] grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
      <aside className="overflow-auto border-b border-line bg-panel p-4 xl:border-b-0 xl:border-r">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="rounded border border-line px-2 py-1 text-xs"
            disabled={!target || target.status !== "completed" || pending === "extract"}
            onClick={() => {
              if (!target) return;
              void runJob(
                "extract",
                () => api(`/documents/${target.id}/extract-claims`, { method: "POST" }),
                "Claims updated.",
              );
            }}
          >
            {pending === "extract" ? "Identifying…" : "Identify claims"}
          </button>
          <button
            className="rounded border border-line px-2 py-1 text-xs"
            disabled={!priorReady || pending === "search-all" || (claims.data ?? []).every((claim) => claim.elements.length === 0)}
            onClick={() => {
              void (async () => {
                const elements = (claims.data ?? []).flatMap((claim) => claim.elements);
                setPending("search-all");
                setError(null);
                try {
                  for (let index = 0; index < elements.length; index += 1) {
                    setNotice(`Searching prior art ${index + 1} of ${elements.length}…`);
                    const job = await api<{ jobId: string }>(`/claim-elements/${elements[index].id}/search`, { method: "POST" });
                    await waitForJob(job.jobId);
                  }
                  setNotice("Prior-art search finished.");
                  refreshClaims();
                  if (elementId) void client.invalidateQueries({ queryKey: ["evidence", elementId] });
                } catch (reason) {
                  setNotice(null);
                  setError(errorMessage(reason, "Prior-art search failed"));
                } finally {
                  setPending(null);
                }
              })();
            }}
          >
            {pending === "search-all" ? "Searching…" : "Search all elements"}
          </button>
        </div>
        {!target ? <p className="mb-3 text-xs text-stone-500">Upload a target patent on the Documents tab first.</p> : null}
        {target && target.status !== "completed" ? (
          <p className="mb-3 text-xs text-amber-800">Process the target patent before identifying claims.</p>
        ) : null}
        {!priorReady ? (
          <p className="mb-3 text-xs text-stone-500">
            Process at least one prior-art PDF before searching. <Link href={`/projects/${projectId}/documents`} className="underline">Open documents</Link>
          </p>
        ) : null}
        {notice ? <p className="mb-3 text-xs text-stone-600">{notice}</p> : null}
        {error ? <p className="mb-3 text-xs text-rose-800">{error}</p> : null}
        {claims.data?.length === 0 ? (
          <p className="rounded border border-dashed border-line px-3 py-6 text-xs text-stone-500">
            No claims yet. Identify them from the processed patent, or add one below.
          </p>
        ) : null}
        {(claims.data ?? []).map((claim) => (
          <section key={claim.id} className="mb-4 border-b border-line pb-4">
            <p className="text-sm font-medium">
              Claim {claim.claimNumber}
              <span className="ml-2 text-xs font-normal text-stone-500">{claim.isIndependent ? "Independent" : "Dependent"}</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-stone-600">{claim.text}</p>
            <button
              className="mt-2 text-xs underline"
              disabled={pending === `decompose:${claim.id}` || claim.elements.length > 0}
              onClick={() => {
                void runJob(
                  `decompose:${claim.id}`,
                  () => api(`/claims/${claim.id}/decompose`, { method: "POST" }),
                  `Claim ${claim.claimNumber} was split into elements.`,
                );
              }}
            >
              {claim.elements.length > 0 ? "Elements saved" : pending === `decompose:${claim.id}` ? "Decomposing…" : "Decompose"}
            </button>
            <ul className="mt-2 grid gap-1">
              {claim.elements.map((element, index) => (
                <li key={element.id}>
                  <button
                    className={`w-full rounded px-2 py-1 text-left text-xs ${elementId === element.id ? "bg-pine text-white" : "bg-stone-100"}`}
                    onClick={() => {
                      setElementId(element.id);
                      setActive(null);
                    }}
                  >
                    {element.elementKey}. {element.text}
                  </button>
                  <div className="mt-1 flex gap-2 px-1 text-[11px] text-stone-500">
                    <button
                      disabled={index === 0}
                      onClick={() => void moveElement(claim, index, -1).then(refreshClaims).catch((reason: unknown) => setError(errorMessage(reason, "Could not reorder")))}
                    >
                      Up
                    </button>
                    <button
                      disabled={index === claim.elements.length - 1}
                      onClick={() => void moveElement(claim, index, 1).then(refreshClaims).catch((reason: unknown) => setError(errorMessage(reason, "Could not reorder")))}
                    >
                      Down
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <AddElement claimId={claim.id} onSaved={refreshClaims} onError={setError} />
          </section>
        ))}
        {target ? <AddClaim projectId={projectId} documentId={target.id} onSaved={refreshClaims} onError={setError} /> : null}
      </aside>
      <PdfViewer
        documentId={viewerDocument}
        highlight={
          active?.evidence
            ? { page: active.evidence.pageNumber, bbox: active.evidence.bbox }
            : null
        }
      />
      <aside className="overflow-auto border-t border-line bg-panel p-4 xl:border-l xl:border-t-0">
        <h2 className="font-serif text-xl">Evidence</h2>
        <p className="mt-1 text-xs text-stone-500">Potentially relevant passages. Analyst review is required.</p>
        {selected ? <ElementEditor element={selected} onSaved={refreshClaims} onDeleted={() => { setElementId(null); refreshClaims(); }} onError={setError} /> : null}
        {elementId ? (
          <button
            className="mt-3 rounded bg-pine px-3 py-1 text-xs text-white"
            disabled={!priorReady || pending === `search:${elementId}`}
            onClick={() => {
              void runJob(
                `search:${elementId}`,
                () => api(`/claim-elements/${elementId}/search`, { method: "POST" }),
                "Search finished.",
              );
            }}
          >
            {pending === `search:${elementId}` ? "Searching…" : "Search prior art"}
          </button>
        ) : (
          <p className="mt-3 text-xs text-stone-500">Select an element to review evidence.</p>
        )}
        {evidence.isError ? <p className="mt-3 text-xs text-rose-800">{errorMessage(evidence.error, "Evidence could not be loaded.")}</p> : null}
        <div className="mt-4 grid gap-3">
          {(evidence.data ?? []).map((item) => (
            <article key={item.id} className={`rounded border p-3 text-xs ${active?.id === item.id ? "border-pine" : "border-line"}`}>
              <button className="text-left" onClick={() => setActive(item)}>
                <span className={`rounded px-2 py-0.5 ${STATUS_CLASS[item.displayRelationship] ?? "bg-stone-100"}`}>
                  {item.displayLabel}
                </span>
                {item.confidence != null ? <span className="ml-2 text-stone-500">{Math.round(item.confidence * 100)}%</span> : null}
                <p className="mt-2 font-medium">{item.documentTitle || "Prior art"}</p>
                {item.evidence ? (
                  <>
                    <p className="mt-1 text-stone-500">Page {item.evidence.pageNumber}</p>
                    <p className="mt-2 leading-5">{item.evidence.text}</p>
                    <p className="mt-2 text-stone-600">{item.evidence.explanation}</p>
                  </>
                ) : (
                  <p className="mt-2 text-stone-500">No quoted passage stored.</p>
                )}
              </button>
              <OverrideForm item={item} onSaved={() => void client.invalidateQueries({ queryKey: ["evidence", elementId] })} />
            </article>
          ))}
          {elementId && evidence.data?.length === 0 ? (
            <p className="text-xs text-stone-500">No passages stored for this element yet.</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

async function moveElement(claim: Claim, index: number, direction: -1 | 1) {
  const ids = claim.elements.map((element) => element.id);
  const next = index + direction;
  const [moved] = ids.splice(index, 1);
  ids.splice(next, 0, moved);
  await api(`/claims/${claim.id}/elements/reorder`, { method: "POST", body: JSON.stringify({ ids }) });
}

function AddClaim({
  projectId,
  documentId,
  onSaved,
  onError,
}: {
  projectId: string;
  documentId: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const save = useMutation({
    mutationFn: (body: { claimNumber: number; text: string; documentId: string }) =>
      api(`/projects/${projectId}/claims`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onSaved,
    onError: (reason) => onError(errorMessage(reason, "Could not add the claim")),
  });
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        save.mutate(
          {
            documentId,
            claimNumber: Number(data.get("claimNumber")),
            text: String(data.get("text") ?? ""),
          },
          { onSuccess: () => form.reset() },
        );
      }}
    >
      <p className="text-xs font-medium">Add a claim</p>
      <input name="claimNumber" type="number" min={1} required placeholder="Number" className="rounded border border-line px-2 py-1 text-xs" />
      <textarea name="text" required placeholder="Claim text" className="rounded border border-line px-2 py-1 text-xs" />
      <button disabled={save.isPending} className="justify-self-start rounded border border-line px-2 py-1 text-xs">
        {save.isPending ? "Saving…" : "Add claim"}
      </button>
    </form>
  );
}

function AddElement({ claimId, onSaved, onError }: { claimId: string; onSaved: () => void; onError: (message: string) => void }) {
  const save = useMutation({
    mutationFn: (body: { text: string; type: string }) =>
      api(`/claims/${claimId}/elements`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onSaved,
    onError: (reason) => onError(errorMessage(reason, "Could not add the element")),
  });
  return (
    <form
      className="mt-2 grid gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        save.mutate(
          { text: String(data.get("text") ?? ""), type: String(data.get("type") ?? "other") },
          { onSuccess: () => form.reset() },
        );
      }}
    >
      <textarea name="text" required placeholder="Add an element" className="rounded border border-line px-2 py-1 text-xs" />
      <div className="flex gap-1">
        <select name="type" className="rounded border border-line px-2 py-1 text-xs">
          {ELEMENT_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <button disabled={save.isPending} className="rounded border border-line px-2 py-1 text-xs">Add</button>
      </div>
    </form>
  );
}

function ElementEditor({
  element,
  onSaved,
  onDeleted,
  onError,
}: {
  element: ClaimElement;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const save = useMutation({
    mutationFn: (body: { text: string; type: string }) =>
      api(`/claim-elements/${element.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: onSaved,
    onError: (reason) => onError(errorMessage(reason, "Could not update the element")),
  });
  const remove = useMutation({
    mutationFn: () => api(`/claim-elements/${element.id}`, { method: "DELETE" }),
    onSuccess: onDeleted,
    onError: (reason) => onError(errorMessage(reason, "Could not delete the element")),
  });
  return (
    <form
      key={element.id}
      className="mt-3 grid gap-2 rounded border border-line p-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        save.mutate({ text: String(data.get("text") ?? ""), type: String(data.get("type") ?? element.elementType) });
      }}
    >
      <p className="text-xs font-medium">Edit {element.elementKey}</p>
      <textarea name="text" defaultValue={element.text} required className="rounded border border-line px-2 py-1 text-xs" />
      <select name="type" defaultValue={element.elementType} className="rounded border border-line px-2 py-1 text-xs">
        {ELEMENT_TYPES.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <button disabled={save.isPending} className="rounded border border-line px-2 py-1 text-xs">
          {save.isPending ? "Saving…" : "Save element"}
        </button>
        <button
          type="button"
          className="rounded border border-line px-2 py-1 text-xs text-rose-800"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          Delete
        </button>
      </div>
    </form>
  );
}

function OverrideForm({ item, onSaved }: { item: EvidenceItem; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { analystRelationship: string; analystNote: string }) =>
      api(`/evidence/${item.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (reason) => setError(errorMessage(reason, "Could not save the analyst decision")),
  });
  return (
    <form
      key={`${item.id}:${item.analystRelationship ?? ""}:${item.analystNote ?? ""}`}
      className="mt-3 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        save.mutate({
          analystRelationship: String(data.get("status")),
          analystNote: String(data.get("note") ?? ""),
        });
      }}
    >
      <select name="status" defaultValue={item.analystRelationship ?? item.displayRelationship} className="rounded border border-line px-2 py-1">
        <option value="strong_match">Strong correspondence</option>
        <option value="partial_match">Possible partial match</option>
        <option value="weak_match">Weak / possible match</option>
        <option value="no_evidence">No evidence identified</option>
        <option value="needs_review">Analyst review required</option>
      </select>
      <textarea name="note" defaultValue={item.analystNote ?? ""} placeholder="Analyst note" className="rounded border border-line px-2 py-1" />
      {error ? <p className="text-rose-800">{error}</p> : null}
      <button disabled={save.isPending} className="justify-self-start rounded border border-line px-2 py-1">
        {save.isPending ? "Saving…" : "Save analyst decision"}
      </button>
    </form>
  );
}
