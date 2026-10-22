import { BadRequestException, Injectable } from '@nestjs/common';
import {
  APPROVAL_REQUIRED_QUESTIONS,
  MARKET_QUESTIONS,
  NATIONWIDE_SCOPE,
  QUESTION_LABEL,
  draftFromResearch,
  jurisdiction,
  toJurisdictionCode,
  type AgentName,
  type MarketPolicyContent,
} from '@halo/shared';
import { MarketsService } from '../markets/markets.service';
import { MarketIntelligenceService } from './market-intelligence.service';

const clip = (s: string | null | undefined, n: number) => {
  const v = (s ?? '').trim();
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};

/** How many ranked candidates the Market Intelligence agent sees. */
const BRIEF_CANDIDATES = 8;

/**
 * What the two market agents see (docs/agent-design.md s3.6, s3.7). Built
 * here because the research, the evaluation and the ranking live in the
 * api; the worker asks for it through /internal and never reads them
 * itself. Nothing here is contact data.
 */
@Injectable()
export class MarketAgentContextService {
  constructor(
    private markets: MarketsService,
    private intelligence: MarketIntelligenceService,
  ) {}

  /** The scope an agent works on: a state code, or US for the nationwide brief. */
  scope(agent: AgentName, entityId: string): string {
    const raw = entityId.trim().toUpperCase();
    if (agent === 'market_intelligence' && raw === NATIONWIDE_SCOPE) return raw;
    const code = toJurisdictionCode(raw);
    if (!code) {
      throw new BadRequestException(
        agent === 'market_intelligence'
          ? `"${entityId}" is not a state, DC or ${NATIONWIDE_SCOPE}.`
          : `"${entityId}" is not one of the 50 states or DC.`,
      );
    }
    return code;
  }

  async forAgent(accountId: string, agent: AgentName, entityId: string) {
    const scope = this.scope(agent, entityId);
    if (agent === 'market_intelligence')
      return this.intelligenceContext(accountId, scope);
    if (agent === 'market_expansion')
      return this.expansionContext(accountId, scope);
    throw new BadRequestException(`${agent} does not work on markets`);
  }

  /** The ranking, as Halo computed it, with what each number rests on. */
  async intelligenceContext(accountId: string, scope: string) {
    const matrix = await this.markets.matrix(accountId);
    const kpis = matrix.kpis;
    if (scope === NATIONWIDE_SCOPE) {
      // Every state Halo could work on, then only those the data scores:
      // a state with no recorded sales has nothing to explain.
      const rec = await this.intelligence.recommendations(accountId, 51);
      const scored = rec.recommendations.filter((r) => r.opportunity > 0);
      return {
        scope,
        asOf: rec.asOf.toISOString(),
        candidates: scored.slice(0, BRIEF_CANDIDATES).map((r, i) => ({
          key: r.state,
          label: jurisdiction(r.state)?.name ?? r.state,
          kind: 'state' as const,
          rank: i + 1,
          priority: r.priority,
          opportunity: r.opportunity,
          feasibility: r.feasibility,
          status: r.status,
          classification: r.classification,
          classificationProposed: r.classificationProposed,
          topCounties: r.topGeos,
          reasons: r.reasons,
          nextStep: r.nextStep,
        })),
        coverage: {
          ...rec.dataCoverage,
          unscoredStates: rec.recommendations.length - scored.length,
        },
        kpis,
      };
    }
    const [geos, row] = await Promise.all([
      this.intelligence.geos(accountId, {
        level: 'county',
        state: scope,
        limit: BRIEF_CANDIDATES,
      }),
      Promise.resolve(matrix.rows.find((r) => r.state === scope)),
    ]);
    return {
      scope,
      asOf: geos.asOf.toISOString(),
      market: row
        ? {
            state: row.state,
            name: row.name,
            status: row.effectiveStatus,
            classification: row.classification,
            classificationProposed: row.classificationSource === 'draft',
            nextStep: row.nextStep,
          }
        : null,
      candidates: geos.geos.map((g, i) => ({
        key: g.key,
        label: g.label,
        kind: 'county' as const,
        rank: i + 1,
        score: g.score,
        opportunity: g.opportunity,
        sales12m: g.sales12m,
        medianPrice: g.medianPrice,
        investorPurchases12m: g.investorPurchases12m,
        distinctInvestors12m: g.distinctInvestors12m,
        cashShare: g.cashShare,
        latestSale: g.latestSale,
        sources: g.sources,
        components: g.components.map((c) => ({
          label: c.label,
          points: c.points,
          max: c.max,
          basis: c.basis,
          detail: clip(c.detail, 240),
        })),
      })),
      coverage: { counties: geos.total, states: geos.total ? 1 : 0 },
      kpis,
    };
  }

  /** One state's draft, what it leaves unknown, and the research behind it. */
  async expansionContext(accountId: string, state: string) {
    const [d, geos] = await Promise.all([
      this.markets.detail(accountId, state),
      this.intelligence.geos(accountId, { level: 'county', state, limit: 5 }),
    ]);
    const draft = d.draft as MarketPolicyContent | null;
    const research = this.markets.research(state);
    const unanswered = MARKET_QUESTIONS.filter(
      (q) => !draft || draft.answers[q].answer === 'unknown',
    ).map((q) => ({
      key: q,
      label: QUESTION_LABEL[q],
      requiredForApproval: APPROVAL_REQUIRED_QUESTIONS.includes(q),
    }));
    return {
      market: {
        state: d.state,
        name: d.name,
        requestedStatus: d.requestedStatus,
        effectiveStatus: d.effectiveStatus,
        draftStatus: d.market.draftStatus,
        classification: d.market.draftClassification,
        approvedVersion: d.legal.version,
        nextStep: d.nextStep,
        missing: d.missing.slice(0, 12),
      },
      draft: draft
        ? {
            summary: clip(draft.summary, 1500),
            answers: Object.fromEntries(
              MARKET_QUESTIONS.map((q) => [
                q,
                {
                  answer: draft.answers[q].answer,
                  note: clip(draft.answers[q].note, 500),
                  sourceIds: draft.answers[q].sourceIds,
                },
              ]),
            ),
            requirements: draft.requirements.map((r) => ({
              key: r.key,
              kind: r.kind,
              label: r.label,
              appliesTo: r.appliesTo,
            })),
            disclosures: draft.disclosures.map((x) => ({
              key: x.key,
              title: x.title,
              audience: x.audience,
              timing: x.timing,
            })),
            deadlines: draft.deadlines.map((x) => ({
              label: x.label,
              days: x.days,
              businessDays: x.businessDays,
              effect: x.effect,
            })),
            openQuestions: draft.openQuestions,
            activationSteps: draft.activationSteps,
            sources: draft.sources.map((s) => ({
              id: s.id,
              citation: s.citation,
              type: s.type,
              url: s.url,
              effectiveDate: s.effectiveDate,
            })),
          }
        : null,
      unanswered,
      research: research
        ? {
            researchedAt: research.researchedAt,
            confidence: research.confidence,
            summary: clip(research.summary, 2000),
            proposedClassification: research.proposedClassification,
            classificationRationale: clip(
              research.classificationRationale,
              1200,
            ),
            regulator: research.regulator,
            findings: Object.fromEntries(
              Object.entries(research.findings).map(([k, f]) => [
                k,
                {
                  answer: f.answer,
                  note: clip(f.note, 600),
                  sourceIds: f.sourceIds,
                },
              ]),
            ),
            // Normalized as an import would store them, so a proposal that
            // cites one adds a valid source to the draft.
            sources: draftFromResearch(research)
              .content.sources.slice(0, 40)
              .map((s) => ({ ...s, summary: clip(s.summary, 300) })),
            pendingLegislation: research.pendingLegislation.map((b) => ({
              bill: b.bill,
              session: b.session,
              status: clip(b.status, 200),
              summary: clip(b.summary, 300),
            })),
            openQuestions: research.openQuestions.slice(0, 20),
            activationSteps: research.activationSteps.slice(0, 20),
          }
        : null,
      authorizations: (
        d.authorizations as Array<{
          kind: string;
          status: string;
          verifiedAt: Date | null;
        }>
      ).map((a) => ({
        kind: a.kind,
        status: a.status,
        verified: !!a.verifiedAt,
      })),
      opportunity: {
        counties: geos.total,
        top: geos.geos.map((g) => ({
          label: g.label,
          opportunity: g.opportunity,
          sales12m: g.sales12m,
          investorPurchases12m: g.investorPurchases12m,
        })),
      },
    };
  }
}
