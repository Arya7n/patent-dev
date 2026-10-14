"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { HighlightedText } from "@/components/highlighted-text";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/jobs";
import { STATUS_CLASS, type ClaimChart } from "@/lib/types";

type Evidence = ClaimChart["cells"][number]["evidence"][number];

export default function ClaimChartPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const chart = useQuery({
    queryKey: ["chart", projectId],
    queryFn: () => api<ClaimChart>(`/projects/${projectId}/claim-chart`),
  });
  const data = chart.data;
  const claimNumbers = [...new Set((data?.elements ?? []).map((element) => element.claimNumber))];

  return (
    <main className="px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-pine">Mapping</p>
          <h1 className="mt-2 font-serif text-4xl">Claim chart</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-600">{data?.disclaimer}</p>
        </div>
        <Link href={`/projects/${projectId}/reports`} className="rounded bg-pine px-4 py-2 text-sm text-white">
          Export report
        </Link>
      </div>
      {chart.isError ? <p className="mt-4 text-sm text-rose-800">{errorMessage(chart.error, "The claim chart could not be loaded.")}</p> : null}
      {data && data.elements.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">Decompose at least one claim before this chart has rows.</p>
      ) : null}
      {data ? (
        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <header className="grid gap-4 border-b border-line p-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500">Patent / matter</p>
              <p className="mt-1 font-medium text-[#0070C0]">{data.targetTitle || data.projectName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500">References</p>
              {data.priorArt.length === 0 ? <p className="mt-1 text-sm text-stone-500">Process a prior-art or reference PDF to fill the mapping column.</p> : null}
              <ol className="mt-1 list-decimal pl-5 text-sm">
                {data.priorArt.map((document) => (
                  <li key={document.id}>{document.title}</li>
                ))}
              </ol>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#1F4B3A] text-white">
                  <th className="w-1/2 border border-[#1F4B3A] p-3 text-left font-medium">Claims</th>
                  <th className="w-1/2 border border-[#1F4B3A] p-3 text-left font-medium">Mapping</th>
                </tr>
              </thead>
              <tbody>
                {claimNumbers.map((claimNumber) => {
                  const elements = (data.elements ?? []).filter((element) => element.claimNumber === claimNumber);
                  const preamble = isPreamble(elements[0]?.text ?? "");
                  return (
                    <Fragment key={claimNumber}>
                      {elements.map((element, index) => (
                        <tr key={element.id}>
                          <td className="border border-line p-3 align-top">
                            <p className="font-medium text-[#0070C0]">
                              {preamble && index === 0 ? `Claim ${claimNumber}` : `Clause ${preamble ? index : index + 1}`}
                            </p>
                            <p className="mt-2 leading-6">
                              <HighlightedText
                                text={element.text}
                                alignments={data.priorArt.flatMap((document) => bestEvidence(data, element.id, document.id)?.alignments ?? [])}
                                field="claimPhrase"
                              />
                            </p>
                          </td>
                          <td className="border border-line p-3 align-top">
                            {data.priorArt.length === 0 ? <p className="text-stone-500">No reference documents were available.</p> : null}
                            <div className="grid gap-4">
                              {data.priorArt.map((document) => {
                                const cell = data.cells.find((item) => item.elementId === element.id && item.documentId === document.id);
                                const evidence = bestEvidence(data, element.id, document.id);
                                return (
                                  <article key={document.id}>
                                    <p className="font-medium text-[#0070C0]">{document.title}</p>
                                    {cell ? (
                                      <p className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${STATUS_CLASS[cell.relationship] ?? "bg-stone-100"}`}>
                                        {cell.label}
                                      </p>
                                    ) : null}
                                    {evidence ? (
                                      <>
                                        <p className="mt-2 leading-6">
                                          <HighlightedText text={evidence.text} alignments={evidence.alignments ?? []} field="sourcePhrase" />
                                        </p>
                                        <p className="mt-1 text-xs text-stone-500">Page {evidence.pageNumber}</p>
                                        <p className="mt-2 text-stone-700">{evidence.explanation}</p>
                                        {evidence.analystNote ? <p className="mt-2 text-xs">Analyst note: {evidence.analystNote}</p> : null}
                                      </>
                                    ) : (
                                      <p className="mt-2 text-stone-500">No corresponding passage was identified.</p>
                                    )}
                                  </article>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function isPreamble(text: string): boolean {
  const trimmed = text.trim();
  if (/^(receiving|camping|determining|transmitting|performing|sending|selecting|monitoring|applying)\b/i.test(trimmed)) return false;
  return /comprising|processing means|storage unit|program code/i.test(trimmed);
}

function bestEvidence(chart: ClaimChart, elementId: string, documentId: string): Evidence | null {
  const cell = chart.cells.find((item) => item.elementId === elementId && item.documentId === documentId);
  const ranked = [...(cell?.evidence ?? [])].sort((a, b) => b.confidence - a.confidence);
  return ranked[0] ?? null;
}
