"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/jobs";
import { formatWhen } from "@/lib/labels";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const router = useRouter();
  const client = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const create = useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      api<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/projects/${project.id}`);
    },
  });
  return (
    <main className="p-8">
      <h1 className="font-serif text-4xl">Projects</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-600">Each project holds one target patent, the prior art you compare it with, and the claim chart.</p>
      <form
        className="mt-6 grid max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const name = String(data.get("name") ?? "").trim();
          const description = String(data.get("description") ?? "").trim();
          if (name) create.mutate({ name, description });
        }}
      >
        <input name="name" required placeholder="Matter name" className="rounded border border-line bg-panel px-3 py-2" />
        <input name="description" placeholder="Short description (optional)" className="rounded border border-line bg-panel px-3 py-2" />
        <button disabled={create.isPending} className="justify-self-start rounded bg-pine px-4 py-2 text-sm text-white">
          {create.isPending ? "Creating…" : "Create project"}
        </button>
      </form>
      {create.isError ? <p className="mt-3 text-sm text-rose-800">{errorMessage(create.error, "Could not create the project")}</p> : null}
      {projects.isError ? <p className="mt-4 text-sm text-rose-800">{errorMessage(projects.error, "Projects could not be loaded.")}</p> : null}
      {projects.isLoading ? <p className="mt-6 text-sm text-stone-500">Loading projects…</p> : null}
      {projects.data?.length === 0 ? (
        <p className="mt-6 rounded border border-dashed border-line bg-panel px-4 py-8 text-sm text-stone-500">No projects yet.</p>
      ) : null}
      <ul className="mt-6 divide-y divide-line rounded border border-line bg-panel">
        {(projects.data ?? []).map((project) => (
          <li key={project.id}>
            <Link href={`/projects/${project.id}`} className="block px-4 py-3 hover:bg-stone-50">
              <span className="font-medium">{project.name}</span>
              <span className="mt-1 block text-sm text-stone-500">{project.description || "No description"}</span>
              <span className="mt-1 block text-xs text-stone-400">{formatWhen(project.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
