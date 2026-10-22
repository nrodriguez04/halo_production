import { z } from 'zod';
import {
  ANSWERS,
  APPROVAL_REQUIRED_QUESTIONS,
  AUTHORIZATION_KINDS,
  MARKET_ACTIVITIES,
  MARKET_CLASSIFICATIONS,
  MARKET_QUESTIONS,
  type Answer,
  type AuthorizationKind,
  type MarketActivity,
  type MarketClassification,
  type MarketPolicyContent,
  type MarketQuestion,
  type PolicySource,
} from '../markets/policy';

/**
 * The two market agents (docs/agent-design.md s3.6, s3.7). Neither one can
 * change what Halo is allowed to do: the Market Intelligence agent explains
 * a ranking that is computed without it, and the Market Expansion agent
 * proposes additions to a market's editable draft, which a person accepts
 * or not, and which still needs counsel's approval before any gate reads it.
 */

/** The Market Intelligence agent's scope when it looks at the whole country. */
export const NATIONWIDE_SCOPE = 'US';

/** The first JSON object in a model reply, or undefined when there is none. */
function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Words that tell a person a market is cleared to operate in. Only
 * counsel's approval of a policy version does that, so a market agent's
 * reply that says it is refused, not recorded.
 */
const LEGAL_CLEARANCE =
  /\b((is|are|now|becomes?) (fully )?(legal|lawful|approved|cleared|authorized|safe) (to|for|in)|(approved|cleared) for (operation|operating|wholesaling|activation)|green[- ]?light(ed)?|no licen[cs]e (is )?(ever )?needed)\b/i;

/** The clearance claim in a text, or null when it makes none. */
export function legalClearanceClaim(text: string): string | null {
  return text.match(LEGAL_CLEARANCE)?.[0] ?? null;
}

// ------------------------------------------------------- Market Intelligence

export const MARKET_INTELLIGENCE_PROMPT_VERSION = 'market_intelligence.v1';

export const MarketIntelligenceOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  priorities: z
    .array(
      z.object({
        /** A candidate key from the context: a state code, or a county key. */
        key: z.string().min(1).max(32),
        why: z.string().min(1).max(600),
        risks: z.string().max(600).default(''),
        verify: z.array(z.string().min(1).max(300)).max(6).default([]),
      }),
    )
    .max(5)
    .default([]),
  data_gaps: z.array(z.string().min(1).max(300)).max(10).default([]),
  rationale: z.string().min(1).max(2000),
});
export type MarketIntelligenceOutput = z.infer<typeof MarketIntelligenceOutputSchema>;

export function parseMarketIntelligenceOutput(text: string): MarketIntelligenceOutput | null {
  const raw = firstJsonObject(text);
  if (raw === undefined) return null;
  const parsed = MarketIntelligenceOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The brief a run records: the ranking's order, the model's explanation. */
export interface MarketBrief {
  scope: string;
  asOf: string;
  summary: string;
  priorities: Array<{
    key: string;
    label: string;
    /** Position in the deterministic ranking (1 = first); the model cannot change it. */
    rank: number;
    why: string;
    risks: string;
    verify: string[];
  }>;
  dataGaps: string[];
}

// ---------------------------------------------------------- Market Expansion

export const MARKET_EXPANSION_PROMPT_VERSION = 'market_expansion.v1';

export const MarketExpansionOutputSchema = z.object({
  recommendation: z.enum(['propose', 'not_now']),
  classification: z.enum(MARKET_CLASSIFICATIONS).nullable().default(null),
  classification_reason: z.string().max(1000).default(''),
  answers: z
    .array(
      z.object({
        question: z.enum(MARKET_QUESTIONS),
        answer: z.enum(ANSWERS),
        note: z.string().min(1).max(1500),
        source_ids: z.array(z.string().max(32)).max(10).default([]),
      }),
    )
    .max(MARKET_QUESTIONS.length)
    .default([]),
  counsel_questions: z.array(z.string().min(1).max(500)).max(15).default([]),
  requirements: z
    .array(
      z.object({
        kind: z.enum(AUTHORIZATION_KINDS),
        label: z.string().min(1).max(200),
        applies_to: z.array(z.enum(MARKET_ACTIVITIES)).min(1).max(MARKET_ACTIVITIES.length),
        source_ids: z.array(z.string().max(32)).max(10).default([]),
      }),
    )
    .max(8)
    .default([]),
  activation_steps: z.array(z.string().min(1).max(500)).max(15).default([]),
  risks: z.array(z.string().min(1).max(500)).max(10).default([]),
  rationale: z.string().min(1).max(3000),
});
export type MarketExpansionOutput = z.infer<typeof MarketExpansionOutputSchema>;

export function parseMarketExpansionOutput(text: string): MarketExpansionOutput | null {
  const raw = firstJsonObject(text);
  if (raw === undefined) return null;
  const parsed = MarketExpansionOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What a person accepts into the draft when they approve a Market Expansion run. */
export interface MarketDraftProposal {
  state: string;
  /** Only proposed while every question an approval needs is answered. */
  classification: MarketClassification | null;
  classificationReason: string;
  /** Answers to questions the draft leaves unknown; nothing else is touched. */
  answers: Array<{
    question: MarketQuestion;
    answer: Answer;
    note: string;
    sourceIds: string[];
  }>;
  counselQuestions: string[];
  requirements: Array<{
    key: string;
    kind: AuthorizationKind;
    label: string;
    appliesTo: MarketActivity[];
    sourceIds: string[];
  }>;
  activationSteps: string[];
  risks: string[];
  /** Research sources the proposal cites that the draft does not hold yet. */
  sources: PolicySource[];
}

/** Classes that would let Halo contract without a license or registration. */
const PERMISSIVE_CLASSES: readonly MarketClassification[] = ['A', 'B'];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

/**
 * Turns the model's answer into a proposal Halo is willing to show a
 * person. Enforced here, in code, whatever the model wrote:
 * - only questions the draft leaves unknown are answered;
 * - a source the context does not hold is dropped;
 * - an answer with no source left becomes unknown: an unsourced "no
 *   registration needed" is exactly the guess the policy rules forbid;
 * - a permissive class (A or B) is not proposed while any question an
 *   approval needs would still be unknown.
 */
export function sanitizeMarketProposal(
  out: MarketExpansionOutput,
  ctx: {
    state: string;
    draft: Pick<MarketPolicyContent, 'answers' | 'requirements' | 'openQuestions' | 'activationSteps' | 'sources'>;
    researchSources: PolicySource[];
  },
): { proposal: MarketDraftProposal; adjustments: string[] } {
  const adjustments: string[] = [];
  const draftIds = new Set(ctx.draft.sources.map((s) => s.id));
  const research = new Map(ctx.researchSources.map((s) => [s.id, s]));
  const known = (id: string) => draftIds.has(id) || research.has(id);
  const cited = new Set<string>();
  const keep = (ids: string[], where: string) => {
    const ok = ids.filter(known);
    if (ok.length < ids.length) {
      adjustments.push(`${where}: dropped unknown source(s) ${ids.filter((i) => !known(i)).join(', ')}`);
    }
    ok.forEach((id) => cited.add(id));
    return ok;
  };

  const answers: MarketDraftProposal['answers'] = [];
  for (const a of out.answers) {
    if (ctx.draft.answers[a.question]?.answer !== 'unknown') {
      adjustments.push(`${a.question}: already answered in the draft; left as it is`);
      continue;
    }
    if (answers.some((x) => x.question === a.question)) continue;
    const sourceIds = keep(a.source_ids, a.question);
    let answer = a.answer;
    let note = a.note.trim();
    if (answer !== 'unknown' && sourceIds.length === 0) {
      adjustments.push(`${a.question}: "${answer}" had no source; kept as unknown`);
      answer = 'unknown';
      note = `${note} (No source was cited, so this stays unknown.)`;
    }
    answers.push({ question: a.question, answer, note, sourceIds });
  }

  const after = (q: MarketQuestion) =>
    answers.find((x) => x.question === q)?.answer ?? ctx.draft.answers[q]?.answer ?? 'unknown';
  const stillUnknown = APPROVAL_REQUIRED_QUESTIONS.filter((q) => after(q) === 'unknown');
  let classification = out.classification === 'unclassified' ? null : out.classification;
  const counselQuestions = [...out.counsel_questions.map((q) => q.trim())];
  if (classification && PERMISSIVE_CLASSES.includes(classification) && stillUnknown.length) {
    adjustments.push(`class ${classification} not proposed: ${stillUnknown.join(', ')} still unknown`);
    counselQuestions.push(
      `The research suggests class ${classification}, but ${stillUnknown.join(', ')} ${stillUnknown.length === 1 ? 'is' : 'are'} unknown; the class cannot be set until counsel answers ${stillUnknown.length === 1 ? 'it' : 'them'}.`,
    );
    classification = null;
  }

  const takenKeys = new Set(ctx.draft.requirements.map((r) => r.key));
  const requirements: MarketDraftProposal['requirements'] = [];
  for (const r of out.requirements) {
    const base = `${r.kind}_${slug(r.label)}`.slice(0, 60) || r.kind;
    let key = /^[a-z]/.test(base) ? base : `req_${base}`;
    if (takenKeys.has(key) || ctx.draft.requirements.some((x) => x.kind === r.kind)) {
      adjustments.push(`requirement ${r.kind}: the draft already has one; left as it is`);
      continue;
    }
    takenKeys.add(key);
    key = key.slice(0, 64);
    requirements.push({
      key,
      kind: r.kind,
      label: r.label.trim(),
      appliesTo: Array.from(new Set(r.applies_to)),
      sourceIds: keep(r.source_ids, `requirement ${r.kind}`),
    });
  }

  const fresh = (list: string[], existing: string[]) => {
    const seen = new Set(existing.map((s) => s.trim().toLowerCase()));
    const outList: string[] = [];
    for (const s of list) {
      const k = s.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      outList.push(s.trim());
    }
    return outList;
  };

  const sources = Array.from(cited)
    .filter((id) => !draftIds.has(id))
    .map((id) => research.get(id) as PolicySource);

  return {
    proposal: {
      state: ctx.state,
      classification,
      classificationReason: classification ? out.classification_reason.trim() : '',
      answers,
      counselQuestions: fresh(counselQuestions, ctx.draft.openQuestions),
      requirements,
      activationSteps: fresh(out.activation_steps, ctx.draft.activationSteps),
      risks: out.risks.map((r) => r.trim()).filter(Boolean),
      sources,
    },
    adjustments,
  };
}

/** Whether a proposal would change anything in the draft. */
export function proposalIsEmpty(p: MarketDraftProposal): boolean {
  return (
    !p.classification &&
    p.answers.length === 0 &&
    p.counselQuestions.length === 0 &&
    p.requirements.length === 0 &&
    p.activationSteps.length === 0
  );
}

export const AGENT_PROPOSAL_NOTE = 'Proposed by the Market Expansion agent, not verified; counsel to confirm.';

/**
 * Applies an approved proposal to the current draft. The same rules again,
 * against the draft as it is now rather than as the agent saw it: a person
 * may have answered a question in between, and their answer wins.
 */
export function applyMarketProposal(
  draft: MarketPolicyContent,
  currentClassification: MarketClassification,
  p: MarketDraftProposal,
  runRef: string,
): {
  content: MarketPolicyContent;
  classification: MarketClassification | null;
  applied: {
    answers: MarketQuestion[];
    skipped: MarketQuestion[];
    questions: number;
    steps: number;
    requirements: number;
    sources: number;
  };
} {
  const content: MarketPolicyContent = JSON.parse(JSON.stringify(draft));
  const tag = `[${AGENT_PROPOSAL_NOTE} Run ${runRef}.]`;
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  // Sources first, so the answers that cite them validate.
  let addedSources = 0;
  const ids = new Set(content.sources.map((s) => s.id));
  for (const s of p.sources) {
    if (ids.has(s.id) || content.sources.length >= 60) continue;
    content.sources.push(s);
    ids.add(s.id);
    addedSources++;
  }
  const cite = (list: string[]) => list.filter((id) => ids.has(id)).slice(0, 20);

  const answered: MarketQuestion[] = [];
  const skipped: MarketQuestion[] = [];
  for (const a of p.answers) {
    if (content.answers[a.question].answer !== 'unknown') {
      skipped.push(a.question);
      continue;
    }
    const sourceIds = cite(a.sourceIds);
    const answer: Answer = a.answer !== 'unknown' && sourceIds.length === 0 ? 'unknown' : a.answer;
    const previous = content.answers[a.question].note.trim();
    content.answers[a.question] = {
      answer,
      note: clip([previous, `${tag} ${a.note}`].filter(Boolean).join('\n\n'), 4000),
      sourceIds,
    };
    answered.push(a.question);
  }

  const room = (list: string[], max: number) => Math.max(0, max - list.length);
  const questions = p.counselQuestions
    .filter((q) => !content.openQuestions.includes(q))
    .slice(0, room(content.openQuestions, 40))
    .map((q) => clip(q, 500));
  content.openQuestions.push(...questions);
  const steps = p.activationSteps
    .filter((s) => !content.activationSteps.includes(s))
    .slice(0, room(content.activationSteps, 40))
    .map((s) => clip(s, 500));
  content.activationSteps.push(...steps);

  let requirements = 0;
  const keys = new Set(content.requirements.map((r) => r.key));
  for (const r of p.requirements) {
    if (keys.has(r.key) || content.requirements.length >= 20) continue;
    content.requirements.push({ ...r, sourceIds: cite(r.sourceIds) });
    keys.add(r.key);
    requirements++;
  }

  let classification: MarketClassification | null = null;
  if (p.classification) {
    if (currentClassification === 'unclassified') {
      const stillUnknown = APPROVAL_REQUIRED_QUESTIONS.filter((q) => content.answers[q].answer === 'unknown');
      if (!PERMISSIVE_CLASSES.includes(p.classification) || stillUnknown.length === 0) {
        classification = p.classification;
      }
    } else if (currentClassification !== p.classification) {
      const q = clip(
        `Agent proposal (run ${runRef}): class ${p.classification} rather than ${currentClassification}. ${p.classificationReason}`,
        500,
      );
      if (!content.openQuestions.includes(q) && content.openQuestions.length < 40) content.openQuestions.push(q);
    }
  }

  return {
    content,
    classification,
    applied: {
      answers: answered,
      skipped,
      questions: questions.length,
      steps: steps.length,
      requirements,
      sources: addedSources,
    },
  };
}
