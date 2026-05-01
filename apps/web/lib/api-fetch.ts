'use client';

export async function apiFetch(path: string, init: RequestInit = {}) {
  let jwt: string | undefined;

  try {
    const mod = await import('@descope/nextjs-sdk/client');
    jwt = await (mod as any).getSessionToken?.();
  } catch {
    jwt = undefined;
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/sign-in';
    }
  }

  return res;
}
