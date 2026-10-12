import * as crypto from 'crypto';
import {
  DocuSignAuthError,
  authServer,
  buildJwtAssertion,
  consentUrl,
  normalizePem,
  parseEnv,
  requestSession,
} from '../docusign-auth';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const cfg = {
  integrationKey: 'ik-123',
  userId: 'user-guid',
  accountId: 'acct-guid',
  privateKey: pem,
  env: 'demo' as const,
};

describe('docusign-auth', () => {
  it('builds an RS256 assertion DocuSign can verify', () => {
    const jwt = buildJwtAssertion(cfg, 1_700_000_000_000);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({
      iss: 'ik-123',
      sub: 'user-guid',
      aud: 'account-d.docusign.com',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
      scope: 'signature impersonation',
    });
    expect(
      crypto.verify(
        'RSA-SHA256',
        Buffer.from(`${h}.${c}`),
        publicKey,
        Buffer.from(s, 'base64url'),
      ),
    ).toBe(true);
  });

  it('re-wraps a single-line PEM paste and unescapes literal newlines', () => {
    expect(normalizePem(pem.replace(/\n/g, ' '))).toBe(`${pem.trim()}\n`);
    expect(normalizePem(pem.replace(/\n/g, '\\n'))).toBe(`${pem.trim()}\n`);
    expect(
      buildJwtAssertion({ ...cfg, privateKey: pem.replace(/\n/g, ' ') }),
    ).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('maps the environment and builds the one-time consent URL', () => {
    expect(parseEnv('production')).toBe('production');
    expect(parseEnv(' Prod ')).toBe('production');
    expect(parseEnv(undefined)).toBe('demo');
    expect(authServer('production')).toBe('account.docusign.com');
    expect(consentUrl(cfg)).toBe(
      'https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature+impersonation&client_id=ik-123&redirect_uri=https%3A%2F%2Fdevelopers.docusign.com%2Fplatform%2Fauth%2Fconsent',
    );
  });

  it('exchanges the assertion for a session and picks the configured account', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          accounts: [
            {
              account_id: 'OTHER',
              account_name: 'Other',
              base_uri: 'https://na1.docusign.net',
              is_default: true,
            },
            {
              account_id: 'ACCT-GUID',
              account_name: 'Halo',
              base_uri: 'https://demo.docusign.net',
            },
          ],
        }),
      });

    const session = await requestSession(cfg, fetchImpl);

    expect(session).toMatchObject({
      accessToken: 'tok',
      baseUri: 'https://demo.docusign.net',
      accountId: 'ACCT-GUID',
      accountName: 'Halo',
    });
    expect(session.expiresAt).toBeGreaterThan(Date.now() + 3_000_000);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://account-d.docusign.com/oauth/token',
    );
    expect(fetchImpl.mock.calls[0][1].body).toContain(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
    );
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
  });

  it('surfaces the consent URL when DocuSign asks for consent', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"error":"consent_required"}',
      json: async () => ({}),
    });
    const err = await requestSession(cfg, fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(DocuSignAuthError);
    expect(err.code).toBe('consent_required');
    expect(err.consentUrl).toContain('client_id=ik-123');
  });
});
