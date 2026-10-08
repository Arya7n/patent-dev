"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

export default function DashboardPage() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: () => api<{ requests: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number; documents: number }>("/usage"),
  });
  return (
    <main className="p-8">
      <h1 className="font-serif text-4xl">Dashboard</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-600">
        Projects, documents, and model usage for this organization. Evidence labels stay provisional until an analyst confirms them.
      </p>
      <div className="mt-6 grid grid-cols-4 gap-3">
        <Stat label="Projects" value={projects.data?.length ?? "—"} />
        <Stat label="Documents" value={usage.data?.documents ?? "—"} />
        <Stat label="Model requests" value={usage.data?.requests ?? "—"} />
        <Stat label="Estimated cost" value={usage.data ? `$${usage.data.estimatedCostUsd.toFixed(4)}` : "—"} />
      </div>
      <div className="mt-8">
        <Link href="/projects" className="text-sm underline">Open projects</Link>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 font-serif text-2xl">{value}</p>
    </div>
  );
}
