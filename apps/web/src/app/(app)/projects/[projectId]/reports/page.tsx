"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use } from "react";
import { api, apiBlob, downloadBlob } from "@/lib/api";
import type { Report } from "@/lib/types";

export default function ReportsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const client = useQueryClient();
  const reports = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api<Report[]>(`/projects/${projectId}/reports`),
  });
  const create = useMutation({
    mutationFn: () => api(`/projects/${projectId}/reports`, { method: "POST", body: JSON.stringify({ title: "Claim chart" }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["reports", projectId] }),
  });
  return (
    <main className="p-8">
      <h1 className="font-serif text-3xl">Reports</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-600">
        Exports describe potentially relevant evidence. They do not state that a patent is invalid or infringed.
      </p>
      <button className="mt-4 rounded bg-pine px-4 py-2 text-sm text-white" onClick={() => create.mutate()}>
        Generate report
      </button>
      <ul className="mt-6 divide-y divide-line rounded border border-line bg-panel">
        {(reports.data ?? []).map((report) => (
          <li key={report.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{report.title}</p>
              <p className="text-stone-500">{report.status}</p>
              {report.error ? <p className="text-rose-800">{report.error}</p> : null}
            </div>
            <div className="flex gap-2">
              <button
                className="rounded border border-line px-3 py-1"
                onClick={() => {
                  void apiBlob(`/reports/${report.id}/download?format=docx`).then((blob) => downloadBlob(blob, `${report.title}.docx`));
                }}
              >
                DOCX
              </button>
              <button
                className="rounded border border-line px-3 py-1"
                onClick={() => {
                  void apiBlob(`/reports/${report.id}/download?format=pdf`).then((blob) => downloadBlob(blob, `${report.title}.pdf`));
                }}
              >
                PDF
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
