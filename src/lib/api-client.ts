export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const res = await fetch(path, {
    method: options.method ?? (hasBody ? "POST" : "GET"),
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth/login") {
    window.location.href = "/login"; // session expired or logged out in another tab
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "ERROR", data?.error?.message ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
