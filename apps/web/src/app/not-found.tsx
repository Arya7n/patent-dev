import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md rounded-2xl border border-line bg-panel p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-pine">Patent desk</p>
        <h1 className="mt-3 font-serif text-3xl">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">That address is not part of this workspace.</p>
        <Link href="/dashboard" className="mt-6 inline-block bg-pine px-4 py-2.5 text-sm text-white">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
