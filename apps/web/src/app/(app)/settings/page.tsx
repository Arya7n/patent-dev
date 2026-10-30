"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/jobs";

type Runtime = {
  aiProvider: string;
  activeAiProvider: string;
  aiConfigured: boolean;
  chatModel: string;
  embeddingModel: string;
  storageProvider: string;
};

type Usage = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  documents: number;
};

export default function SettingsPage() {
  const runtime = useQuery({ queryKey: ["runtime"], queryFn: () => api<Runtime>("/runtime") });
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => api<Usage>("/usage") });
  const data = runtime.data;
  return (
    <main className="px-6 py-8 sm:px-8">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-pine">Workspace</p>
      <h1 className="mt-2 font-serif text-4xl">Settings</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">Provider status only. Secrets stay on the API and are never sent to the browser.</p>
      {runtime.isError ? <p className="mt-4 text-sm text-rose-800">{errorMessage(runtime.error, "Runtime status could not be loaded.")}</p> : null}
      <dl className="mt-6 grid max-w-lg gap-3 rounded-2xl border border-line bg-panel p-5 text-sm shadow-sm">
        <Row label="Requested AI provider" value={data?.aiProvider} />
        <Row label="Active AI provider" value={data?.activeAiProvider} />
        <Row label="Model configured" value={data ? (data.aiConfigured ? "Yes" : "No") : undefined} />
        <Row label="Chat model" value={data?.chatModel} />
        <Row label="Embedding model" value={data?.embeddingModel} />
        <Row label="Storage" value={data?.storageProvider} />
        <Row label="Model requests" value={usage.data ? usage.data.requests.toLocaleString() : undefined} />
        <Row label="Input tokens" value={usage.data ? usage.data.inputTokens.toLocaleString() : undefined} />
        <Row label="Output tokens" value={usage.data ? usage.data.outputTokens.toLocaleString() : undefined} />
        <Row label="Estimated cost" value={usage.data ? `$${Number(usage.data.estimatedCostUsd).toFixed(4)}` : undefined} />
      </dl>
      {data && !data.aiConfigured ? (
        <p className="mt-4 max-w-lg text-sm text-amber-800">
          No model key is active, so claim decomposition and evidence search use the local fallback. Add GEMINI_API_KEY to the API environment and restart it.
        </p>
      ) : null}
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right">{value ?? "—"}</dd>
    </div>
  );
}
