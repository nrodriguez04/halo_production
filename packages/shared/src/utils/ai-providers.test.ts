import { AI_PROVIDER_KEYS, aiProviderForModel } from './ai-providers';

describe('ai providers', () => {
  it('routes claude models to anthropic and everything else to openai', () => {
    expect(aiProviderForModel('claude-opus-5-5')).toBe('anthropic');
    expect(aiProviderForModel('claude-haiku-4-5')).toBe('anthropic');
    expect(aiProviderForModel('gpt-4o')).toBe('openai');
    expect(aiProviderForModel('gpt-4o-mini')).toBe('openai');
  });

  it('every routable provider is in the spend-aggregation list', () => {
    for (const model of ['claude-sonnet-5-5', 'gpt-4o']) {
      expect(AI_PROVIDER_KEYS).toContain(aiProviderForModel(model));
    }
  });
});
