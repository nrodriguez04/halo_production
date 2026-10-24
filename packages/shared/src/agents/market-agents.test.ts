import {
  applyMarketProposal,
  numberWebPages,
  parseMarketExpansionOutput,
  parseMarketIntelligenceOutput,
  proposalIsEmpty,
  sanitizeMarketProposal,
  type MarketExpansionOutput,
} from './market-agents';
import {
  MarketPolicyContentSchema,
  SourceSchema,
  emptyPolicyContent,
  type MarketPolicyContent,
  type PolicySource,
} from '../markets/policy';

const source = (id: string, citation = `Citation ${id}`): PolicySource => ({
  id,
  citation,
  title: '',
  url: null,
  type: 'statute',
  effectiveDate: null,
  summary: '',
});

function draft(over: Partial<MarketPolicyContent> = {}): MarketPolicyContent {
  return { ...emptyPolicyContent(), sources: [source('s1')], ...over };
}

/** A draft that answers every question, so only what a test unsets is unknown. */
function answeredDraft(): MarketPolicyContent {
  const d = draft();
  for (const q of Object.keys(d.answers) as Array<keyof MarketPolicyContent['answers']>) {
    d.answers[q] = { answer: 'yes', note: 'Answered.', sourceIds: ['s1'] };
  }
  return d;
}

function output(over: Partial<MarketExpansionOutput> = {}): MarketExpansionOutput {
  return {
    recommendation: 'propose',
    classification: null,
    classification_reason: '',
    answers: [],
    counsel_questions: [],
    requirements: [],
    activation_steps: [],
    risks: [],
    rationale: 'because',
    web_sources: [],
    ...over,
  };
}

describe('parseMarketExpansionOutput', () => {
  it('reads the first JSON object and rejects a malformed one', () => {
    expect(parseMarketExpansionOutput('Sure: {"recommendation":"not_now","rationale":"nothing new"}')).toEqual(
      expect.objectContaining({ recommendation: 'not_now', answers: [] }),
    );
    expect(parseMarketExpansionOutput('{"recommendation":"activate","rationale":"x"}')).toBeNull();
    expect(
      parseMarketExpansionOutput(
        '{"recommendation":"propose","rationale":"x","answers":[{"question":"made_up","answer":"yes","note":"n"}]}',
      ),
    ).toBeNull();
    expect(parseMarketExpansionOutput('no json')).toBeNull();
  });
});

describe('parseMarketIntelligenceOutput', () => {
  it('needs a summary and a rationale', () => {
    expect(parseMarketIntelligenceOutput('{"summary":"s","rationale":"r"}')).toEqual(
      expect.objectContaining({ priorities: [], data_gaps: [] }),
    );
    expect(parseMarketIntelligenceOutput('{"summary":"s"}')).toBeNull();
  });
});

describe('sanitizeMarketProposal', () => {
  const ctx = (d = draft()) => ({
    state: 'TX',
    draft: d,
    researchSources: [source('s1'), source('s2'), source('s3')],
  });

  it('keeps an unsourced answer unknown: silence is not permission', () => {
    const { proposal, adjustments } = sanitizeMarketProposal(
      output({
        answers: [
          {
            question: 'wholesaler_registration_required',
            answer: 'no',
            note: 'Nothing found.',
            source_ids: [],
          },
          {
            question: 'disclosures_required',
            answer: 'yes',
            note: 'Notice required.',
            source_ids: ['s2', 'ghost'],
          },
        ],
      }),
      ctx(),
    );
    expect(proposal.answers).toEqual([
      expect.objectContaining({
        question: 'wholesaler_registration_required',
        answer: 'unknown',
        sourceIds: [],
      }),
      expect.objectContaining({
        question: 'disclosures_required',
        answer: 'yes',
        sourceIds: ['s2'],
      }),
    ]);
    expect(adjustments.join(' ')).toMatch(/ghost/);
    expect(adjustments.join(' ')).toMatch(/had no source/);
    // The cited research source the draft lacks travels with the proposal.
    expect(proposal.sources.map((s) => s.id)).toEqual(['s2']);
  });

  it('never touches a question the draft already answers', () => {
    const d = draft();
    d.answers.license_required_for_activity = {
      answer: 'yes',
      note: 'Counsel said so',
      sourceIds: ['s1'],
    };
    const { proposal } = sanitizeMarketProposal(
      output({
        answers: [
          {
            question: 'license_required_for_activity',
            answer: 'no',
            note: 'n',
            source_ids: ['s1'],
          },
        ],
      }),
      ctx(d),
    );
    expect(proposal.answers).toEqual([]);
  });

  it('does not propose a permissive class while an approval question is unknown', () => {
    const { proposal } = sanitizeMarketProposal(
      output({
        classification: 'A',
        classification_reason: 'Assignments allowed.',
      }),
      ctx(),
    );
    expect(proposal.classification).toBeNull();
    expect(proposal.counselQuestions.join(' ')).toMatch(/class A/);
  });

  it('proposes a restrictive class whatever is unknown', () => {
    const { proposal } = sanitizeMarketProposal(
      output({ classification: 'C', classification_reason: 'Licence.' }),
      ctx(),
    );
    expect(proposal.classification).toBe('C');
  });

  it('skips a requirement of a kind the draft already has, and de-duplicates lists', () => {
    const d = draft({
      openQuestions: ['Is a licence needed?'],
      requirements: [
        {
          key: 'reg',
          kind: 'wholesaler_registration',
          label: 'Registration',
          appliesTo: ['seller_contracting'],
          sourceIds: [],
        },
      ],
    });
    const { proposal } = sanitizeMarketProposal(
      output({
        counsel_questions: ['is a licence needed?', 'Does the notice need a form?'],
        requirements: [
          {
            kind: 'wholesaler_registration',
            label: 'Register',
            applies_to: ['seller_contracting'],
            source_ids: [],
          },
          {
            kind: 'entity_registration',
            label: 'Foreign LLC',
            applies_to: ['seller_contracting', 'seller_contracting'],
            source_ids: ['s1'],
          },
        ],
      }),
      ctx(d),
    );
    expect(proposal.counselQuestions).toContain('Does the notice need a form?');
    expect(proposal.counselQuestions).not.toContain('is a licence needed?');
    expect(proposal.requirements).toEqual([
      {
        key: 'entity_registration_foreign_llc',
        kind: 'entity_registration',
        label: 'Foreign LLC',
        appliesTo: ['seller_contracting'],
        sourceIds: ['s1'],
      },
    ]);
  });

  it('reports an empty proposal', () => {
    expect(proposalIsEmpty(sanitizeMarketProposal(output({ recommendation: 'not_now' }), ctx(answeredDraft())).proposal)).toBe(true);
  });

  it('asks counsel about every question left unknown that nobody asked yet', () => {
    const d = answeredDraft();
    d.answers.seller_cancellation_right = { answer: 'unknown', note: '', sourceIds: [] };
    d.answers.local_restrictions = { answer: 'unknown', note: '', sourceIds: [] };
    d.answers.assignment_restrictions = { answer: 'unknown', note: '', sourceIds: [] };
    d.openQuestions = ['Do Dallas or Houston have ordinances on assignments?'];
    const { proposal, adjustments } = sanitizeMarketProposal(
      output({
        answers: [{ question: 'assignment_restrictions', answer: 'no', note: 'None found.', source_ids: ['s1'] }],
      }),
      ctx(d),
    );
    // Local rules are asked already, assignment is answered: only cancellation is new.
    expect(proposal.counselQuestions).toEqual([
      'For TX: Does the seller have a statutory right to cancel? The research does not settle it.',
    ]);
    expect(adjustments.join(' ')).toMatch(/1 counsel question added/);
  });
});

describe('sanitizeMarketProposal: web sources', () => {
  // What the search returned, numbered the way the agent numbers it.
  const pages = numberWebPages([
    { url: 'https://www.trec.texas.gov/wholesaling?utm_source=openai', title: 'TREC: wholesaling' },
    { url: 'https://example-blog.com/texas-wholesaling/', title: 'A blog' },
    { url: 'https://trec.texas.gov/wholesaling', title: 'The same TREC page again' },
  ]);
  const ctx = (webPages?: typeof pages) => ({
    state: 'TX',
    draft: draft(),
    researchSources: [source('s1')],
    webPages,
    today: '2026-10-24',
  });
  const read = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    citation: '',
    type: 'regulator_guidance' as const,
    summary: 'What the page says.',
    ...over,
  });

  it('numbers each returned page once, without tracking parameters', () => {
    expect(pages).toEqual([
      { id: 'w1', url: 'https://www.trec.texas.gov/wholesaling', title: 'TREC: wholesaling' },
      { id: 'w2', url: 'https://example-blog.com/texas-wholesaling/', title: 'A blog' },
    ]);
  });

  it('records a cited page with the URL and title the search gave, marked found on the web and unverified', () => {
    const { proposal } = sanitizeMarketProposal(
      output({
        answers: [{ question: 'disclosures_required', answer: 'yes', note: 'TREC says so.', source_ids: ['w1'] }],
        web_sources: [read('w1', { citation: '22 TAC 535.1' })],
      }),
      ctx(pages),
    );
    expect(proposal.answers[0]).toMatchObject({ answer: 'yes', sourceIds: ['w1'] });
    expect(proposal.sources).toEqual([
      {
        id: 'w1',
        citation: '22 TAC 535.1',
        title: 'TREC: wholesaling',
        url: 'https://www.trec.texas.gov/wholesaling',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary: 'What the page says. (Found by web search on 2026-10-24 at trec.texas.gov; not verified.)',
      },
    ]);
    expect(SourceSchema.parse(proposal.sources[0])).toEqual(proposal.sources[0]);
  });

  it('records a cited page the model said nothing about as secondary, under its title', () => {
    const { proposal } = sanitizeMarketProposal(
      output({
        requirements: [{ kind: 'entity_registration', label: 'Foreign LLC', applies_to: ['seller_contracting'], source_ids: ['w2'] }],
      }),
      ctx(pages),
    );
    expect(proposal.sources).toEqual([
      expect.objectContaining({ id: 'w2', citation: 'A blog', type: 'secondary', url: 'https://example-blog.com/texas-wholesaling/' }),
    ]);
  });

  it('drops a page id the search did not return, and the answer it carried goes back to unknown', () => {
    const { proposal, adjustments } = sanitizeMarketProposal(
      output({
        answers: [{ question: 'disclosures_required', answer: 'no', note: 'n', source_ids: ['w9'] }],
        web_sources: [read('w9')],
      }),
      ctx(pages),
    );
    expect(proposal.answers[0]).toMatchObject({ answer: 'unknown', sourceIds: [] });
    expect(proposal.sources).toEqual([]);
    expect(adjustments.join(' ')).toMatch(/w9: not one of the pages the search returned/);
  });

  it('drops every web source when web research was off for the run', () => {
    const { proposal, adjustments } = sanitizeMarketProposal(
      output({
        answers: [{ question: 'disclosures_required', answer: 'yes', note: 'n', source_ids: ['w1'] }],
        web_sources: [read('w1')],
      }),
      ctx(undefined),
    );
    expect(proposal.sources).toEqual([]);
    expect(proposal.answers[0].answer).toBe('unknown');
    expect(adjustments.join(' ')).toMatch(/web research was off/);
  });

  it('lets only a government page settle a question; other pages alone leave it unknown', () => {
    const { proposal } = sanitizeMarketProposal(
      output({
        answers: [
          { question: 'disclosures_required', answer: 'no', note: 'The blog says none.', source_ids: ['w2'] },
          { question: 'seller_cancellation_right', answer: 'no', note: 'Both agree.', source_ids: ['w1', 'w2'] },
        ],
        // The model calling the blog a statute does not make it one.
        web_sources: [read('w1'), read('w2', { type: 'statute' })],
      }),
      ctx(pages),
    );
    expect(proposal.answers.map((a) => [a.question, a.answer])).toEqual([
      ['disclosures_required', 'unknown'],
      ['seller_cancellation_right', 'no'],
    ]);
    expect(proposal.answers[0].note).toMatch(/Only non-government web pages/);
  });

  it('leaves out a page summary that reads as clearance to operate', () => {
    const { proposal, adjustments } = sanitizeMarketProposal(
      output({
        requirements: [
          { kind: 'entity_registration', label: 'Foreign LLC', applies_to: ['seller_contracting'], source_ids: ['w2'] },
        ],
        web_sources: [read('w2', { summary: 'Wholesaling is legal in Texas.' })],
      }),
      ctx(pages),
    );
    expect(proposal.sources[0].summary).toBe('(Found by web search on 2026-10-24 at example-blog.com; not verified.)');
    expect(adjustments.join(' ')).toMatch(/summary left out/);
  });

  it('parses a reply whose web sources are partly malformed, keeping the good ones', () => {
    const out = parseMarketExpansionOutput(
      JSON.stringify({
        recommendation: 'propose',
        rationale: 'r',
        web_sources: [
          { id: 'w1', citation: '22 TAC 535.1', type: 'agency_page' },
          { id: 'w2', summary: 42 },
          { id: 's9', summary: 'Wrong id' },
        ],
      }),
    );
    expect(out?.web_sources).toEqual([{ id: 'w1', citation: '22 TAC 535.1', type: 'secondary', summary: '' }]);
  });
});

describe('applyMarketProposal', () => {
  const proposal = () =>
    sanitizeMarketProposal(
      output({
        classification: 'C',
        classification_reason: 'Registration needed.',
        answers: [
          {
            question: 'disclosures_required',
            answer: 'yes',
            note: 'Notice to buyers.',
            source_ids: ['s2'],
          },
        ],
        counsel_questions: ['Which form?'],
        activation_steps: ['Register the entity.'],
        requirements: [
          {
            kind: 'entity_registration',
            label: 'Foreign LLC',
            applies_to: ['seller_contracting'],
            source_ids: ['s2'],
          },
        ],
      }),
      {
        state: 'TX',
        draft: draft(),
        researchSources: [source('s1'), source('s2')],
      },
    ).proposal;

  it('fills unknowns, marks them unverified, adds the cited source and keeps the draft valid', () => {
    const out = applyMarketProposal(draft(), 'unclassified', proposal(), 'run-1');
    expect(MarketPolicyContentSchema.safeParse(out.content).success).toBe(true);
    expect(out.content.answers.disclosures_required).toEqual(
      expect.objectContaining({ answer: 'yes', sourceIds: ['s2'] }),
    );
    expect(out.content.answers.disclosures_required.note).toMatch(/not verified; counsel to confirm\. Run run-1/);
    expect(out.content.sources.map((s) => s.id)).toEqual(['s1', 's2']);
    // The model's question, then one for each of the other ten questions the empty draft leaves unknown.
    expect(out.content.openQuestions[0]).toBe('Which form?');
    expect(out.content.openQuestions).toHaveLength(11);
    expect(out.content.activationSteps).toEqual(['Register the entity.']);
    expect(out.content.requirements).toHaveLength(1);
    expect(out.classification).toBe('C');
    expect(out.applied).toEqual(
      expect.objectContaining({
        answers: ['disclosures_required'],
        skipped: [],
        questions: 11,
        steps: 1,
        requirements: 1,
        sources: 1,
      }),
    );
  });

  it('lets an answer a person gave in the meantime win', () => {
    const d = draft();
    d.answers.disclosures_required = {
      answer: 'no',
      note: 'Counsel',
      sourceIds: ['s1'],
    };
    const out = applyMarketProposal(d, 'unclassified', proposal(), 'run-1');
    expect(out.content.answers.disclosures_required.answer).toBe('no');
    expect(out.applied.skipped).toEqual(['disclosures_required']);
  });

  it('turns a disagreement with a class a person set into a question, not a change', () => {
    const out = applyMarketProposal(draft(), 'B', proposal(), 'run-1');
    expect(out.classification).toBeNull();
    expect(out.content.openQuestions.join(' ')).toMatch(/class C rather than B/);
  });

  it('does not mutate the draft it was given', () => {
    const d = draft();
    applyMarketProposal(d, 'unclassified', proposal(), 'run-1');
    expect(d.answers.disclosures_required.answer).toBe('unknown');
    expect(d.sources).toHaveLength(1);
  });
});

describe('parseMarketExpansionOutput: labels where keys belong', () => {
  const reply = (over: Record<string, unknown>) =>
    JSON.stringify({ recommendation: 'propose', rationale: 'SYNTHETIC', ...over });

  it('maps an exact question, requirement or activity label to its key', () => {
    const out = parseMarketExpansionOutput(
      reply({
        answers: [{ question: 'Does the seller have a statutory right to cancel?', answer: 'unknown', note: 'n' }],
        requirements: [{ kind: 'Foreign entity registration', label: 'SOS', applies_to: ['Signing purchase agreements'] }],
      }),
    );
    expect(out?.answers[0].question).toBe('seller_cancellation_right');
    expect(out?.requirements[0]).toMatchObject({ kind: 'entity_registration', applies_to: ['seller_contracting'] });
  });

  it('still refuses anything that is neither a key nor an exact label', () => {
    expect(
      parseMarketExpansionOutput(reply({ answers: [{ question: 'Can the seller cancel?', answer: 'unknown', note: 'n' }] })),
    ).toBeNull();
  });
});
