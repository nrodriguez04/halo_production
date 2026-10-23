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

function getDescopeModule() {
  if (!descopeModulePromise) {
    descopeModulePromise = (
      import('@descope/nextjs-sdk/client') as unknown as Promise<DescopeClientModule>
    ).catch((error) => {
      // Retry on the next request if the chunk load/import failed transiently.
      descopeModulePromise = null;
      throw error;
    });
  }

  return descopeModulePromise;
}

async function getJwt(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const mod = await getDescopeModule();
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

const SIGN_IN_REASON_KEY = 'halo.signInReason';

/** A signed-in user the API cannot place in an account: no tenant on them in Descope. */
const NO_TENANT = /tenant\/account claim/i;

/**
 * The API refused the session (401, or a 403 for a user with no tenant):
 * go to sign-in and keep the API's own reason for the page to show. Without it a login that Descope accepts but
 * the API rejects (no tenant on the user, say) only ever returned to the
 * sign-in page, with nothing to say why. Never redirects from sign-in itself.
 */
async function toSignIn(res: Response) {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/sign-in')) return;
  let reason = 'Your session was not accepted. Sign in again.';
  try {
    const body = (await res.clone().json()) as { message?: string | string[] };
    const m = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    if (m) reason = m;
  } catch {
    // Not JSON: keep the generic reason.
  }
  try {
    sessionStorage.setItem(SIGN_IN_REASON_KEY, reason);
  } catch {
    // Storage blocked: the page shows no reason.
  }
  window.location.href = '/sign-in';
}

/** Whether a 403 is the API refusing a session with no tenant (not a missing permission). */
async function refusedForTenant(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { message?: string | string[] };
    const m = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    return !!m && NO_TENANT.test(m);
  } catch {
    return false;
  }
}

/** The reason the last 401 gave, once: reading it clears it. */
export function takeSignInReason(): string | null {
  try {
    const r = sessionStorage.getItem(SIGN_IN_REASON_KEY);
    if (r) sessionStorage.removeItem(SIGN_IN_REASON_KEY);
    return r;
  } catch {
    return null;
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

  if (res.status === 401 || (res.status === 403 && (await refusedForTenant(res)))) await toSignIn(res);

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

/**
 * Multipart upload. Like apiJson, but the browser sets the content type so
 * the multipart boundary is right.
 */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const jwt = await getJwt();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    method: 'POST',
    body: form,
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
  });
  if (res.status === 401 || (res.status === 403 && (await refusedForTenant(res)))) await toSignIn(res);
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }
  return (await res.json()) as T;
}

/**
 * Fetches a protected file with the session token and hands it to the browser
 * as a download; a plain link could not carry the Authorization header.
 */
export async function apiDownload(path: string, fileName: string): Promise<void> {
  const res = await apiFetch(path);
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
