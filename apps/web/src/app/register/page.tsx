"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <AuthFrame
      title="Create a workspace"
      lede="The first account becomes the organization owner."
      alternate={{ href: "/login", label: "Sign in", prompt: "Already registered?" }}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError(null);
          setPending(true);
          void api("/auth/register", {
            method: "POST",
            body: JSON.stringify({
              name: data.get("name"),
              organizationName: data.get("organizationName"),
              email: data.get("email"),
              password: data.get("password"),
            }),
          })
            .then(() => router.push("/dashboard"))
            .catch((reason: unknown) => {
              setPending(false);
              setError(reason instanceof Error ? reason.message : "Could not create the account");
            });
        }}
      >
        <label className="block text-sm">
          Name
          <input name="name" required autoComplete="name" maxLength={120} className="mt-1 w-full px-3 py-2.5" />
        </label>
        <label className="block text-sm">
          Organization
          <input name="organizationName" required autoComplete="organization" maxLength={160} className="mt-1 w-full px-3 py-2.5" />
        </label>
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={320}
            aria-invalid={error ? true : undefined}
            className="mt-1 w-full px-3 py-2.5"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            maxLength={200}
            required
            autoComplete="new-password"
            aria-invalid={error ? true : undefined}
            className="mt-1 w-full px-3 py-2.5"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        <button disabled={pending} className="mt-2 bg-pine px-4 py-2.5 text-sm text-white">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthFrame>
  );
}
