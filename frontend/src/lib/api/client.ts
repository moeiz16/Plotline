"use client";

import type { Problem } from "./types";

export const API_BASE = "/api/v1";

/* ── Errors ─────────────────────────────────────────────────────────────── */
export class ApiError extends Error {
  status: number;
  problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.problem = problem;
  }
  get code() {
    return this.problem.code;
  }
  /** Field errors keyed by field name ("form" when the service did not name one). */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem.errors ?? []) out[e.field || "form"] = e.message;
    return out;
  }
}

export class NetworkError extends Error {
  constructor(message = "We couldn’t reach Plotline. Check your connection and try again.") {
    super(message);
    this.name = "NetworkError";
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "engine_unavailable") return "Automatic follow-ups are paused right now. Your progress is saved; please try again shortly.";
    if (err.status >= 500) return "Something went wrong on our side. Please try again in a moment.";
    if (err.status === 403) return err.problem.detail || "Your role doesn’t allow this action.";
    if (err.status === 404) return err.problem.detail || "We couldn’t find that.";
    if (err.status === 429) return "Too many attempts. Please wait a moment and try again.";
    const first = err.problem.errors?.[0]?.message;
    return err.problem.detail || first || err.problem.title;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

/* ── CSRF (double-submit cookie) ────────────────────────────────────────── */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/* ── Core request ───────────────────────────────────────────────────────── */
export type Query = Record<string, string | number | boolean | null | undefined>;

export function buildPath(path: string, query?: Query) {
  if (!query) return path;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  form?: FormData;
}

async function parseError(res: Response): Promise<ApiError> {
  let problem: Problem = { title: res.statusText || "Request failed", status: res.status };
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) {
      const body = (await res.json()) as Record<string, unknown>;
      if (body && typeof body === "object") {
        if ("title" in body) problem = { ...problem, ...(body as Partial<Problem>), status: res.status };
        else if ("detail" in body) {
          const detail = body.detail;
          problem.detail = typeof detail === "string" ? detail : "Some details need attention.";
        }
      }
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(problem);
}

let refreshing: Promise<boolean> | null = null;
export async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    const headers: Record<string, string> = {};
    const csrf = readCookie("pl_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
    refreshing = fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include", headers })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

async function isTokenExpired(res: Response) {
  try {
    const body = (await res.clone().json()) as { code?: string };
    return body?.code === "token_expired";
  } catch {
    return false;
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const url = `${API_BASE}${buildPath(path, opts.query)}`;

  const doFetch = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (UNSAFE.has(method)) {
      // Read on every attempt: a refresh may have rotated the CSRF cookie.
      const csrf = readCookie("pl_csrf");
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    return fetch(url, { method, headers, body, credentials: "include", signal: opts.signal });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new NetworkError();
  }
  if ([502, 503, 504].includes(res.status) && !(res.headers.get("content-type") || "").includes("json")) {
    throw new NetworkError();
  }
  // Refresh once on an expired access cookie, then retry the original request.
  if (res.status === 401 && !path.startsWith("/auth/refresh") && !path.startsWith("/auth/login") && (await isTokenExpired(res))) {
    if (await tryRefresh()) {
      try {
        res = await doFetch();
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        throw new NetworkError();
      }
    }
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", form }),
};

/** Same-origin URL for files the service renders (imagery, evidence packs, downloads). */
export function fileUrl(path: string) {
  return `${API_BASE}${path}`;
}
