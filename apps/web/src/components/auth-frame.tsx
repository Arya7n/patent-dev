import type { ReactNode } from "react";
import Link from "next/link";

export function AuthFrame({
  title,
  lede,
  alternate,
  children,
}: {
  title: string;
  lede: string;
  alternate: { href: string; label: string; prompt: string };
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,32rem)]">
      <section className="relative hidden overflow-hidden bg-[#1c1915] px-12 py-14 text-stone-100 lg:block">
        <div className="absolute -left-16 top-10 h-56 w-56 rounded-full bg-[#1f4b3a]/70 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#b0894a]/25 blur-3xl" />
        <div className="relative max-w-lg">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#d7c4a3]">Patent desk</p>
          <h2 className="mt-6 font-serif text-5xl leading-tight">Map a claim to the passage that supports it.</h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-stone-300">
            Upload a patent and the references beside it. The workspace splits claims into clauses, highlights corresponding phrases, and exports a two-column chart for analyst review.
          </p>
          <ol className="mt-10 grid gap-3 text-sm text-stone-300">
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">1. Process the target patent and the references.</li>
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">2. Identify claims and decompose them into clauses.</li>
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">3. Review the colored mapping and export Word or PDF.</li>
          </ol>
        </div>
      </section>
      <section className="grid place-items-center px-6 py-12">
        <div className="w-full max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-pine lg:hidden">Patent desk</p>
          <h1 className="mt-2 font-serif text-4xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">{lede}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-sm text-stone-600">
            {alternate.prompt}{" "}
            <Link href={alternate.href} className="font-medium text-pine underline decoration-pine/30 underline-offset-4">
              {alternate.label}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
