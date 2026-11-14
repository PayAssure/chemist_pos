export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth:unauthorized"));
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new ApiError(body.error ?? "Request failed", response.status, body.code);
  }
  return body;
}
