"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/jobs";
import { documentRoleLabel, documentStatusLabel, isSearchableReference } from "@/lib/labels";
import type { Claim, PatentDocument, Project, Report } from "@/lib/types";

export default function ProjectOverview({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api<Project>(`/projects/${projectId}`) });
  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api<PatentDocument[]>(`/projects/${projectId}/documents`),
  });
  const claims = useQuery({
    queryKey: ["claims", projectId],
    queryFn: () => api<Claim[]>(`/projects/${projectId}/claims`),
  });
  const reports = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api<Report[]>(`/projects/${projectId}/reports`),
  });
  const docs = documents.data ?? [];
  const targetReady = docs.some((document) => document.role === "target" && document.status === "completed");
  const priorReady = docs.some((document) => isSearchableReference(document));
  const reportReady = (reports.data ?? []).some((report) => report.status === "completed");
  const claimCount = claims.data?.length ?? 0;
  const elementCount = (claims.data ?? []).reduce((sum, claim) => sum + claim.elements.length, 0);
  const steps = [
    { done: docs.some((document) => document.role === "target"), label: "Upload the target patent", href: `/projects/${projectId}/documents` },
    { done: targetReady, label: "Process the target patent", href: `/projects/${projectId}/documents` },
    { done: priorReady, label: "Upload and process prior art or a reference", href: `/projects/${projectId}/documents` },
    { done: claimCount > 0, label: "Identify claims", href: `/projects/${projectId}/claims` },
    { done: elementCount > 0, label: "Decompose claims into elements", href: `/projects/${projectId}/claims` },
    { done: reportReady, label: "Review the claim chart and export a report", href: reportReady ? `/projects/${projectId}/reports` : `/projects/${projectId}/claim-chart` },
  ];

  return (
    <main className="p-8">
      {project.isError ? <p className="text-sm text-rose-800">{errorMessage(project.error, "This project could not be loaded.")}</p> : null}
      <h1 className="font-serif text-4xl">{project.data?.name ?? (project.isLoading ? "Loading…" : "Project")}</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-600">{project.data?.description || "No description yet."}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Documents" value={documents.data ? String(docs.length) : "—"} />
        <Stat label="Claims" value={claims.data ? String(claimCount) : "—"} />
        <Stat label="Elements" value={claims.data ? String(elementCount) : "—"} />
      </div>
      <ol className="mt-8 grid max-w-xl gap-2">
        {steps.map((step, index) => (
          <li key={step.label}>
            <Link href={step.href} className="flex items-center gap-3 rounded border border-line bg-panel px-4 py-3 text-sm hover:bg-stone-50">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${step.done ? "bg-pine text-white" : "bg-stone-200 text-stone-700"}`}>
                {index + 1}
              </span>
              <span>{step.label}</span>
            </Link>
          </li>
        ))}
      </ol>
      <ul className="mt-8 grid max-w-xl gap-2 text-sm">
        {docs.map((document) => (
          <li key={document.id} className="flex justify-between rounded border border-line bg-panel px-4 py-2">
            <span>{document.title || document.originalFilename}</span>
            <span className="text-stone-500">{documentRoleLabel(document.role)} · {documentStatusLabel(document.status)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 font-serif text-2xl">{value}</p>
    </div>
  );
}
