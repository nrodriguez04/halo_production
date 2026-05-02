'use client';

// The Descope SDK is dynamically imported once and cached at module scope.
// Previously every apiFetch() call re-evaluated the dynamic import, which on
// cold cache forced the browser to re-resolve / re-execute the SDK chunk
// before each request. That added measurable latency to every API call,
// especially on slow networks and the first few interactions after a page
// load. Caching the import promise turns it into a one-shot bootstrap.
type DescopeClientModule = {
  getSessionToken?: () => string | undefined | Promise<string | undefined>;
};

let descopeModulePromise: Promise<DescopeClientModule> | null = null;

async function getJwt(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    if (!descopeModulePromise) {
      descopeModulePromise = import('@descope/nextjs-sdk/client') as unknown as Promise<DescopeClientModule>;
    }
    const mod = await descopeModulePromise;
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
