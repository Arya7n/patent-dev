"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/jobs";
import { formatWhen } from "@/lib/labels";
import type { Project } from "@/lib/types";

export default function DashboardPage() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: () => api<{ requests: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number; documents: number }>("/usage"),
  });
  return (
    <main className="px-6 py-8 sm:px-8">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-pine">Workspace</p>
      <h1 className="mt-2 font-serif text-4xl">Dashboard</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        Projects, documents, and model usage for this organization. Evidence labels stay provisional until an analyst confirms them.
      </p>
      {projects.isError || usage.isError ? (
        <p className="mt-4 text-sm text-rose-800">{errorMessage(projects.error ?? usage.error, "Dashboard data could not be loaded.")}</p>
      ) : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Projects" value={projects.data?.length ?? "—"} />
        <Stat label="Documents" value={usage.data?.documents ?? "—"} />
        <Stat label="Model requests" value={usage.data?.requests ?? "—"} />
        <Stat label="Estimated cost" value={usage.data ? `$${Number(usage.data.estimatedCostUsd).toFixed(4)}` : "—"} />
      </div>
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-serif text-2xl">Recent projects</h2>
        <Link href="/projects" className="text-sm underline">All projects</Link>
      </div>
      {projects.data?.length === 0 ? <p className="mt-4 text-sm text-stone-500">Create a project to start a matter.</p> : null}
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
        {(projects.data ?? []).slice(0, 6).map((project) => (
          <li key={project.id}>
            <Link href={`/projects/${project.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[#faf7f1]">
              <span>
                <span className="block font-medium">{project.name}</span>
                <span className="block text-sm text-stone-500">{project.description || "No description"}</span>
              </span>
              <span className="text-xs text-stone-400">{formatWhen(project.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
    </div>
  );
}
