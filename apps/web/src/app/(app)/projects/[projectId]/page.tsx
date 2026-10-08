"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { api } from "@/lib/api";
import type { PatentDocument, Project } from "@/lib/types";

export default function ProjectOverview({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api<Project>(`/projects/${projectId}`) });
  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api<PatentDocument[]>(`/projects/${projectId}/documents`),
  });
  return (
    <main className="p-8">
      <h1 className="font-serif text-4xl">{project.data?.name ?? "Project"}</h1>
      <p className="mt-2 text-sm text-stone-600">{project.data?.description || "No description yet."}</p>
      <p className="mt-6 text-sm">{documents.data?.length ?? 0} documents in this matter.</p>
    </main>
  );
}
