'use client';

type ApiAuthState = {
  ready: boolean;
  token?: string;
};

let authState: ApiAuthState = {
  ready: typeof window === 'undefined',
  token: undefined,
};
const authReadyWaiters = new Set<() => void>();

export function syncApiAuthState(nextState: ApiAuthState) {
  authState = nextState;

  if (!nextState.ready) {
    return;
  }

  for (const resolve of authReadyWaiters) {
    resolve();
  }
  authReadyWaiters.clear();
}

async function waitForAuthReady(timeoutMs = 3000) {
  if (typeof window === 'undefined' || authState.ready) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      authReadyWaiters.delete(finish);
      resolve();
    };

    authReadyWaiters.add(finish);
    window.setTimeout(finish, timeoutMs);
  });
}

async function getJwt(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;

  // Requests kicked off during the first client paint need to wait until the
  // AuthProvider has resolved the current session, otherwise they race the
  // session bootstrap and get redirected back to sign-in with no bearer token.
  await waitForAuthReady();
  return authState.token;
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
