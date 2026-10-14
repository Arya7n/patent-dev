"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import type { Profile } from "@/lib/types";

const links = [
  ["/dashboard", "Dashboard", "Overview of matters and model use"],
  ["/projects", "Projects", "Target patents and claim charts"],
  ["/settings", "Settings", "Provider and usage"],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Profile>("/auth/me"),
    retry: false,
  });

  const signedOut = profile.error instanceof ApiError && profile.error.status === 401;

  useEffect(() => {
    if (signedOut) router.replace("/login");
  }, [router, signedOut]);

  if (profile.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-stone-500">
        Loading workspace…
      </main>
    );
  }
  if (profile.isError && !signedOut) {
    return (
      <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6">
        <div className="rounded-2xl border border-line bg-panel p-8 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-pine">Patent desk</p>
          <h1 className="mt-3 font-serif text-3xl">Workspace unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            The API at {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"} did not respond. Start it with{" "}
            <code className="rounded bg-stone-200 px-1">pnpm dev:api</code> and reload this page. If the API is already up, Docker and Postgres need to be running too.
          </p>
        </div>
      </main>
    );
  }
  if (signedOut) return <main className="grid min-h-screen place-items-center text-sm text-stone-500">Redirecting to sign in…</main>;

  const name = profile.data?.user?.name ?? "Analyst";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen">
      <div className="border-b border-[#17382c] bg-[#1f4b3a] px-6 py-2 text-center text-xs tracking-wide text-emerald-50">
        Research assistance only. This workspace does not decide invalidity, infringement, or patentability.
      </div>
      <div className="grid min-h-[calc(100vh-34px)] grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-[#2a241c] bg-[#1c1915] px-4 py-5 text-stone-100 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1f4b3a] font-serif text-lg text-emerald-50">P</span>
            <span>
              <span className="block font-serif text-lg leading-none">Patent desk</span>
              <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-stone-500">Claim charts</span>
            </span>
          </div>
          <nav className="mt-8 grid gap-1">
            {links.map(([href, label, hint]) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-xl px-3 py-2 ${active ? "bg-white/10 text-white" : "text-stone-300 hover:bg-white/5"}`}
                >
                  <span className="block text-sm">{label}</span>
                  <span className="block text-[11px] text-stone-500">{hint}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3 md:mt-auto">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#b0894a] text-sm font-medium text-[#1c1915]">{initial}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{name}</span>
              <span className="block truncate text-[11px] text-stone-500">{profile.data?.organization?.name}</span>
            </span>
            <button
              className="text-xs text-stone-400 hover:text-white"
              onClick={() => {
                void api("/auth/logout", { method: "POST" }).then(() => router.push("/login"));
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
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
    <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-[#fffcf7]/95 px-4 py-2 backdrop-blur">
      {items.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${pathname === href ? "bg-[#1f4b3a] text-white shadow-sm" : "text-stone-600 hover:bg-stone-100"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
