import { emptyPolicyContent, type Answer } from '@halo/shared';
import type { chatCompletion, webResearch } from '../../internal-api.client';
import type { MarketExpansionContext } from '../market-context';
import {
  MarketExpansionAgent,
  hardRule,
  researchPrompt,
} from '../market-expansion.agent';

function ctx(over: Partial<MarketExpansionContext> = {}): MarketExpansionContext {
  const answers: Record<string, { answer: Answer; note: string; sourceIds: string[] }> = Object.fromEntries(
    Object.keys(emptyPolicyContent().answers).map((k) => [k, { answer: 'yes', note: 'On file.', sourceIds: ['s1'] }]),
  );
  answers.disclosures_required = { answer: 'unknown', note: '', sourceIds: [] };
  return {
    market: {
      state: 'WY',
      name: 'Wyoming',
      requestedStatus: 'RESEARCH',
      effectiveStatus: 'RESEARCH',
      draftStatus: 'draft',
      classification: 'unclassified',
      approvedVersion: null,
      nextStep: null,
      missing: [],
    },
    draft: {
      summary: '',
      answers,
      requirements: [],
      disclosures: [],
      deadlines: [],
      openQuestions: ['Is a notice to the owner required?'],
      activationSteps: [],
      sources: [{ id: 's1', citation: 'W.S. 33-28-102', type: 'statute', url: null, effectiveDate: null }],
    },
    unanswered: [
      { key: 'disclosures_required', label: 'Are wholesaling disclosures or notices required?', requiredForApproval: true },
    ],
    research: null,
    authorizations: [],
    opportunity: { counties: 0, top: [] },
    ...over,
  } as MarketExpansionContext;
}

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    recommendation: 'propose',
    answers: [
      {
        question: 'disclosures_required',
        answer: 'yes',
        note: 'The commission requires a written notice.',
        source_ids: ['w1'],
      },
    ],
    web_sources: [{ id: 'w1', citation: 'Rule 9', type: 'regulation', summary: 'Requires a notice.' }],
    rationale: 'The commission rule settles it.',
    ...over,
  });

describe('Market Expansion with web research', () => {
  const research = jest.fn();
  const chat = jest.fn();
  const agent = () =>
    new MarketExpansionAgent({
      webResearch: true,
      research: research as unknown as typeof webResearch,
      chat: chat as unknown as typeof chatCompletion,
    });

  beforeEach(() => {
    research.mockReset().mockResolvedValue({
      content: 'Rule 9 of the Wyoming Real Estate Commission requires a written notice to the owner.',
      model: 'gpt-4o',
      tokensIn: 1000,
      tokensOut: 300,
      searches: 2,
      sources: [
        { url: 'https://realestate.wyo.gov/rules?utm_source=openai', title: 'Commission rules' },
        { url: 'https://example.com/wyoming-wholesaling', title: 'A blog' },
      ],
    });
    chat.mockReset().mockResolvedValue({ content: reply(), model: 'gpt-4o', tokensIn: 6000, tokensOut: 500 });
  });

  it('runs without bundled research, which plain runs need', () => {
    expect(hardRule(ctx())).toMatchObject({ rule: 'no_research' });
    expect(hardRule(ctx(), { webResearch: true })).toBeNull();
  });

  it('searches first, then proposes from the numbered pages, and the cited page becomes an unverified source', async () => {
    const res = await agent().run(ctx(), 'acct', 'run-1');

    const [, step1] = research.mock.calls[0];
    expect(step1).toMatchObject({ model: 'gpt-4o', maxSearches: 5, automationRunId: 'run-1', workflow: 'agent:market_expansion' });
    expect(step1.messages[1].content).toContain('Wyoming (WY)');
    expect(step1.messages[1].content).toContain('Are wholesaling disclosures or notices required? (needed for approval)');

    const [, step2] = chat.mock.calls[0];
    const sent = step2.messages[1].content as string;
    expect(sent).toContain('"web_findings"');
    expect(sent).toContain('"id": "w1"');
    expect(sent).toContain('https://realestate.wyo.gov/rules');
    expect(sent).not.toContain('utm_source');

    const proposal = (res.decision.actions[0] as { proposal: { answers: unknown[]; sources: unknown[] } }).proposal;
    expect(proposal.answers).toEqual([
      expect.objectContaining({ question: 'disclosures_required', answer: 'yes', sourceIds: ['w1'] }),
    ]);
    expect(proposal.sources).toEqual([
      expect.objectContaining({
        id: 'w1',
        url: 'https://realestate.wyo.gov/rules',
        title: 'Commission rules',
        type: 'regulation',
        summary: expect.stringContaining('Found by web search'),
      }),
    ]);
    expect(res.decision.summary).toContain('1 web source from 2 searches');
    // Both calls' tokens, plus two searches at $0.025.
    expect(res.costUsd).toBeCloseTo(
      (1000 / 1000) * 0.0025 + (300 / 1000) * 0.01 + (6000 / 1000) * 0.0025 + (500 / 1000) * 0.01 + 0.05,
      6,
    );
    // The replay keeps what the search found.
    expect(res.seen).toMatchObject({ web_findings: { pages: [{ id: 'w1' }, { id: 'w2' }] } });
  });

  it('does not let a non-government page settle a question', async () => {
    chat.mockResolvedValue({
      content: reply({
        answers: [{ question: 'disclosures_required', answer: 'no', note: 'The blog says none.', source_ids: ['w2'] }],
        web_sources: [{ id: 'w2', type: 'statute', summary: 'No notice.' }],
      }),
      model: 'gpt-4o',
      tokensIn: 6000,
      tokensOut: 500,
    });
    const res = await agent().run(ctx(), 'acct', 'run-1');
    const proposal = (res.decision.actions[0] as { proposal: { answers: Array<{ answer: string }> } }).proposal;
    expect(proposal.answers[0].answer).toBe('unknown');
    expect(res.decision.rationale).toContain('rested only on non-government web pages');
  });

  it('never searches when web research is off for the run', async () => {
    const plain = new MarketExpansionAgent({
      research: research as unknown as typeof webResearch,
      chat: chat as unknown as typeof chatCompletion,
    });
    await plain.run(ctx({ research: { sources: [] } as unknown as MarketExpansionContext['research'] }), 'acct', 'run-1');
    expect(research).not.toHaveBeenCalled();
    expect(chat.mock.calls[0][1].messages[1].content).not.toContain('web_findings');
  });

  it('tells the search step what is already on file', () => {
    const text = researchPrompt(ctx());
    expect(text).toContain('Already asked: Is a notice to the owner required?');
    expect(text).not.toContain('{{');
  });
});
