"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { api, apiBlob, downloadBlob } from "@/lib/api";
import { errorMessage, waitForJob } from "@/lib/jobs";
import type { Report } from "@/lib/types";

export default function ReportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const reports = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api<Report[]>(`/projects/${projectId}/reports`),
    refetchInterval: (query) =>
      query.state.data?.some((report) => report.status !== "completed" && report.status !== "failed") ? 2000 : false,
  });
  const create = useMutation({
    mutationFn: async (title: string) => {
      const created = await api<{ report: Report; jobId: string }>(`/projects/${projectId}/reports`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      await waitForJob(created.jobId);
      return created.report;
    },
    onSuccess: () => {
      setError(null);
      void client.invalidateQueries({ queryKey: ["reports", projectId] });
    },
    onError: (reason) => {
      setError(errorMessage(reason, "The report could not be generated"));
      void client.invalidateQueries({ queryKey: ["reports", projectId] });
    },
  });

  return (
    <main className="px-6 py-8 sm:px-8">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-pine">Export</p>
      <h1 className="mt-2 font-serif text-4xl">Reports</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-600">
        Exports describe potentially relevant evidence. They do not state that a patent is invalid or infringed.
      </p>
      <form
        className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-line bg-panel p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const title = String(data.get("title") ?? "").trim() || "Claim chart";
          create.mutate(title, { onSuccess: () => form.reset() });
        }}
      >
        <input name="title" placeholder="Report title" className="w-72 rounded border border-line bg-panel px-3 py-2 text-sm" />
        <button disabled={create.isPending} className="rounded bg-pine px-4 py-2 text-sm text-white">
          {create.isPending ? "Generating…" : "Generate report"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-rose-800">{error}</p> : null}
      {reports.isError ? <p className="mt-3 text-sm text-rose-800">{errorMessage(reports.error, "Reports could not be loaded.")}</p> : null}
      {reports.data?.length === 0 ? (
        <p className="mt-6 rounded border border-dashed border-line bg-panel px-4 py-8 text-sm text-stone-500">
          No reports yet. Generate one after the claim chart has evidence.
        </p>
      ) : null}
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
        {(reports.data ?? []).map((report) => {
          const ready = report.status === "completed";
          return (
            <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{report.title}</p>
                <p className="text-stone-500">{report.status === "completed" ? "Ready" : report.status === "failed" ? "Failed" : "Generating…"}</p>
                {report.error ? <p className="text-rose-800">{report.error}</p> : null}
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded border border-line px-3 py-1"
                  disabled={!ready || downloading === `${report.id}:docx`}
                  onClick={() => {
                    setDownloading(`${report.id}:docx`);
                    setError(null);
                    void apiBlob(`/reports/${report.id}/download?format=docx`)
                      .then((blob) => downloadBlob(blob, `${report.title}.docx`))
                      .catch((reason: unknown) => setError(errorMessage(reason, "DOCX download failed")))
                      .finally(() => setDownloading(null));
                  }}
                >
                  DOCX
                </button>
                <button
                  className="rounded border border-line px-3 py-1"
                  disabled={!ready || downloading === `${report.id}:pdf`}
                  onClick={() => {
                    setDownloading(`${report.id}:pdf`);
                    setError(null);
                    void apiBlob(`/reports/${report.id}/download?format=pdf`)
                      .then((blob) => downloadBlob(blob, `${report.title}.pdf`))
                      .catch((reason: unknown) => setError(errorMessage(reason, "PDF download failed")))
                      .finally(() => setDownloading(null));
                  }}
                >
                  PDF
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
