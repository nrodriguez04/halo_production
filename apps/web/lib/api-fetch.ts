'use client';

export async function apiFetch(path: string, init: RequestInit = {}) {
  let jwt: string | undefined;

  try {
    const mod = await import('@descope/nextjs-sdk/client');
    jwt = await (mod as any).getSessionToken?.();
  } catch {
    jwt = undefined;
  }

  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
  });
}
