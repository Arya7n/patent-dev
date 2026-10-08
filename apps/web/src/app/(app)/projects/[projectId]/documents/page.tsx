"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { api } from "@/lib/api";
import type { Job, PatentDocument } from "@/lib/types";

export default function DocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api<PatentDocument[]>(`/projects/${projectId}/documents`),
  });
  const upload = useMutation({
    mutationFn: async (form: FormData) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/projects/${projectId}/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!response.ok) throw new Error("Upload failed");
      return response.json() as Promise<PatentDocument>;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["documents", projectId] }),
  });

  return (
    <main className="p-8">
      <h1 className="font-serif text-3xl">Documents</h1>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          upload.mutate(data);
        }}
      >
        <label className="text-sm">
          Role
          <select name="role" className="mt-1 block rounded border border-line px-3 py-2">
            <option value="target">Target patent</option>
            <option value="prior_art">Prior art</option>
            <option value="reference">Reference</option>
          </select>
        </label>
        <input name="file" type="file" accept="application/pdf" required className="text-sm" />
        <button className="rounded bg-pine px-4 py-2 text-sm text-white">Upload</button>
      </form>
      {message ? <p className="mt-3 text-sm text-stone-600">{message}</p> : null}
      <ul className="mt-6 divide-y divide-line rounded border border-line bg-panel">
        {(documents.data ?? []).map((document) => (
          <li key={document.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{document.title || document.originalFilename}</p>
              <p className="text-stone-500">{document.role} · {document.status}{document.pageCount ? ` · ${document.pageCount} pages` : ""}</p>
              {document.error ? <p className="text-amber-800">{document.error}</p> : null}
            </div>
            <button
              className="rounded border border-line px-3 py-1"
              onClick={() => {
                void api<{ jobId: string }>(`/documents/${document.id}/process`, { method: "POST" }).then(async (job) => {
                  setMessage("Processing queued.");
                  for (let attempt = 0; attempt < 30; attempt += 1) {
                    const status = await api<Job | null>(`/jobs/${job.jobId}`);
                    if (!status || status.status === "completed" || status.status === "failed") break;
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                  }
                  void client.invalidateQueries({ queryKey: ["documents", projectId] });
                });
              }}
            >
              Process
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
