let _client: any = null;

export function getDescopeClient(): any {
  if (_client) return _client;

  const projectId = process.env.DESCOPE_PROJECT_ID;
  if (!projectId) {
    return null;
  }

  try {
    const descopeSdk = require('@descope/node-sdk') as (args: {
      projectId: string;
      managementKey?: string;
    }) => any;

    _client = descopeSdk({
      projectId,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY || undefined,
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
