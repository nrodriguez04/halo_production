import { chatCompletion } from '../../src/internal-api.client';
import { apiChat, openAiChat } from '../chat-backends';
import { parseArgs } from '../run-eval';

jest.mock('../../src/internal-api.client', () => ({
  chatCompletion: jest.fn(async () => ({
    content: '{}',
    model: 'gpt-4o',
    tokensIn: 10,
    tokensOut: 5,
  })),
}));

const input = {
  model: 'gpt-4o',
  messages: [
    { role: 'system' as const, content: 'sys' },
    { role: 'user' as const, content: 'hi' },
  ],
  temperature: 0.2,
  maxTokens: 900,
  leadId: 'lead-golden',
  automationRunId: 'eval-x',
  workflow: 'agent:lead_analyst',
};

describe('apiChat', () => {
  it('keeps eval spend off golden ids and the agents budget buckets', async () => {
    await apiChat()('acct-1', input);
    expect(chatCompletion).toHaveBeenCalledWith(
      'acct-1',
      expect.objectContaining({
        model: 'gpt-4o',
        leadId: undefined,
        automationRunId: undefined,
        workflow: 'agent:eval',
      }),
    );
  });
});

describe('openAiChat', () => {
  it('sends what the api adapter sends and maps the reply', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-4o-2024-08-06',
        choices: [{ message: { content: '{"score": 80}' } }],
        usage: { prompt_tokens: 1200, completion_tokens: 300 },
      }),
    }));
    const res = await openAiChat('sk-test', fetchMock as never)('acct', input);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-4o',
      messages: input.messages,
      temperature: 0.2,
      max_tokens: 900,
    });
    expect(res).toEqual({
      content: '{"score": 80}',
      model: 'gpt-4o-2024-08-06',
      tokensIn: 1200,
      tokensOut: 300,
    });
  });

  it('reports an error status without retrying', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => '{"error":{"code":"insufficient_quota"}}',
    }));
    await expect(
      openAiChat('sk-test', fetchMock as never)('acct', input),
    ).rejects.toThrow('OpenAI answered 429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends Claude models to the api backend instead', async () => {
    const fetchMock = jest.fn();
    await expect(
      openAiChat('sk-test', fetchMock as never)('acct', {
        ...input,
        model: 'claude-opus-5-5',
      }),
    ).rejects.toThrow('--via api');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('parseArgs', () => {
  it('defaults to a free offline run', () => {
    expect(parseArgs([])).toMatchObject({
      live: false,
      via: 'api',
      maxCostUsd: 2,
      agents: [],
      record: false,
    });
  });

  it('reads live options', () => {
    expect(
      parseArgs([
        '--live',
        '--via=openai',
        '--models',
        'mid=gpt-4o-mini,strong=gpt-4o',
        '--max-cost-usd',
        '0.5',
        '--agent',
        'lead_analyst,outreach_drafter',
        '--record',
      ]),
    ).toMatchObject({
      live: true,
      via: 'openai',
      models: { mid: 'gpt-4o-mini', strong: 'gpt-4o' },
      maxCostUsd: 0.5,
      agents: ['lead_analyst', 'outreach_drafter'],
      record: true,
    });
  });

  it('refuses options that would mislead', () => {
    expect(() => parseArgs(['--record'])).toThrow('--record needs --live');
    expect(() => parseArgs(['--agent', 'closer'])).toThrow('unknown agent');
    expect(() => parseArgs(['--models', 'huge=gpt-5'])).toThrow('tier=model');
    expect(() => parseArgs(['--max-cost-usd', '0'])).toThrow('positive');
    expect(() => parseArgs(['--fast'])).toThrow('unknown option');
  });
});
