const mockCreate = jest.fn();
const mockModelsList = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  class AuthenticationError extends Error {}
  class PermissionDeniedError extends Error {}
  class RateLimitError extends Error {}
  const Anthropic = jest.fn().mockImplementation(() => ({
    beta: { messages: { create: mockCreate } },
    messages: { create: mockCreate },
    models: { list: mockModelsList },
  }));
  Object.assign(Anthropic, {
    AuthenticationError,
    PermissionDeniedError,
    RateLimitError,
  });
  return { __esModule: true, default: Anthropic };
});

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicService, priceFromTokens } from '../anthropic.service';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';

const message = (over: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '{"arv": 250000}' }],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: { input_tokens: 120, output_tokens: 30 },
  ...over,
});

describe('AnthropicService', () => {
  let service: AnthropicService;
  let costControl: { checkAndCall: jest.Mock };
  const ctx = { accountId: 'tenant-1', actor: 'system' as const };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    // Pass-through cost control: run execute, surface its result, and let the
    // test inspect the intent and the actual-cost callback.
    costControl = {
      checkAndCall: jest.fn(async (intent: any) => {
        const result = await intent.execute();
        return {
          decision: { kind: 'ALLOW' },
          result,
          actualCostUsd: intent.computeActualCostUsd?.(result),
        };
      }),
    };
    // Like the real resolver: the store first, then env.
    const secrets = {
      resolve: jest.fn(
        async (_p: string, key: string) => process.env[key] || null,
      ),
    };
    service = new AnthropicService(costControl as any, secrets as any);
  });

  it('routes through cost control with the provider and per-model action', async () => {
    mockCreate.mockResolvedValue(message());

    await service.chatCompletion(
      {
        model: 'claude-opus-5-5',
        messages: [
          { role: 'system', content: 'You underwrite deals.' },
          { role: 'user', content: 'ARV for 123 Main?' },
        ],
      },
      ctx,
    );

    const intent = costControl.checkAndCall.mock.calls[0][0];
    expect(intent.provider).toBe('anthropic');
    expect(intent.action).toBe('chat_completion.claude-opus-5-5');
    expect(intent.context).toEqual(ctx);
    expect(intent.payload.tokensIn).toBeGreaterThan(0);
  });

  it('moves the system message to the top-level field and keeps the turn order', async () => {
    mockCreate.mockResolvedValue(message());

    await service.chatCompletion(
      {
        model: 'claude-opus-5-5',
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'ARV?' },
        ],
        maxTokens: 512,
      },
      ctx,
    );

    const req = mockCreate.mock.calls[0][0];
    expect(req.system).toBe('Be brief.');
    expect(req.messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'ARV?' },
    ]);
    expect(req.max_tokens).toBe(512);
  });

  it('turns on server-side refusal fallbacks for current-generation models only', async () => {
    mockCreate.mockResolvedValue(message());
    await service.chatCompletion(
      { model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'x' }] },
      ctx,
    );
    expect(mockCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }),
    );

    mockCreate.mockResolvedValue(message({ model: 'claude-haiku-4-5' }));
    await service.chatCompletion(
      { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'x' }] },
      ctx,
    );
    expect(mockCreate.mock.calls[1][0]).not.toHaveProperty('fallbacks');
    expect(mockCreate.mock.calls[1][0]).not.toHaveProperty('betas');
  });

  it('only forwards temperature to models that accept sampling parameters', async () => {
    mockCreate.mockResolvedValue(message());
    await service.chatCompletion(
      {
        model: 'claude-opus-5-5',
        messages: [{ role: 'user', content: 'x' }],
        temperature: 0.2,
      },
      ctx,
    );
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('temperature');

    await service.chatCompletion(
      {
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'x' }],
        temperature: 0.2,
      },
      ctx,
    );
    expect(mockCreate.mock.calls[1][0].temperature).toBe(0.2);
  });

  it('returns text, real token counts and the served model, priced from usage', async () => {
    mockCreate.mockResolvedValue(
      message({
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: 'part one ' },
          { type: 'text', text: 'part two' },
        ],
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
    );

    const out = await service.chatCompletion(
      { model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'x' }] },
      ctx,
    );

    expect(out).toEqual(
      expect.objectContaining({
        content: 'part one part two',
        tokensIn: 1000,
        tokensOut: 500,
        model: 'claude-opus-5-5',
        stopReason: 'end_turn',
      }),
    );
    // 1000 in @ $0.004/1k + 500 out @ $0.02/1k
    expect(costControl.checkAndCall.mock.results[0].value).resolves.toEqual(
      expect.objectContaining({ actualCostUsd: 0.004 + 0.01 }),
    );
  });

  it('surfaces a refusal as empty content with the stop reason, not a throw', async () => {
    mockCreate.mockResolvedValue(
      message({
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber' },
      }),
    );
    const out = await service.chatCompletion(
      { model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'x' }] },
      ctx,
    );
    expect(out?.content).toBe('');
    expect(out?.stopReason).toBe('refusal');
  });

  it('maps bad credentials to 503 REJECTED_CREDENTIALS', async () => {
    mockCreate.mockRejectedValue(
      new (Anthropic.AuthenticationError as unknown as new (
        m: string,
      ) => Error)('invalid x-api-key'),
    );
    await expect(
      service.chatCompletion(
        {
          model: 'claude-opus-5-5',
          messages: [{ role: 'user', content: 'x' }],
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      provider: 'anthropic',
      reason: 'REJECTED_CREDENTIALS',
    });
  });

  it('refuses to start without a key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      service.chatCompletion(
        {
          model: 'claude-opus-5-5',
          messages: [{ role: 'user', content: 'x' }],
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(IntegrationUnavailableException);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('prices unknown models at the Opus rate rather than the cheapest', () => {
    expect(priceFromTokens('claude-haiku-4-5', 1000, 1000)).toBeCloseTo(0.006);
    expect(priceFromTokens('claude-something-new', 1000, 1000)).toBeCloseTo(
      0.024,
    );
  });
});
