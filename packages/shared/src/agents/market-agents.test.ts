import {
  applyMarketProposal,
  parseMarketExpansionOutput,
  parseMarketIntelligenceOutput,
  proposalIsEmpty,
  sanitizeMarketProposal,
  type MarketExpansionOutput,
} from './market-agents';
import {
  MarketPolicyContentSchema,
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
    expect(proposal.counselQuestions).toEqual(['Does the notice need a form?']);
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
    expect(proposalIsEmpty(sanitizeMarketProposal(output({ recommendation: 'not_now' }), ctx()).proposal)).toBe(true);
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
    expect(out.content.openQuestions).toEqual(['Which form?']);
    expect(out.content.activationSteps).toEqual(['Register the entity.']);
    expect(out.content.requirements).toHaveLength(1);
    expect(out.classification).toBe('C');
    expect(out.applied).toEqual(
      expect.objectContaining({
        answers: ['disclosures_required'],
        skipped: [],
        questions: 1,
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
