"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Runtime = {
  aiProvider: string;
  activeAiProvider: string;
  aiConfigured: boolean;
  chatModel: string;
  embeddingModel: string;
  storageProvider: string;
};

export default function SettingsPage() {
  const runtime = useQuery({ queryKey: ["runtime"], queryFn: () => api<Runtime>("/runtime") });
  const data = runtime.data;
  return (
    <main className="p-8">
      <h1 className="font-serif text-3xl">Settings</h1>
      <p className="mt-2 text-sm text-stone-600">Provider status only. Secrets stay on the API.</p>
      <dl className="mt-6 grid max-w-lg gap-3 text-sm">
        <Row label="Requested AI provider" value={data?.aiProvider} />
        <Row label="Active AI provider" value={data?.activeAiProvider} />
        <Row label="Model configured" value={data ? (data.aiConfigured ? "Yes" : "No") : undefined} />
        <Row label="Chat model" value={data?.chatModel} />
        <Row label="Embedding model" value={data?.embeddingModel} />
        <Row label="Storage" value={data?.storageProvider} />
      </dl>
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between border-b border-line py-2">
      <dt className="text-stone-500">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}
