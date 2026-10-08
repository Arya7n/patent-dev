const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function messageFrom(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("message" in payload)) return fallback;
  const message = payload.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map(String).join(", ");
  return fallback;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(messageFrom(payload, response.statusText), response.status);
  }
  return response.json() as Promise<T>;
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(`${base}${path}`, { credentials: "include" });
  if (!response.ok) throw new ApiError("Download failed", response.status);
  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
