"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-6">
      <form
        className="w-full rounded border border-line bg-panel p-8"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError(null);
          void api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
          })
            .then(() => router.push("/dashboard"))
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Sign in failed"));
        }}
      >
        <h1 className="font-serif text-3xl">Sign in</h1>
        <p className="mt-2 text-sm text-stone-600">Patent research workspace for analysts.</p>
        <label className="mt-6 block text-sm">
          Email
          <input name="email" type="email" required className="mt-1 w-full rounded border border-line px-3 py-2" />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input name="password" type="password" required className="mt-1 w-full rounded border border-line px-3 py-2" />
        </label>
        {error ? <p className="mt-3 text-sm text-rose-800">{error}</p> : null}
        <button className="mt-6 rounded bg-pine px-4 py-2 text-sm text-white">Continue</button>
        <p className="mt-4 text-sm">
          <Link href="/register" className="underline">Create an account</Link>
        </p>
      </form>
    </main>
  );
}
