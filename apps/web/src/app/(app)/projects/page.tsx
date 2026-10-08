"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const client = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
  const create = useMutation({
    mutationFn: (name: string) => api<Project>("/projects", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["projects"] }),
  });
  return (
    <main className="p-8">
      <h1 className="font-serif text-4xl">Projects</h1>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const name = String(data.get("name") ?? "").trim();
          if (name) create.mutate(name);
          event.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="New matter name" className="w-80 rounded border border-line px-3 py-2" />
        <button className="rounded bg-pine px-4 py-2 text-sm text-white">Create project</button>
      </form>
      <ul className="mt-6 divide-y divide-line rounded border border-line bg-panel">
        {(projects.data ?? []).map((project) => (
          <li key={project.id}>
            <Link href={`/projects/${project.id}`} className="block px-4 py-3 hover:bg-stone-50">
              <span className="font-medium">{project.name}</span>
              {project.description ? <span className="ml-3 text-sm text-stone-500">{project.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
