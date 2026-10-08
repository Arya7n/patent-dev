"use client";

import { useQuery } from "@tanstack/react-query";
import { use, useState } from "react";
import { api } from "@/lib/api";
import { STATUS_CLASS, type ClaimChart } from "@/lib/types";

export default function ClaimChartPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [selected, setSelected] = useState<ClaimChart["cells"][number] | null>(null);
  const chart = useQuery({
    queryKey: ["chart", projectId],
    queryFn: () => api<ClaimChart>(`/projects/${projectId}/claim-chart`),
  });
  const data = chart.data;
  return (
    <main className="grid h-[calc(100vh-92px)] grid-cols-[1fr_320px]">
      <div className="overflow-auto p-6">
        <h1 className="font-serif text-3xl">Claim chart</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-600">{data?.disclaimer}</p>
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-line bg-panel p-2 text-left">Element</th>
              {(data?.priorArt ?? []).map((document) => (
                <th key={document.id} className="border border-line bg-panel p-2 text-left">{document.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.elements ?? []).map((element) => (
              <tr key={element.id}>
                <td className="border border-line p-2 align-top">
                  <span className="font-medium">{element.key}</span>
                  <p className="text-xs text-stone-600">{element.text}</p>
                </td>
                {(data?.priorArt ?? []).map((document) => {
                  const cell = data?.cells.find((item) => item.elementId === element.id && item.documentId === document.id);
                  return (
                    <td key={document.id} className="border border-line p-2 align-top">
                      <button
                        className={`rounded px-2 py-1 text-xs ${STATUS_CLASS[cell?.relationship ?? "no_evidence"]}`}
                        onClick={() => cell && setSelected(cell)}
                      >
                        {cell?.label ?? "No evidence identified"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="overflow-auto border-l border-line bg-panel p-4">
        <h2 className="font-serif text-xl">Cell</h2>
        {selected ? (
          <div className="mt-3 grid gap-3 text-sm">
            {(selected.evidence ?? []).map((item, index) => (
              <article key={`${item.evidenceId ?? index}`} className="rounded border border-line p-3">
                <p className="text-xs text-stone-500">Page {item.pageNumber}</p>
                <p className="mt-2">{item.text}</p>
                <p className="mt-2 text-stone-600">{item.explanation}</p>
                {item.analystNote ? <p className="mt-2 text-xs">Note: {item.analystNote}</p> : null}
              </article>
            ))}
            {selected.evidence.length === 0 ? <p className="text-sm text-stone-500">No quoted passage for this cell.</p> : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Select a cell to read the supporting passage.</p>
        )}
      </aside>
    </main>
  );
}
