'use client';

import { createRetryableAsyncLoader } from './retryable-async-loader';

// The Descope SDK is dynamically imported once and cached at module scope.
// We keep the perf win for successful loads, but if the browser fails to load
// the chunk once we must clear the cached rejection so later API calls can
// retry instead of permanently dropping auth headers for the rest of the tab.
type DescopeClientModule = {
  getSessionToken?: () => string | undefined | Promise<string | undefined>;
};

const loadDescopeModule = createRetryableAsyncLoader(
  () => import('@descope/nextjs-sdk/client') as unknown as Promise<DescopeClientModule>,
);

async function getJwt(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const mod = await loadDescopeModule();
    if (!mod?.getSessionToken) return undefined;
    return await Promise.resolve(mod.getSessionToken());
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const jwt = await getJwt();

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/sign-in';
  }

  return res;
}

// Typed JSON helper used by useApiQuery; throws ApiError on non-2xx so React
// Query treats it as a failed query and surfaces it in the error state.
export async function apiJson<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
