import {
  AGENT_TIER,
  MARKET_EXPANSION_PROMPT_VERSION,
  agentWorkflow,
  legalClearanceClaim,
  emptyPolicyContent,
  parseMarketExpansionOutput,
  proposalIsEmpty,
  prompts,
  resolveAgentModel,
  sanitizeMarketProposal,
  type AgentDecision,
  type AgentModels,
  type MarketExpansionOutput,
  type MarketPolicyContent,
  type PolicySource,
  type WebPage,
  numberWebPages,
} from '@halo/shared';
import { estimateAiCostUsd, webSearchCostUsd } from '../ai-model';
import { chatCompletion, webResearch } from '../internal-api.client';
import type { MarketExpansionContext } from './market-context';
import { AgentOutputError, type LeadAnalystResult } from './lead-analyst.agent';

/** Research, draft and sources run long; the strong tier reads them all. */
const MAX_CONTEXT_CHARS = 40000;

export interface MarketExpansionHardRule {
  rule: string;
  reason: string;
}

/**
 * When a person has already decided, or there is nothing to work from, no
 * model is asked: a market an operator blocked or restricted, a draft
 * counsel is reviewing (a proposal would change what they are reading), a
 * market already active, research missing, or a draft with no unknowns.
 */
export function hardRule(
  ctx: MarketExpansionContext,
  opts: { webResearch?: boolean } = {},
): MarketExpansionHardRule | null {
  const m = ctx.market;
  if (m.requestedStatus === 'BLOCKED' || m.requestedStatus === 'RESTRICTED') {
    return {
      rule: 'operator_decision',
      reason: `${m.name} was set to ${m.requestedStatus.toLowerCase()} by a person; the agent does not propose around that.`,
    };
  }
  if (m.draftStatus === 'in_review') {
    return {
      rule: 'in_review',
      reason: `Counsel is reviewing the ${m.name} draft; a proposal now would change what they are reading.`,
    };
  }
  if (m.effectiveStatus === 'ACTIVE') {
    return {
      rule: 'active',
      reason: `${m.name} is already active; nothing to propose.`,
    };
  }
  // With web research on, the agent finds its own sources.
  if (!ctx.research && !opts.webResearch) {
    return {
      rule: 'no_research',
      reason: `No research is on file for ${m.name}; import the bundled research, add sources to the draft, or ask for a proposal with web research.`,
    };
  }
  if (ctx.unanswered.length === 0) {
    return {
      rule: 'nothing_unknown',
      reason: `The ${m.name} draft answers every question.${m.nextStep ? ` Next: ${m.nextStep}` : ' Next: submit it for counsel review.'}`,
    };
  }
  return null;
}

function holdDecision(rule: MarketExpansionHardRule): AgentDecision {
  return {
    agent: 'market_expansion',
    promptVersion: MARKET_EXPANSION_PROMPT_VERSION,
    model: null,
    recommendation: 'hold',
    summary: `hold by rule ${rule.rule}: ${rule.reason}`,
    rationale: rule.reason,
    confidence: 1,
    hardRule: rule.rule,
    actions: [],
  };
}

/** The draft as sanitizeMarketProposal needs it. */
function draftOf(
  ctx: MarketExpansionContext,
): Pick<
  MarketPolicyContent,
  'answers' | 'requirements' | 'openQuestions' | 'activationSteps' | 'sources'
> {
  const empty = emptyPolicyContent();
  const d = ctx.draft;
  return {
    answers: {
      ...empty.answers,
      ...((d?.answers ?? {}) as Partial<MarketPolicyContent['answers']>),
    },
    requirements: (d?.requirements ?? []).map((r) => ({ ...r, sourceIds: [] })),
    openQuestions: d?.openQuestions ?? [],
    activationSteps: d?.activationSteps ?? [],
    sources: (d?.sources ?? []).map((s) => ({
      ...s,
      title: '',
      summary: '',
    })) as PolicySource[],
  };
}

export function decisionFromOutput(
  out: MarketExpansionOutput,
  model: string,
  ctx: MarketExpansionContext,
  web?: Pick<WebFindings, 'searches' | 'pages'>,
): AgentDecision {
  const { proposal, adjustments } = sanitizeMarketProposal(out, {
    state: ctx.market.state,
    draft: draftOf(ctx),
    researchSources: ctx.research?.sources ?? [],
    webPages: web?.pages,
  });
  const answered = proposal.answers.filter(
    (a) => a.answer !== 'unknown',
  ).length;
  const rationale = adjustments.length
    ? `${out.rationale}\n\nAdjusted by Halo's rules: ${adjustments.join('; ')}.`
    : out.rationale;
  if (out.recommendation === 'not_now' || proposalIsEmpty(proposal)) {
    return {
      agent: 'market_expansion',
      promptVersion: MARKET_EXPANSION_PROMPT_VERSION,
      model,
      recommendation: 'not_now',
      summary: `Nothing to add to the ${ctx.market.name} draft now${out.risks.length ? `: ${out.risks[0]}` : ''}`,
      rationale,
      hardRule: null,
      actions: [],
    };
  }
  const stillUnknown = proposal.answers.length - answered;
  const parts = [
    `${answered} sourced answer${answered === 1 ? '' : 's'}`,
    ...(stillUnknown
      ? [
          `${stillUnknown} note${stillUnknown === 1 ? '' : 's'} on question${stillUnknown === 1 ? '' : 's'} that stay unknown`,
        ]
      : []),
    `${proposal.counselQuestions.length} counsel question${proposal.counselQuestions.length === 1 ? '' : 's'}`,
    `${proposal.requirements.length} requirement${proposal.requirements.length === 1 ? '' : 's'}`,
    `${proposal.activationSteps.length} step${proposal.activationSteps.length === 1 ? '' : 's'}`,
  ];
  if (web) {
    const found = proposal.sources.filter((s) => s.summary.includes('Found by web search')).length;
    parts.push(
      `${found} web source${found === 1 ? '' : 's'} from ${web.searches} search${web.searches === 1 ? '' : 'es'}`,
    );
  }
  return {
    agent: 'market_expansion',
    promptVersion: MARKET_EXPANSION_PROMPT_VERSION,
    model,
    recommendation: 'propose',
    summary: `Proposal for the ${ctx.market.name} draft: ${parts.join(', ')}${proposal.classification ? `, class ${proposal.classification}` : ''}. Unverified until counsel reviews it.`,
    rationale,
    hardRule: null,
    actions: [{ type: 'propose_market_draft', proposal, gated: true }],
  };
}

/**
 * Prepares a market activation proposal for human review (design doc
 * s3.7). Reads the draft, what it leaves unknown and the bundled research;
 * proposes sourced answers, counsel questions, requirements, a class and
 * the steps to activation. Never self-approves: the only action is a gated
 * proposal that a person accepts into the editable draft, and the policy
 * still goes to counsel. It cannot submit, approve, activate or change a
 * status, because no action exists that does.
 */
export class MarketExpansionAgent {
  constructor(
    private readonly opts: {
      models?: AgentModels | null;
      chat?: typeof chatCompletion;
      research?: typeof webResearch;
      /** Search the web as well as reading the bundled research (a person's choice per run). */
      webResearch?: boolean;
    } = {},
  ) {}

  async run(
    ctx: MarketExpansionContext,
    accountId: string,
    runId: string,
  ): Promise<LeadAnalystResult> {
    const searching = this.opts.webResearch === true;
    const rule = hardRule(ctx, { webResearch: searching });
    if (rule) return { decision: holdDecision(rule), costUsd: 0 };

    const model = resolveAgentModel(
      AGENT_TIER.market_expansion,
      this.opts.models,
    );

    // Web research is two calls. A search step writes a plain report, so
    // the provider cites its pages itself (a JSON reply carries no
    // citations); the pages are numbered here, and the proposal step cites
    // them by number. The model never supplies a URL.
    let web: WebFindings | undefined;
    if (searching) {
      const research = this.opts.research ?? webResearch;
      const r = await research(accountId, {
        model,
        messages: [
          {
            role: 'system',
            content: prompts.market_expansion.research_system,
          },
          { role: 'user', content: researchPrompt(ctx) },
        ],
        temperature: 0.1,
        maxTokens: 2500,
        maxSearches: researchMaxSearches(),
        automationRunId: runId,
        workflow: agentWorkflow('market_expansion'),
      });
      web = {
        searches: r.searches,
        pages: numberWebPages(r.sources),
        report: r.content.slice(0, MAX_REPORT_CHARS),
        costUsd:
          estimateAiCostUsd(r.model, r.tokensIn, r.tokensOut) +
          webSearchCostUsd(r.model, r.searches),
      };
    }

    const modelContext = web
      ? { web_findings: { report: web.report, pages: web.pages }, ...ctx }
      : ctx;
    const user = (
      web ? prompts.market_expansion.user_web : prompts.market_expansion.user
    )
      .split('{{context}}')
      .join(JSON.stringify(modelContext, null, 1).slice(0, MAX_CONTEXT_CHARS));
    const chat = this.opts.chat ?? chatCompletion;
    const completion = await chat(accountId, {
      model,
      messages: [
        { role: 'system', content: prompts.market_expansion.system },
        { role: 'user', content: user },
      ],
      temperature: 0.1,
      maxTokens: 3000,
      automationRunId: runId,
      workflow: agentWorkflow('market_expansion'),
    });
    const costUsd =
      estimateAiCostUsd(
        completion.model,
        completion.tokensIn,
        completion.tokensOut,
      ) + (web?.costUsd ?? 0);
    const out = parseMarketExpansionOutput(completion.content);
    if (!out) {
      throw new AgentOutputError(
        'The model reply was not the JSON the prompt asked for',
        completion.content,
      );
    }
    const claim = legalClearanceClaim(
      [
        out.classification_reason,
        ...out.answers.map((a) => a.note),
        ...out.counsel_questions,
        ...out.activation_steps,
        ...out.risks,
      ].join('\n'),
    );
    if (claim) {
      throw new AgentOutputError(
        `The reply says a market is cleared to operate in ("${claim}"); only counsel's approval does that`,
        completion.content,
      );
    }
    return {
      decision: decisionFromOutput(out, completion.model, ctx, web),
      costUsd,
      raw: completion.content,
      // The replay keeps what the search found, so the run can be judged later.
      ...(web ? { seen: modelContext } : {}),
    };
  }
}

/** What a run's search step found, as the proposal step and the decision see it. */
export interface WebFindings {
  searches: number;
  pages: WebPage[];
  report: string;
  costUsd: number;
}

const MAX_REPORT_CHARS = 8000;

/** The search step's prompt: the unknown questions, and what is already on file. */
export function researchPrompt(ctx: MarketExpansionContext): string {
  const questions = ctx.unanswered
    .map(
      (q) =>
        `- ${q.label}${q.requiredForApproval ? ' (needed for approval)' : ''}`,
    )
    .join('\n');
  const known = [
    ctx.research?.summary,
    ...(ctx.draft?.openQuestions ?? []).map((q) => `Already asked: ${q}`),
    ...(ctx.research?.sources ?? []).map((s) => `On file: ${s.citation}`),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000);
  return prompts.market_expansion.research_user
    .split('{{state}}')
    .join(`${ctx.market.name} (${ctx.market.state})`)
    .split('{{questions}}')
    .join(questions || '- None listed')
    .split('{{known}}')
    .join(known || 'Nothing yet.');
}

const DEFAULT_MAX_SEARCHES = 5;

/** Searches one web-research run may make (AGENT_RESEARCH_MAX_SEARCHES, 1-10). */
export function researchMaxSearches(): number {
  const n = Number(process.env.AGENT_RESEARCH_MAX_SEARCHES);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : DEFAULT_MAX_SEARCHES;
}
