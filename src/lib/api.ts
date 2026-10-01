export const PLUGIN_SLUG = "care_onboarding_fe";
let activeScope: AbortController | undefined;

export function openRequestScope(): () => void {
  activeScope?.abort();
  const scope = new AbortController();
  activeScope = scope;
  return () => {
    scope.abort();
    if (activeScope === scope) activeScope = undefined;
  };
}

export function requestScope(): AbortSignal | undefined {
  return activeScope?.signal;
}

declare global {
  interface Window {
    CARE_API_URL?: string;
    __CARE_PLUGIN_RUNTIME__?: {
      meta: Record<string, { config?: { api_url?: string; redirect_after_login?: boolean } }>;
    };
  }
}

export function apiBase(): string {
  const configured = window.__CARE_PLUGIN_RUNTIME__?.meta[PLUGIN_SLUG]?.config?.api_url
    ?? window.CARE_API_URL
    ?? window.location.origin;
  const url = new URL(configured || window.location.origin, window.location.origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("The CARE connection is not configured correctly. Please contact your administrator.");
  }
  return url.href.replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(public status: number, public detail: string, public method: string, public path: string,
    public fieldErrors: Record<string, string> = {}) {
    super(
      status === 401 ? "Your session has expired. Sign in to CARE again, then return here to continue."
        : status === 403 ? "Your account does not have permission to complete this action."
        : status === 0 ? "We could not reach CARE. Check your connection, then try again."
        : "CARE could not save this item. Please try again. If this continues, contact your administrator.",
    );
  }
}

function validationFields(body: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!body || typeof body !== "object") return fields;
  const data = body as Record<string, unknown>;
  const errors = Array.isArray(body) ? body : data.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (!item || typeof item !== "object") continue;
      const error = item as Record<string, unknown>;
      const field = Array.isArray(error.loc) ? error.loc.find((key) => typeof key === "string" && key !== "body") : undefined;
      if (typeof field === "string" && typeof error.msg === "string") fields[field] = error.msg;
    }
  } else {
    for (const [key, value] of Object.entries(data)) {
      if (["detail", "non_field_errors"].includes(key)) continue;
      if (typeof value === "string") fields[key] = value;
      else if (Array.isArray(value) && value.every((item) => typeof item === "string")) fields[key] = value.join(" ");
    }
  }
  return fields;
}

function describe(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  if (!body || typeof body !== "object") return "";
  const data = body as Record<string, unknown>;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.errors)) {
    return data.errors.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const error = item as Record<string, unknown>;
      const location = Array.isArray(error.loc) ? error.loc.join(".") : "";
      return typeof error.msg === "string" ? `${location}: ${error.msg}` : "";
    }).filter(Boolean).join("; ");
  }
  return Object.entries(data).filter(([key]) => !/password|token|secret/i.test(key))
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : Array.isArray(value) ? value.filter((v) => typeof v === "string").join("; ") : "Invalid value"}`)
    .join("; ");
}

export async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  requestSignal?: AbortSignal,
): Promise<T> {
  const token = localStorage.getItem("care_access_token");
  if (!token) throw new ApiError(401, "No CARE session", method, path);
  const scope = requestSignal ?? requestScope();
  const signal = AbortSignal.any([AbortSignal.timeout(90_000), ...(scope ? [scope] : [])]);
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/v1${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.name : "Connection failed", method, path);
  }
  let data: unknown;
  try {
    const text = await response.text();
    signal.throwIfAborted();
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(signal.aborted ? 0 : response.ok ? 502 : response.status, "CARE returned an unreadable or interrupted response", method, path);
  }
  if (!response.ok) throw new ApiError(response.status, describe(data), method, path,
    response.status === 400 || response.status === 422 ? validationFields(data) : {});
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
};

export type Paginated<T> = { count: number; results: T[] };

export async function listAll<T>(path: string, pageSize = 100): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const page = await api.get<Paginated<T>>(`${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${all.length}`);
    if (!Array.isArray(page?.results) || !Number.isInteger(page.count) || page.count < 0) {
      throw new Error("CARE returned an unexpected list. Please contact your administrator.");
    }
    all.push(...page.results);
    if (all.length >= page.count) return all;
    if (page.results.length === 0) throw new Error("CARE returned an incomplete list. Please try again.");
  }
}
