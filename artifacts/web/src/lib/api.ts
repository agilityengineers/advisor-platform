import { getToken, setToken } from "./session";

/**
 * A path-based tenant (`/t/:slug/...`) sends its API calls as `/api/t/:slug/...`
 * so the server resolves the same company. Host-based tenants need no prefix.
 */
export function pathTenantSlug(pathname: string = window.location.pathname): string | null {
  const m = pathname.match(/^\/t\/([a-z0-9][a-z0-9-]*)(?:\/|$)/i);
  return m ? m[1].toLowerCase() : null;
}

export function apiBase(): string {
  const slug = pathTenantSlug();
  return slug ? `/api/t/${slug}` : "/api";
}

/** Prefix an in-app route with the tenant path base when running under /t/:slug. */
export function routeBase(): string {
  const slug = pathTenantSlug();
  return slug ? `/t/${slug}` : "";
}

export class ApiError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown> | null;
  constructor(status: number, message: string, data: Record<string, unknown> | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers, body });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const message = (obj?.error as string | undefined) ?? `Request failed (${res.status})`;
    if (res.status === 401 && token && path !== "/auth/login") setToken(null);
    throw new ApiError(res.status, message, obj);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
