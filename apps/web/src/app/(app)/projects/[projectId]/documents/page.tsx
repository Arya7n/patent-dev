"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage, waitForJob } from "@/lib/jobs";
import { documentRoleLabel, documentStatusLabel, isDocumentBusy } from "@/lib/labels";
import type { PatentDocument } from "@/lib/types";

export default function DocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api<PatentDocument[]>(`/projects/${projectId}/documents`),
    refetchInterval: (query) => (query.state.data?.some((document) => isDocumentBusy(document.status)) ? 2000 : false),
  });
  const upload = useMutation({
    mutationFn: (form: FormData) => api<PatentDocument>(`/projects/${projectId}/documents`, { method: "POST", body: form }),
    onSuccess: () => {
      setError(null);
      setMessage("Upload saved. Process it to extract text and prepare search.");
      void client.invalidateQueries({ queryKey: ["documents", projectId] });
    },
    onError: (reason) => setError(errorMessage(reason, "Upload failed")),
  });

  return (
    <main className="p-8">
      <h1 className="font-serif text-3xl">Documents</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-600">
        Upload the target patent and the prior art you want to compare. Processing reads the PDF, splits it into passages, and indexes those passages.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setMessage(null);
          setError(null);
          upload.mutate(data, { onSuccess: () => form.reset() });
        }}
      >
        <label className="text-sm">
          Role
          <select name="role" className="mt-1 block rounded border border-line bg-panel px-3 py-2">
            <option value="target">Target patent</option>
            <option value="prior_art">Prior art</option>
            <option value="reference">Reference</option>
          </select>
        </label>
        <input name="file" type="file" accept="application/pdf,.pdf" required className="text-sm" />
        <button disabled={upload.isPending} className="rounded bg-pine px-4 py-2 text-sm text-white">
          {upload.isPending ? "Uploading…" : "Upload"}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-stone-600">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-800">{error}</p> : null}
      {documents.isError ? (
        <p className="mt-4 text-sm text-rose-800">{errorMessage(documents.error, "Documents could not be loaded.")}</p>
      ) : null}
      {documents.data?.length === 0 ? (
        <p className="mt-6 rounded border border-dashed border-line bg-panel px-4 py-8 text-sm text-stone-500">
          No documents yet. Start with the target patent PDF.
        </p>
      ) : null}
      <ul className="mt-6 divide-y divide-line rounded border border-line bg-panel">
        {(documents.data ?? []).map((document) => (
          <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{document.title || document.originalFilename}</p>
              <p className="text-stone-500">
                {documentRoleLabel(document.role)} · {documentStatusLabel(document.status)}
                {document.pageCount ? ` · ${document.pageCount} pages` : ""}
              </p>
              {document.error ? <p className="mt-1 text-amber-800">{document.error}</p> : null}
              {document.status === "ocr_required" ? (
                <p className="mt-1 text-amber-800">This PDF has too little text. Install Tesseract and Ghostscript, then process it again.</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              {document.role === "target" && document.status === "completed" ? (
                <Link href={`/projects/${projectId}/claims`} className="rounded border border-line px-3 py-1">
                  Review claims
                </Link>
              ) : null}
              <button
                className="rounded border border-line px-3 py-1"
                disabled={busyId === document.id || isDocumentBusy(document.status)}
                onClick={() => {
                  setBusyId(document.id);
                  setError(null);
                  setMessage(`Processing ${document.originalFilename}…`);
                  void api<{ jobId: string }>(`/documents/${document.id}/process`, { method: "POST" })
                    .then((job) => waitForJob(job.jobId))
                    .then(() => {
                      setMessage(`${document.originalFilename} is ready.`);
                      void client.invalidateQueries({ queryKey: ["documents", projectId] });
                    })
                    .catch((reason: unknown) => {
                      setMessage(null);
                      setError(errorMessage(reason, "Processing failed"));
                      void client.invalidateQueries({ queryKey: ["documents", projectId] });
                    })
                    .finally(() => setBusyId(null));
                }}
              >
                {busyId === document.id || isDocumentBusy(document.status) ? "Processing…" : "Process"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
