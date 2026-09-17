import {
  CostBlockedError,
  InternalApiError,
  InternalApiNotConfiguredError,
  chatCompletion,
  sendSms,
} from '../internal-api.client';

const ORIGINAL_ENV = process.env;

const jsonResponse = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

describe('worker internal-api client', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      INTERNAL_API_BASE_URL: 'http://api.test/api',
      INTERNAL_API_TOKEN: 'x'.repeat(64),
    };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('refuses to make paid calls when the internal API is not configured', async () => {
    delete process.env.INTERNAL_API_TOKEN;
    await expect(
      sendSms('halo-hq', { to: '+15555550100', from: '+18333622597', body: 'hi' }),
    ).rejects.toBeInstanceOf(InternalApiNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the bearer token and names the tenant', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { content: 'ok', tokensIn: 1, tokensOut: 2, model: 'gpt-4o' }),
    );

    await chatCompletion('halo-hq', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      dealId: 'deal_1',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/internal/ai/chat-completion');
    expect(init.headers.Authorization).toBe(`Bearer ${'x'.repeat(64)}`);
    // Without this header the api cannot attribute spend to a tenant.
    expect(init.headers['x-halo-account-id']).toBe('halo-hq');
    expect(JSON.parse(init.body).dealId).toBe('deal_1');
  });

  it('raises CostBlockedError (not a generic failure) on a 429 COST_BLOCKED', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, {
        code: 'COST_BLOCKED',
        reason: 'BLOCK_OVER_BUDGET',
        provider: 'openai',
        message: 'Spend cap reached',
      }),
    );

    const err = await chatCompletion('halo-hq', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    }).catch((e) => e);

    expect(err).toBeInstanceOf(CostBlockedError);
    expect(err.reason).toBe('BLOCK_OVER_BUDGET');
    expect(err.provider).toBe('openai');
  });

  it('treats a non-cost 429 as an ordinary error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { message: 'slow down' }));
    const err = await sendSms('halo-hq', {
      to: '+15555550100',
      from: '+18333622597',
      body: 'hi',
    }).catch((e) => e);

    expect(err).toBeInstanceOf(InternalApiError);
    expect(err).not.toBeInstanceOf(CostBlockedError);
  });

  it('propagates upstream failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'boom' }));
    await expect(
      sendSms('halo-hq', { to: '+15555550100', from: '+18333622597', body: 'hi' }),
    ).rejects.toBeInstanceOf(InternalApiError);
  });

  it('passes messageId through as the idempotency key for sends', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { sid: 'SM1', numSegments: 1, status: 'queued' }));
    await sendSms('halo-hq', {
      to: '+15555550100',
      from: '+18333622597',
      body: 'hi',
      messageId: 'msg_1',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messageId).toBe('msg_1');
  });
});
