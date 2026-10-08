"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";

const links = [
  ["/dashboard", "Dashboard"],
  ["/projects", "Projects"],
  ["/settings", "Settings"],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Profile>("/auth/me"),
    retry: false,
  });

  if (profile.isLoading) return <main className="p-8 text-sm text-stone-500">Loading workspace…</main>;
  if (profile.isError) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-line bg-pine px-6 py-2 text-center text-xs text-emerald-50">
        AI output is research assistance. It is not a determination of invalidity, infringement, or patentability.
      </div>
      <div className="grid min-h-[calc(100vh-32px)] grid-cols-[220px_1fr]">
        <aside className="border-r border-line bg-ink px-4 py-6 text-stone-100">
          <p className="font-serif text-xl">Patent desk</p>
          <p className="mt-1 text-xs text-stone-400">{profile.data?.organization?.name}</p>
          <nav className="mt-8 grid gap-1">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`rounded px-3 py-2 text-sm ${pathname.startsWith(href) ? "bg-white/10" : "text-stone-300"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            className="mt-8 text-xs text-stone-400"
            onClick={() => {
              void api("/auth/logout", { method: "POST" }).then(() => router.push("/login"));
            }}
          >
            Sign out
          </button>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const items = [
    [`/projects/${projectId}`, "Overview"],
    [`/projects/${projectId}/documents`, "Documents"],
    [`/projects/${projectId}/claims`, "Claims"],
    [`/projects/${projectId}/claim-chart`, "Claim chart"],
    [`/projects/${projectId}/reports`, "Reports"],
  ];
  return (
    <div className="flex gap-2 border-b border-line bg-panel px-6 py-3">
      {items.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={`rounded-full px-3 py-1 text-sm ${pathname === href ? "bg-pine text-white" : "text-stone-600"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
