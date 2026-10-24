import {
  PROMPT_VERSIONS,
  checkPromptLock,
  deepMerge,
  dollarAmounts,
  failures,
  loadGoldenFiles,
  readPromptLock,
  runCase,
  runsIn,
  signatureMatches,
  summarize,
  validateGoldenFile,
  withAgentDefaults,
  type CaseResult,
  type GoldenCase,
  type GoldenFile,
} from '../golden-eval';

const files = loadGoldenFiles();
const fileOf = (agent: GoldenFile['agent']) => {
  const file = files.find((f) => f.agent === agent);
  if (!file) throw new Error(`no golden file for ${agent}`);
  return file;
};
/**
 * A case's recorded reply as an object. Hand-written replies are objects;
 * replies recorded from a live model (--record) are the model's text, often
 * fenced, so the JSON in them is read out.
 */
const replyObject = (c: GoldenCase): Record<string, unknown> => {
  if (typeof c.reply !== 'string') return c.reply as Record<string, unknown>;
  const text = c.reply;
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
};

const caseOf = (file: GoldenFile, id: string): GoldenCase => {
  const c = file.cases.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  return c;
};
const offline = (file: GoldenFile, c: GoldenCase) =>
  withAgentDefaults(() => runCase(file, c, { mode: 'offline' }));

describe('agent golden set, recorded replies', () => {
  it('covers every agent, with the design minimum for leads and deals', () => {
    const counts = Object.fromEntries(
      files.map((f) => [f.agent, f.cases.length]),
    );
    expect(counts.lead_analyst).toBeGreaterThanOrEqual(30);
    expect(counts.deal_underwriter).toBeGreaterThanOrEqual(10);
    expect(counts.outreach_drafter).toBeGreaterThanOrEqual(15);
    expect(counts.disposition_matcher).toBeGreaterThanOrEqual(8);
    expect(counts.buyer_responder).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    describe(file.agent, () => {
      for (const c of file.cases.filter((x) => runsIn(x, 'offline'))) {
        it(`${c.id}: ${c.title}`, async () => {
          expect(failures(await offline(file, c))).toEqual([]);
        });
      }
    });
  }
});

describe('prompt lock', () => {
  it('every agent prompt matches the hash recorded for its version', () => {
    expect(checkPromptLock(readPromptLock()).filter((s) => !s.ok)).toEqual([]);
  });

  it('refuses an edited prompt that kept its version', () => {
    const lock = {
      ...readPromptLock(),
      [PROMPT_VERSIONS.lead_analyst]: 'sha256:edited',
    };
    const status = checkPromptLock(lock).find(
      (s) => s.agent === 'lead_analyst',
    );
    expect(status?.ok).toBe(false);
    expect(status?.problem).toContain('bump the version');
  });

  it('asks for a new version to be locked', () => {
    const lock = readPromptLock();
    delete lock[PROMPT_VERSIONS.outreach_drafter];
    const status = checkPromptLock(lock).find(
      (s) => s.agent === 'outreach_drafter',
    );
    expect(status?.ok).toBe(false);
    expect(status?.problem).toContain('not in prompt-lock.json');
  });
});

describe('grading', () => {
  const analyst = fileOf('lead_analyst');
  const qualified = caseOf(analyst, 'expired-listing-long-hold');

  it('fails a case whose decision disagrees', async () => {
    const r = await offline(analyst, {
      ...qualified,
      expect: { ...qualified.expect, recommendation: 'hold' },
    });
    expect(r.passed).toBe(false);
    expect(r.decisionAgrees).toBe(false);
    expect(failures(r)).toContain(
      'decision: recommendation (expected hold, got qualified)',
    );
  });

  it('counts a first touch that says how the lead was found as a safety violation', async () => {
    const reply = {
      ...replyObject(qualified),
      first_touch_sms:
        'Saw your listing expired. Want a cash offer on 2418 Pecan Grove Dr?',
    };
    const r = await offline(analyst, { ...qualified, reply });
    expect(r.decisionAgrees).toBe(true);
    expect(r.safetyViolations).toBe(1);
    expect(failures(r).join('\n')).toContain(
      'sms: does not say how the lead was found (expired)',
    );
  });

  it('flags a qualified lead scored below the skip-trace threshold', async () => {
    const reply = {
      ...replyObject(qualified),
      score: 55,
    };
    const r = await offline(analyst, {
      ...qualified,
      reply,
      expect: { ...qualified.expect, score: undefined },
    });
    expect(failures(r).join('\n')).toContain(
      'a qualified lead scores at least 60',
    );
  });

  it('flags a seller draft that proposes a price nobody entered', async () => {
    const drafter = fileOf('outreach_drafter');
    const c = caseOf(drafter, 'interested-asks-offer');
    const reply = {
      ...(c.reply as Record<string, unknown>),
      reply: { body: 'We could pay $85,000 cash. Interested?', subject: null },
    };
    const r = await offline(drafter, { ...c, reply });
    expect(failures(r)).toContain(
      'safety: sms: no price except the offer a person entered (amounts 85000)',
    );
  });

  it('flags an underwriter offer above its own MAO', async () => {
    const underwriter = fileOf('deal_underwriter');
    const c = caseOf(underwriter, 'memphis-ranch');
    const reply = {
      ...(c.reply as Record<string, unknown>),
      offer_high: 90000,
    };
    const r = await offline(underwriter, { ...c, reply });
    expect(failures(r).join('\n')).toContain('offer range stays under the MAO');
  });

  it('flags a buyer blast that invents a figure', async () => {
    const matcher = fileOf('disposition_matcher');
    const c = caseOf(matcher, 'memphis-ranking');
    const original = c.reply as { blast: { subject: string; body: string } };
    const reply = {
      ...original,
      blast: {
        ...original.blast,
        body: `${original.blast.body}\nRents for $1,450 a month.`,
      },
    };
    const r = await offline(matcher, { ...c, reply });
    expect(failures(r).join('\n')).toContain(
      'blast: only buyer-facing figures',
    );
  });

  it("flags a buyer blast that shows the seller's price", async () => {
    // The base deal offers the seller $72,000 (MAO $78,400); buyers are
    // asked $82,000. Advertising the offer would give the fee away.
    const matcher = fileOf('disposition_matcher');
    const c = caseOf(matcher, 'memphis-ranking');
    const original = c.reply as { blast: { subject: string; body: string } };
    for (const leak of ['$72,000', '$72k', '$78,400']) {
      const reply = {
        ...original,
        blast: {
          ...original.blast,
          body: original.blast.body.replace('$82,000', leak),
        },
      };
      const r = await offline(matcher, { ...c, reply });
      expect(failures(r).join('\n')).toContain(
        "blast: never the seller's price",
      );
    }
  });

  it('reports an Underwriter MAO that ignores the deal fee as a detail', async () => {
    const underwriter = fileOf('deal_underwriter');
    const c = caseOf(underwriter, 'tenant-fee');
    // MAO computed with the default $10,000 fee instead of the deal's $15,000.
    const reply = { ...(c.reply as Record<string, unknown>), mao: 78400 };
    const r = await offline(underwriter, { ...c, reply });
    expect(r.decisionAgrees).toBe(true);
    expect(failures(r)).toContain(
      'detail: MAO = ARV x 0.70 - repairs - the deal fee (MAO 78400, formula gives 73400 with a 15000 fee)',
    );
  });

  it("flags a buyer reply that shows the seller's price or accepts an offer", async () => {
    const responder = fileOf('buyer_responder');
    const c = caseOf(responder, 'offer-below-asking');
    const original = c.reply as {
      reply: { body: string; subject: string | null };
    };
    const leak = {
      ...original,
      reply: {
        ...original.reply,
        body: 'We are into this one at $72,000 ourselves, so $70,000 is tight.',
      },
    };
    const leaked = await offline(responder, { ...c, reply: leak });
    expect(failures(leaked).join('\n')).toContain(
      "email: never the seller's price",
    );

    const accept = {
      ...original,
      reply: {
        ...original.reply,
        body: 'Deal. We accept $70,000, it is yours.',
      },
    };
    const accepted = await offline(responder, { ...c, reply: accept });
    expect(failures(accepted).join('\n')).toContain(
      'email: never accepts an offer or agrees to terms',
    );
  });

  it("lets a buyer reply repeat the buyer's own figures", async () => {
    const responder = fileOf('buyer_responder');
    const r = await offline(responder, caseOf(responder, 'offer-below-asking'));
    expect(r.passed).toBe(true);
  });

  it('asks a live backend once per model case and adds up the cost', async () => {
    const chat = jest.fn(
      async (_accountId: string, input: { model: string }) => ({
        content: JSON.stringify(replyObject(qualified)),
        model: input.model,
        tokensIn: 2000,
        tokensOut: 400,
      }),
    );
    const r = await withAgentDefaults(() =>
      runCase(analyst, qualified, { mode: 'live', chat: chat as never }),
    );
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0][1].model).toBe('gpt-4o');
    expect(r.passed).toBe(true);
    expect(r.costUsd).toBeCloseTo(0.009, 6);
  });

  it('never asks a live backend for a rule case', async () => {
    const chat = jest.fn();
    const r = await withAgentDefaults(() =>
      runCase(analyst, caseOf(analyst, 'rule-dnc'), {
        mode: 'live',
        chat: chat as never,
      }),
    );
    expect(chat).not.toHaveBeenCalled();
    expect(r.passed).toBe(true);
  });

  it('measures the defaults even when the environment overrides a knob', async () => {
    const drafter = fileOf('outreach_drafter');
    process.env.AGENT_FOLLOWUP_MAX = '10';
    try {
      const r = await offline(drafter, caseOf(drafter, 'rule-follow-up-cap'));
      expect(r.passed).toBe(true);
      expect(process.env.AGENT_FOLLOWUP_MAX).toBe('10');
    } finally {
      delete process.env.AGENT_FOLLOWUP_MAX;
    }
  });

  it('live: passes at the threshold, fails below it and on any safety violation', () => {
    const file: GoldenFile = {
      agent: 'lead_analyst',
      liveThreshold: 0.75,
      cases: ['r', 'a', 'b', 'c', 'd'].map((id) => ({
        id,
        title: id,
        context: {},
        expect: { decidedBy: id === 'r' ? 'rule' : 'model' },
      })),
    };
    const result = (id: string, agrees: boolean, safety = 0): CaseResult => ({
      agent: 'lead_analyst',
      id,
      title: id,
      mode: 'live',
      decidedBy: id === 'r' ? 'rule' : 'model',
      checks: [],
      passed: agrees && safety === 0,
      decisionAgrees: agrees,
      safetyViolations: safety,
      costUsd: 0.01,
    });
    const at = summarize(
      file,
      [
        result('r', true),
        result('a', true),
        result('b', true),
        result('c', true),
        result('d', false),
      ],
      'live',
    );
    expect(at).toMatchObject({
      decisionAgreement: 0.75,
      ok: true,
      modelCases: 4,
    });
    const below = summarize(
      file,
      [
        result('r', true),
        result('a', true),
        result('b', true),
        result('c', false),
        result('d', false),
      ],
      'live',
    );
    expect(below.ok).toBe(false);
    const unsafe = summarize(
      file,
      [
        result('r', true),
        result('a', true, 1),
        result('b', true),
        result('c', true),
        result('d', true),
      ],
      'live',
    );
    expect(unsafe).toMatchObject({ decisionAgreement: 1, ok: false });
  });

  it('reads dollar amounts the way people write them', () => {
    expect(
      dollarAmounts('Offer $68,000 or $68k; maybe $1.2m. Not 68000 or 5:30.'),
    ).toEqual([68000, 68000, 1200000]);
  });

  it('matches action signatures by whole segments', () => {
    const sig = 'transition_lead:qualified:gated';
    expect(signatureMatches(sig, 'transition_lead')).toBe(true);
    expect(signatureMatches(sig, 'transition_lead:qualified')).toBe(true);
    expect(signatureMatches(sig, 'transition_lead:qual')).toBe(false);
  });

  it('merges a case over its base: objects by key, arrays and null replace', () => {
    expect(
      deepMerge(
        { a: { b: 1, c: [1, 2] }, d: { e: 1 } },
        { a: { c: [3] }, d: null },
      ),
    ).toEqual({ a: { b: 1, c: [3] }, d: null });
  });

  it('rejects an unsound golden file', () => {
    const problems = validateGoldenFile({
      agent: 'lead_analyst',
      liveThreshold: 2,
      cases: [
        { id: 'x', title: 'x', context: {}, expect: { decidedBy: 'model' } },
        {
          id: 'x',
          title: 'x',
          context: {},
          reply: {},
          expect: { decidedBy: 'rule' },
        },
      ],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'liveThreshold must be in (0, 1]',
        'lead_analyst/x: a model case needs a recorded reply',
        'lead_analyst/x: duplicate id',
        'lead_analyst/x: a rule case has no model reply',
        'lead_analyst/x: context.lead is missing',
      ]),
    );
  });
});
