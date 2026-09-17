let _client: any = null;

export function getDescopeClient(): any {
  if (_client) return _client;

  const projectId = process.env.DESCOPE_PROJECT_ID;
  if (!projectId) {
    return null;
  }

  try {
    // Deliberately a runtime require inside try/catch so a missing or
    // broken SDK degrades to "auth unavailable" instead of failing boot.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const descopeSdk = require('@descope/node-sdk') as (args: {
      projectId: string;
      managementKey?: string;
      baseUrl?: string;
    }) => any;

    _client = descopeSdk({
      projectId,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY || undefined,
      // Must match the project's custom domain when one is configured, so
      // session validation resolves the same keys the tokens were signed with.
      baseUrl: process.env.DESCOPE_BASE_URL || undefined,
    });
  } catch (err: any) {
    console.warn(`Descope SDK init failed: ${err.message}`);
    return null;
  }

  return _client;
}

/** @deprecated use getDescopeClient() — kept for backward compat */
export const descope = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getDescopeClient();
      if (!client) {
        if (prop === 'validateSession') {
          return () => {
            throw new Error('Descope not configured');
          };
        }
        return undefined;
      }
      return client[prop];
    },
  },
);
