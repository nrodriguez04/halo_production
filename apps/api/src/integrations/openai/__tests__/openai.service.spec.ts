const mockCreate = jest.fn();
const mockResponsesCreate = jest.fn();

jest.mock('openai', () => {
  class APIError extends Error {
    status?: number;
  }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  const OpenAI = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    responses: { create: mockResponsesCreate },
  }));
  Object.assign(OpenAI, {
    APIError,
    AuthenticationError,
    PermissionDeniedError,
    RateLimitError,
  });
  return { __esModule: true, default: OpenAI };
});

import OpenAI from 'openai';
import { OpenAIService } from '../openai.service';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';

type ErrorCtor = new (message: string) => Error & { status?: number };

const completion = {
  id: 'chatcmpl_1',
  model: 'gpt-4o-mini',
  choices: [{ message: { role: 'assistant', content: 'OK' } }],
  usage: { prompt_tokens: 12, completion_tokens: 1 },
};

describe('OpenAIService', () => {
  const ctx = { accountId: 'tenant-1', actor: 'system' as const };
  const input = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user' as const, content: 'Reply with OK.' }],
    maxTokens: 5,
  };
  let costControl: { checkAndCall: jest.Mock };
  let secrets: { resolve: jest.Mock };
  let service: OpenAIService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
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
    // The store wins over env, like the real resolver.
    secrets = {
      resolve: jest.fn(async (_provider: string, key: string) =>
        key === 'OPENAI_API_KEY' ? 'sk-saved-on-page' : null,
      ),
    };
    service = new OpenAIService(costControl as any, secrets as any);
  });

  it('builds the client from the key saved on the Integrations page and routes through cost control', async () => {
    mockCreate.mockResolvedValueOnce(completion);

    const out = await service.chatCompletion(input, ctx);

    expect(secrets.resolve).toHaveBeenCalledWith('openai', 'OPENAI_API_KEY');
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-saved-on-page' });
    expect(costControl.checkAndCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        action: 'chat_completion.gpt-4o-mini',
        context: ctx,
      }),
    );
    expect(out).toMatchObject({ content: 'OK', tokensIn: 12, tokensOut: 1 });
  });

  it('reuses one client per key and rebuilds it when the key changes', async () => {
    mockCreate.mockResolvedValue(completion);
    await service.chatCompletion(input, ctx);
    await service.chatCompletion(input, ctx);
    expect(OpenAI).toHaveBeenCalledTimes(1);

    secrets.resolve.mockResolvedValue('sk-rotated');
    await service.chatCompletion(input, ctx);
    expect(OpenAI).toHaveBeenCalledTimes(2);
    expect(OpenAI).toHaveBeenLastCalledWith({ apiKey: 'sk-rotated' });
  });

  it('fails as NOT_CONFIGURED before cost control when no key is saved or set', async () => {
    secrets.resolve.mockResolvedValue(null);
    await expect(service.chatCompletion(input, ctx)).rejects.toMatchObject({
      reason: 'NOT_CONFIGURED',
    });
    expect(costControl.checkAndCall).not.toHaveBeenCalled();
  });

  it('reports no credits (429) and bad keys as typed integration errors, not crashes', async () => {
    mockCreate.mockRejectedValueOnce(
      new (OpenAI.RateLimitError as unknown as ErrorCtor)(
        '429 You have no credits remaining. Add credits to continue using the API.',
      ),
    );
    const quota = await service.chatCompletion(input, ctx).catch((e) => e);
    expect(quota).toBeInstanceOf(IntegrationUnavailableException);
    expect(quota.reason).toBe('UPSTREAM_ERROR');
    expect(quota.message).toContain('no credits remaining');

    mockCreate.mockRejectedValueOnce(
      new (OpenAI.AuthenticationError as unknown as ErrorCtor)(
        '401 Incorrect API key provided',
      ),
    );
    await expect(service.chatCompletion(input, ctx)).rejects.toMatchObject({
      reason: 'REJECTED_CREDENTIALS',
    });
  });

  it('researches through the Responses API web search, returning the pages each search found, priced per search', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      model: 'gpt-4o-2024-08-06',
      output_text: 'Texas requires a written disclosure (Prop. Code 5.0205).',
      usage: { input_tokens: 900, output_tokens: 150 },
      output: [
        {
          type: 'web_search_call',
          id: 'ws_1',
          status: 'completed',
          action: {
            type: 'search',
            sources: [
              {
                type: 'url',
                url: 'https://statutes.capitol.texas.gov/PR/5.0205?utm_source=openai',
              },
              { type: 'url', url: 'https://example.com/blog' },
            ],
          },
        },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Texas requires a written disclosure.',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://example.com/blog',
                  title: 'Blog',
                },
              ],
            },
          ],
        },
      ],
    });
    const out = await service.webResearch(
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You research.' },
          { role: 'user', content: 'Texas?' },
        ],
        maxTokens: 2500,
        maxSearches: 4,
      },
      ctx,
    );
    const req = mockResponsesCreate.mock.calls[0][0];
    expect(req).toMatchObject({
      model: 'gpt-4o',
      instructions: 'You research.',
      input: [{ role: 'user', content: 'Texas?' }],
      tools: [{ type: 'web_search_preview', search_context_size: 'medium' }],
      include: ['web_search_call.action.sources'],
      max_output_tokens: 2500,
    });
    expect(out).toEqual({
      content: 'Texas requires a written disclosure (Prop. Code 5.0205).',
      tokensIn: 900,
      tokensOut: 150,
      model: 'gpt-4o-2024-08-06',
      searches: 1,
      sources: [
        {
          url: 'https://statutes.capitol.texas.gov/PR/5.0205?utm_source=openai',
          title: null,
        },
        { url: 'https://example.com/blog', title: null },
      ],
    });
    const intent = costControl.checkAndCall.mock.calls[0][0];
    expect(intent.action).toBe('web_research.gpt-4o');
    expect(intent.payload.searches).toBe(4);
    // 900 in and 150 out at gpt-4o rates, plus one search at $0.025.
    expect(intent.computeActualCostUsd(out)).toBeCloseTo(
      0.9 * 0.0025 + 0.15 * 0.01 + 0.025,
      6,
    );
  });
});
