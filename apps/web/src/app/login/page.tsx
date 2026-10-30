"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AuthFrame
      title="Sign in"
      lede="Open the matters already in this workspace."
      alternate={{ href: "/register", label: "Create an account", prompt: "New here?" }}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError(null);
          setPending(true);
          void api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
          })
            .then(() => router.push("/dashboard"))
            .catch((reason: unknown) => {
              setPending(false);
              setError(reason instanceof Error ? reason.message : "Sign in failed");
            });
        }}
      >
        <label className="block text-sm">
          Email
          <input name="email" type="email" autoComplete="email" required className="mt-1 w-full px-3 py-2.5" />
        </label>
        <label className="block text-sm">
          Password
          <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full px-3 py-2.5" />
        </label>
        {error ? <p className="text-sm text-rose-800">{error}</p> : null}
        <button disabled={pending} className="mt-2 bg-pine px-4 py-2.5 text-sm text-white">
          {pending ? "Signing in…" : "Continue"}
        </button>
      </form>
    </AuthFrame>
  );
}
