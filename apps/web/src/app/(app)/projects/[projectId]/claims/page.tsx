"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { PdfViewer } from "@/components/pdf-viewer";
import { api } from "@/lib/api";
import { STATUS_CLASS, type Claim, type EvidenceItem, type PatentDocument } from "@/lib/types";

export default function ClaimsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const client = useQueryClient();
  const [elementId, setElementId] = useState<string | null>(null);
  const [active, setActive] = useState<EvidenceItem | null>(null);
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
  const target = documents.data?.find((document) => document.role === "target");
  const viewerDocument = active?.evidence?.documentId ?? target?.id ?? null;

  return (
    <div className="grid h-[calc(100vh-92px)] grid-cols-[280px_1fr_340px]">
      <aside className="overflow-auto border-r border-line bg-panel p-4">
        <div className="mb-3 flex gap-2">
          <button
            className="rounded border border-line px-2 py-1 text-xs"
            onClick={() => {
              if (!target) return;
              void api(`/documents/${target.id}/extract-claims`, { method: "POST" }).then(() =>
                setTimeout(() => void client.invalidateQueries({ queryKey: ["claims", projectId] }), 2000),
              );
            }}
          >
            Identify claims
          </button>
        </div>
        {(claims.data ?? []).map((claim) => (
          <section key={claim.id} className="mb-4">
            <p className="text-sm font-medium">Claim {claim.claimNumber}</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">{claim.text}</p>
            <button
              className="mt-2 text-xs underline"
              onClick={() => {
                void api(`/claims/${claim.id}/decompose`, { method: "POST" }).then(() =>
                  setTimeout(() => void client.invalidateQueries({ queryKey: ["claims", projectId] }), 2000),
                );
              }}
            >
              Decompose
            </button>
            <ul className="mt-2 grid gap-1">
              {claim.elements.map((element) => (
                <li key={element.id}>
                  <button
                    className={`w-full rounded px-2 py-1 text-left text-xs ${elementId === element.id ? "bg-pine text-white" : "bg-stone-100"}`}
                    onClick={() => setElementId(element.id)}
                  >
                    {element.elementKey}. {element.text}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
      <PdfViewer
        documentId={viewerDocument}
        highlight={
          active?.evidence
            ? { page: active.evidence.pageNumber, bbox: active.evidence.bbox }
            : null
        }
      />
      <aside className="overflow-auto border-l border-line bg-panel p-4">
        <h2 className="font-serif text-xl">Evidence</h2>
        <p className="mt-1 text-xs text-stone-500">Potentially relevant passages. Analyst review is required.</p>
        {elementId ? (
          <button
            className="mt-3 rounded bg-pine px-3 py-1 text-xs text-white"
            onClick={() => {
              void api(`/claim-elements/${elementId}/search`, { method: "POST" }).then(() =>
                setTimeout(() => void client.invalidateQueries({ queryKey: ["evidence", elementId] }), 2500),
              );
            }}
          >
            Search prior art
          </button>
        ) : null}
        <div className="mt-4 grid gap-3">
          {(evidence.data ?? []).map((item) => (
            <article key={item.id} className="rounded border border-line p-3 text-xs">
              <button className="text-left" onClick={() => setActive(item)}>
                <span className={`rounded px-2 py-0.5 ${STATUS_CLASS[item.displayRelationship] ?? "bg-stone-100"}`}>
                  {item.displayLabel}
                </span>
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
        </div>
      </aside>
    </div>
  );
}

function OverrideForm({ item, onSaved }: { item: EvidenceItem; onSaved: () => void }) {
  const save = useMutation({
    mutationFn: (body: { analystRelationship: string; analystNote: string }) =>
      api(`/evidence/${item.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: onSaved,
  });
  return (
    <form
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
      <button className="justify-self-start rounded border border-line px-2 py-1">Save analyst decision</button>
    </form>
  );
}
