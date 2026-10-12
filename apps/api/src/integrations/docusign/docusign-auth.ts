import * as crypto from 'crypto';

/**
 * DocuSign eSignature auth for a server integration: the JWT grant. The
 * integration key, the impersonated API user and an RSA private key sign a
 * short-lived assertion; DocuSign returns an access token and, through
 * /oauth/userinfo, the account's base URI. The user grants consent once
 * through the URL from `consentUrl`. No Nest here, so the connectivity test
 * in the secrets service and the service proper share this file.
 */

export type DocuSignEnv = 'demo' | 'production';

export interface DocuSignConfig {
  /** The integration key (client id). */
  integrationKey: string;
  /** The API user the integration acts as (a GUID). */
  userId: string;
  /** The API account id (a GUID). */
  accountId: string;
  /** RSA private key, PEM. A single-line paste is re-wrapped. */
  privateKey: string;
  env: DocuSignEnv;
  /** Optional override of the account base URI (https://xxx.docusign.net). */
  baseUrl?: string | null;
}

export interface DocuSignSession {
  accessToken: string;
  /** Epoch ms; refreshed a minute before DocuSign's own expiry. */
  expiresAt: number;
  /** https://demo.docusign.net or the production shard the account lives on. */
  baseUri: string;
  accountId: string;
  accountName: string;
}

export type DocuSignAuthErrorCode =
  | 'consent_required'
  | 'invalid_grant'
  | 'no_account'
  | 'http';

export class DocuSignAuthError extends Error {
  constructor(
    message: string,
    readonly code: DocuSignAuthErrorCode,
    readonly consentUrl?: string,
  ) {
    super(message);
    this.name = 'DocuSignAuthError';
  }
}

/** DocuSign's own consent landing page; register it on the integration key. */
export const DEFAULT_CONSENT_REDIRECT =
  'https://developers.docusign.com/platform/auth/consent';

export function parseEnv(value: string | null | undefined): DocuSignEnv {
  return (value ?? '').trim().toLowerCase().startsWith('prod')
    ? 'production'
    : 'demo';
}

export function authServer(env: DocuSignEnv): string {
  return env === 'production'
    ? 'account.docusign.com'
    : 'account-d.docusign.com';
}

/**
 * A PEM pasted into a one-line settings field loses its line breaks, and a
 * key copied out of an .env file carries literal "\n". Both come back as a
 * key OpenSSL accepts.
 */
export function normalizePem(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  if (!pem.includes('\n')) {
    const m = pem.match(
      /^(-----BEGIN [A-Z ]+-----)\s*(.+?)\s*(-----END [A-Z ]+-----)$/,
    );
    if (m) {
      const body = m[2].replace(/\s+/g, '');
      const lines = body.match(/.{1,64}/g) ?? [body];
      pem = `${m[1]}\n${lines.join('\n')}\n${m[3]}`;
    }
  }
  return `${pem}\n`;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** The signed assertion for the JWT grant (RS256, one hour, signature + impersonation). */
export function buildJwtAssertion(
  cfg: DocuSignConfig,
  nowMs: number = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: cfg.integrationKey,
      sub: cfg.userId,
      aud: authServer(cfg.env),
      iat,
      exp: iat + 3600,
      scope: 'signature impersonation',
    }),
  );
  const data = `${header}.${claims}`;
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(data),
    normalizePem(cfg.privateKey),
  );
  return `${data}.${base64url(signature)}`;
}

/** Where the API user grants the one-time consent the JWT grant needs. */
export function consentUrl(
  cfg: Pick<DocuSignConfig, 'integrationKey' | 'env'>,
  redirectUri: string = DEFAULT_CONSENT_REDIRECT,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'signature impersonation',
    client_id: cfg.integrationKey,
    redirect_uri: redirectUri,
  });
  return `https://${authServer(cfg.env)}/oauth/auth?${params.toString()}`;
}

type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

/**
 * Exchanges the assertion for a token and resolves the account's base URI.
 * Throws DocuSignAuthError with the consent URL when consent is missing.
 */
export async function requestSession(
  cfg: DocuSignConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<DocuSignSession> {
  const assertion = buildJwtAssertion(cfg);
  const server = authServer(cfg.env);
  const res = await fetchImpl(`https://${server}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    if (text.includes('consent_required')) {
      throw new DocuSignAuthError(
        'DocuSign needs one-time consent for this integration key and user',
        'consent_required',
        consentUrl(cfg),
      );
    }
    throw new DocuSignAuthError(
      `DocuSign auth failed: ${res.status} ${text.slice(0, 200)}`,
      text.includes('invalid_grant') ? 'invalid_grant' : 'http',
    );
  }
  const token = JSON.parse(text) as {
    access_token: string;
    expires_in: number;
  };

  const info = await fetchImpl(`https://${server}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!info.ok) {
    throw new DocuSignAuthError(
      `DocuSign userinfo failed: ${info.status}`,
      'http',
    );
  }
  const user = (await info.json()) as {
    accounts?: Array<{
      account_id: string;
      account_name: string;
      base_uri: string;
      is_default?: boolean;
    }>;
  };
  const accounts = user.accounts ?? [];
  const wanted = cfg.accountId.trim().toLowerCase();
  const account =
    accounts.find((a) => a.account_id.toLowerCase() === wanted) ??
    accounts.find((a) => a.is_default);
  if (!account) {
    throw new DocuSignAuthError(
      `DocuSign account ${cfg.accountId} is not available to this API user`,
      'no_account',
    );
  }
  const expiresIn = Number(token.expires_in) || 3600;
  return {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    baseUri: (cfg.baseUrl?.trim() || account.base_uri).replace(/\/+$/, ''),
    accountId: account.account_id,
    accountName: account.account_name,
  };
}
