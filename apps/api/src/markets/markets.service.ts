import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTIVATION_LABEL,
  APPROVAL_REQUIRED_QUESTIONS,
  AUTHORIZATION_LABEL,
  JURISDICTIONS,
  JURISDICTION_CODES,
  MARKETING_CHANNELS,
  MARKET_QUESTIONS,
  QUESTION_LABEL,
  TRANSACTION_STRUCTURES,
  JurisdictionResearchSchema,
  MarketPolicyContentSchema,
  channelAllowed,
  coverageKpis,
  deadlineFrom,
  draftFromResearch,
  emptyPolicyContent,
  evaluateDispositionEligibility,
  evaluateMarket,
  jurisdiction,
  ladderRank,
  parsePolicyContent,
  permits,
  toJurisdictionCode,
  type ActivationStatus,
  type AuthorizationKind,
  type EligibilityInput,
  type MarketActivity,
  type MarketClassification,
  type MarketEvaluation,
  type MarketInput,
  type MarketPolicyContent,
  type MarketingChannel,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { ComplianceBlockedException } from '../compliance/compliance-blocked.exception';
import { DataAccessService, type DataAccess } from './data-access.service';
import {
  TemplateCatalogService,
  type ApplicableTemplate,
} from './template-catalog.service';
import { JURISDICTION_RESEARCH } from './research-data';

export const MARKET_NOT_AUTHORIZED = 'MARKET_NOT_AUTHORIZED';

type MarketRow = Prisma.MarketGetPayload<object>;
type VersionRow = Prisma.MarketPolicyVersionGetPayload<object>;
type AuthorizationRow = Prisma.MarketAuthorizationGetPayload<object>;

interface Loaded {
  market: MarketRow;
  draft: MarketPolicyContent | null;
  draftError: string | null;
  approved: VersionRow | null;
  approvedContent: MarketPolicyContent | null;
  authorizations: AuthorizationRow[];
  templates: ApplicableTemplate[];
  input: MarketInput;
  evaluation: MarketEvaluation;
}

const DEFAULT_REVIEW_MONTHS = 12;
const MAX_REVIEW_MONTHS = 24;

/** The statement an approver confirms, recorded with the version. */
export const APPROVAL_ATTESTATION =
  'Counsel licensed to advise on this jurisdiction reviewed this policy, the sources cited and the answers recorded, and approved it for the uses it permits.';

function asJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

/**
 * Markets (docs/markets.md): one per jurisdiction per tenant, all 51 of
 * them. This service keeps the draft policy, counsel's approved versions,
 * the authorizations each market requires and the status a person set; it
 * evaluates them with the shared `evaluateMarket` and answers the gates.
 *
 * Unknown never permits anything, and nothing promotes a market without a
 * person.
 */
@Injectable()
export class MarketsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private catalog: TemplateCatalogService,
    private dataAccess: DataAccessService,
  ) {}

  // ------------------------------------------------------------ loading

  /** Make sure every jurisdiction has a market row. */
  async ensureAll(accountId: string) {
    const have = await this.prisma.market.findMany({
      where: { accountId },
      select: { state: true },
    });
    const missing = JURISDICTION_CODES.filter(
      (c) => !have.some((h) => h.state === c),
    );
    if (missing.length) {
      await this.prisma.market.createMany({
        data: missing.map((state) => ({
          accountId,
          state,
          draft: asJson(emptyPolicyContent()),
        })),
        skipDuplicates: true,
      });
    }
  }

  private async load(
    accountId: string,
    states?: string[],
    now = new Date(),
  ): Promise<Loaded[]> {
    await this.ensureAll(accountId);
    const markets = await this.prisma.market.findMany({
      where: { accountId, ...(states ? { state: { in: states } } : {}) },
      orderBy: { state: 'asc' },
    });
    const versionIds = markets
      .map((m) => m.approvedVersionId)
      .filter(Boolean) as string[];
    const [versions, authorizations, usable, access] = await Promise.all([
      versionIds.length
        ? this.prisma.marketPolicyVersion.findMany({
            where: { id: { in: versionIds }, accountId },
          })
        : Promise.resolve([] as VersionRow[]),
      this.prisma.marketAuthorization.findMany({
        where: { accountId, ...(states ? { state: { in: states } } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
      this.catalog.usable(accountId),
      this.dataAccess.forAccount(accountId),
    ]);
    return markets.map((m) =>
      this.evaluateRow(m, versions, authorizations, usable, access, now),
    );
  }

  private evaluateRow(
    m: MarketRow,
    versions: VersionRow[],
    authorizations: AuthorizationRow[],
    usable: Awaited<ReturnType<TemplateCatalogService['usable']>>,
    access: DataAccess,
    now: Date,
  ): Loaded {
    let draft: MarketPolicyContent | null = null;
    let draftError: string | null = null;
    try {
      draft = parsePolicyContent(m.draft);
    } catch (err) {
      draftError = (err as Error).message;
    }
    const approved = versions.find((v) => v.id === m.approvedVersionId) ?? null;
    let approvedContent: MarketPolicyContent | null = null;
    if (approved) {
      try {
        approvedContent = parsePolicyContent(approved.content);
      } catch {
        approvedContent = null;
      }
    }
    const auths = authorizations.filter((a) => a.state === m.state);
    const templates = this.catalog.forState(usable, m.state);
    const researchOnFile =
      !!m.researchImportedAt || !!m.draftUpdatedBy || !!approved;
    const input: MarketInput = {
      code: m.state,
      now,
      requestedStatus: m.requestedStatus as ActivationStatus,
      draft,
      draftInReview: m.draftStatus === 'in_review',
      approved:
        approved && approvedContent
          ? {
              version: approved.version,
              content: approvedContent,
              classification: approved.classification as MarketClassification,
              approvedAt: approved.approvedAt,
              reviewExpiresAt: approved.reviewExpiresAt,
            }
          : null,
      authorizations: auths.map((a) => ({
        kind: a.kind as AuthorizationKind,
        status: a.status as 'active' | 'pending' | 'expired' | 'revoked',
        verifiedAt: a.verifiedAt,
        expiresAt: a.expiresAt,
      })),
      templates: templates.map((t) => ({ kind: t.kind, status: t.status })),
      operatorAssigned: !!m.operatorUserId,
      selfTest:
        m.selfTestAt && m.selfTestPassed != null
          ? {
              ranAt: m.selfTestAt,
              passed: m.selfTestPassed,
              stale: m.configChangedAt > m.selfTestAt,
            }
          : null,
      dataAccess: access.states.has(m.state),
      researchOnFile,
    };
    return {
      market: m,
      draft,
      draftError,
      approved,
      approvedContent,
      authorizations: auths,
      templates,
      input,
      evaluation: evaluateMarket(input),
    };
  }

  private async one(accountId: string, state: string): Promise<Loaded> {
    const code = this.code(state);
    const [row] = await this.load(accountId, [code]);
    return row;
  }

  code(state: string | null | undefined): string {
    const code = toJurisdictionCode(state ?? null);
    if (!code)
      throw new BadRequestException(
        `"${state}" is not one of the 50 states or DC.`,
      );
    return code;
  }

  // ------------------------------------------------------------ reading

  /** The Market Activation Matrix: every jurisdiction, and the three coverage measures. */
  async matrix(accountId: string) {
    const [rows, access, openDeals] = await Promise.all([
      this.load(accountId),
      this.dataAccess.forAccount(accountId),
      this.openDealsByState(accountId),
    ]);
    const kpis = coverageKpis(
      rows.map((r) => ({
        evaluation: r.evaluation,
        researchOnFile: r.input.researchOnFile,
        dataAccess: r.input.dataAccess,
      })),
    );
    return {
      kpis,
      dataAccess: {
        providers: access.providers,
        externalDataEnabled: access.externalDataEnabled,
        states: access.states.size,
      },
      rows: rows.map((r) =>
        this.summary(r, openDeals.get(r.market.state) ?? 0),
      ),
    };
  }

  private summary(r: Loaded, openDeals: number) {
    const j = jurisdiction(r.market.state)!;
    const c = r.approvedContent ?? r.draft;
    const e = r.evaluation;
    return {
      state: r.market.state,
      name: j.name,
      region: j.region,
      classification: r.approved
        ? r.approved.classification
        : r.market.classification,
      classificationSource: r.approved ? 'approved' : 'draft',
      requestedStatus: e.requestedStatus,
      effectiveStatus: e.effectiveStatus,
      maxStatus: e.maxStatus,
      legal: {
        state: e.legal.state,
        version: e.legal.version,
        approvedAt: e.legal.approvedAt,
        reviewExpiresAt: e.legal.reviewExpiresAt,
        counselName: r.approved?.counselName ?? null,
      },
      structures: c
        ? TRANSACTION_STRUCTURES.map((s) => ({
            key: s,
            permission: c.structures[s].permission,
          }))
        : [],
      channels: c
        ? MARKETING_CHANNELS.map((ch) => ({
            key: ch,
            permission: c.channels[ch].permission,
          }))
        : [],
      requirements: (c?.requirements ?? []).map((q) => ({
        key: q.key,
        label: q.label,
        met: r.authorizations.some(
          (a) =>
            a.kind === q.kind &&
            a.status === 'active' &&
            !!a.verifiedAt &&
            (!a.expiresAt || a.expiresAt > new Date()),
        ),
      })),
      disclosures: (c?.disclosures ?? []).map((d) => ({
        key: d.key,
        title: d.title,
        audience: d.audience,
        timing: d.timing,
      })),
      deadlines: (c?.deadlines ?? []).map((d) => ({
        key: d.key,
        label: d.label,
        days: d.days,
        businessDays: d.businessDays,
        effect: d.effect,
      })),
      templates: r.templates.map((t) => ({
        kind: t.kind,
        status: t.status,
        name: t.name,
        version: t.version,
        specific: t.specific,
      })),
      sources: {
        count: c?.sources.length ?? 0,
        latestEffectiveDate:
          (c?.sources ?? [])
            .map((s) => s.effectiveDate)
            .filter(Boolean)
            .sort()
            .pop() ?? null,
        official: (c?.sources ?? []).filter((s) => s.type !== 'secondary')
          .length,
      },
      research: {
        date: r.market.researchDate,
        confidence: r.market.researchConfidence,
        importedAt: r.market.researchImportedAt,
      },
      technical: e.technical,
      coverage: e.coverage,
      missing: e.missing,
      nextStep: e.nextStep,
      openQuestions: c?.openQuestions.length ?? 0,
      pendingLegislation: c?.pendingLegislation.length ?? 0,
      operatorName: r.market.operatorName,
      selfTest: r.market.selfTestAt
        ? {
            ranAt: r.market.selfTestAt,
            passed: r.market.selfTestPassed,
            stale: r.market.configChangedAt > r.market.selfTestAt,
          }
        : null,
      openDeals,
      draftError: r.draftError,
    };
  }

  /** Everything about one market. */
  async detail(accountId: string, state: string) {
    const r = await this.one(accountId, state);
    const [versions, openDeals] = await Promise.all([
      this.prisma.marketPolicyVersion.findMany({
        where: { accountId, state: r.market.state },
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          classification: true,
          approvedAt: true,
          approvedBy: true,
          counselName: true,
          counselFirm: true,
          memoDocumentId: true,
          reviewExpiresAt: true,
          supersededAt: true,
        },
      }),
      this.openDealsByState(accountId),
    ]);
    return {
      ...this.summary(r, openDeals.get(r.market.state) ?? 0),
      market: {
        draftStatus: r.market.draftStatus,
        draftUpdatedAt: r.market.draftUpdatedAt,
        submittedAt: r.market.submittedAt,
        statusNote: r.market.statusNote,
        statusSetAt: r.market.statusSetAt,
        operatorUserId: r.market.operatorUserId,
        operatorName: r.market.operatorName,
        selfTestResult: r.market.selfTestResult,
        draftClassification: r.market.classification,
      },
      draft: r.draft,
      approved: r.approvedContent,
      versions,
      authorizations: r.authorizations,
      templates: r.templates,
      evaluation: r.evaluation,
      questions: MARKET_QUESTIONS.map((q) => ({
        key: q,
        label: QUESTION_LABEL[q],
        requiredForApproval: APPROVAL_REQUIRED_QUESTIONS.includes(q),
      })),
      attestation: APPROVAL_ATTESTATION,
    };
  }

  async version(accountId: string, state: string, version: number) {
    const v = await this.prisma.marketPolicyVersion.findFirst({
      where: { accountId, state: this.code(state), version },
    });
    if (!v) throw new NotFoundException(`No version ${version} for ${state}`);
    return v;
  }

  private async openDealsByState(accountId: string) {
    const deals = await this.prisma.deal.findMany({
      where: {
        accountId,
        stage: {
          in: [
            'contacted',
            'negotiating',
            'under_contract',
            'marketing',
            'assigned',
          ],
        },
      },
      select: {
        property: { select: { state: true } },
        lead: { select: { canonicalState: true } },
      },
    });
    const counts = new Map<string, number>();
    for (const d of deals) {
      const s = toJurisdictionCode(
        d.property?.state ?? d.lead?.canonicalState ?? null,
      );
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }

  // ------------------------------------------------------------ gates

  /** The market's evaluation, for a gate. A state Halo cannot place gets null. */
  async evaluate(
    accountId: string,
    state: string | null | undefined,
  ): Promise<{
    evaluation: MarketEvaluation;
    approved: MarketPolicyContent | null;
    version: number | null;
    /** The approved policy's requirements, each with whether it is met now. */
    requirements: Array<{
      key: string;
      label: string;
      kind: AuthorizationKind;
      appliesTo: MarketActivity[];
      met: boolean;
    }>;
  } | null> {
    const code = toJurisdictionCode(state ?? null);
    if (!code) return null;
    const r = await this.one(accountId, code);
    const now = new Date();
    return {
      evaluation: r.evaluation,
      approved: r.approvedContent,
      version: r.approved?.version ?? null,
      requirements: (r.approvedContent?.requirements ?? []).map((q) => ({
        key: q.key,
        label: q.label,
        kind: q.kind,
        appliesTo: q.appliesTo,
        met: r.authorizations.some(
          (a) =>
            a.kind === q.kind &&
            a.status === 'active' &&
            !!a.verifiedAt &&
            (!a.expiresAt || a.expiresAt > now),
        ),
      })),
    };
  }

  /** Refuse an activity the deal's market does not allow, saying why. */
  async assertAllowed(
    accountId: string,
    state: string | null | undefined,
    activity: MarketActivity,
    action: string,
  ) {
    const m = await this.evaluate(accountId, state);
    if (!m) {
      throw new ComplianceBlockedException(
        MARKET_NOT_AUTHORIZED,
        `Halo cannot place this property in a state, so ${action} is not allowed. Record the property's state.`,
        { state: state ?? null, activity },
      );
    }
    const a = m.evaluation.activities[activity];
    if (!a.allowed) {
      throw new ComplianceBlockedException(
        MARKET_NOT_AUTHORIZED,
        `${action} is not allowed in ${m.evaluation.code} (${ACTIVATION_LABEL[m.evaluation.effectiveStatus]}). ${a.reason}`,
        {
          state: m.evaluation.code,
          activity,
          status: m.evaluation.effectiveStatus,
          nextStep: m.evaluation.nextStep,
        },
      );
    }
    return m;
  }

  async assertChannel(
    accountId: string,
    state: string | null | undefined,
    channel: MarketingChannel,
    action: string,
  ) {
    const m = await this.assertAllowed(
      accountId,
      state,
      'buyer_marketing',
      action,
    );
    const c = channelAllowed(m.evaluation, channel);
    if (!c.allowed) {
      throw new ComplianceBlockedException(
        MARKET_NOT_AUTHORIZED,
        `${action} is not allowed in ${m.evaluation.code}. ${c.reason}`,
        {
          state: m.evaluation.code,
          channel,
        },
      );
    }
    return m;
  }

  /**
   * Windows during which the seller may still cancel, from the approved
   * policy, counted from when the seller signed.
   */
  cancellationWindows(
    m: {
      evaluation: MarketEvaluation;
      approved: MarketPolicyContent | null;
    } | null,
    signedAt: Date | null,
  ): Array<{ label: string; endsAt: Date }> {
    if (!m?.approved || !signedAt) return [];
    const tz = jurisdiction(m.evaluation.code)?.timeZone ?? 'America/New_York';
    return m.approved.deadlines
      .filter(
        (d) =>
          d.trigger === 'seller_signed' &&
          d.effect === 'seller_may_cancel' &&
          d.blocksMarketing,
      )
      .map((d) => ({
        label: d.label,
        endsAt: deadlineFrom(signedAt, d, tz).endsAt,
      }));
  }

  // ------------------------------------------------------------ drafting

  async updateDraft(
    accountId: string,
    state: string,
    userId: string,
    patch: { content?: unknown; classification?: MarketClassification },
  ) {
    const r = await this.one(accountId, state);
    let content: MarketPolicyContent | undefined;
    if (patch.content !== undefined) {
      const parsed = MarketPolicyContentSchema.safeParse(patch.content);
      if (!parsed.success) {
        throw new BadRequestException({
          code: 'POLICY_INVALID',
          message: 'The policy draft is not valid.',
          issues: parsed.error.issues.map(
            (i) => `${i.path.join('.')}: ${i.message}`,
          ),
        });
      }
      content = parsed.data;
    }
    const wasInReview = r.market.draftStatus === 'in_review';
    const updated = await this.prisma.market.update({
      where: { id: r.market.id },
      data: {
        ...(content ? { draft: asJson(content) } : {}),
        ...(patch.classification
          ? { classification: patch.classification }
          : {}),
        draftUpdatedAt: new Date(),
        draftUpdatedBy: userId,
        // Counsel reviews a fixed text: an edit takes it back.
        ...(wasInReview
          ? { draftStatus: 'draft', submittedAt: null, submittedBy: null }
          : {}),
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'market.draft.update',
      resource: `market:${r.market.state}`,
      details: {
        fields: [
          ...(content ? ['content'] : []),
          ...(patch.classification ? ['classification'] : []),
        ],
        classification: patch.classification ?? null,
        returnedFromReview: wasInReview,
      },
    });
    return {
      state: updated.state,
      draftStatus: updated.draftStatus,
      returnedFromReview: wasInReview,
    };
  }

  async submit(accountId: string, state: string, userId: string) {
    const r = await this.one(accountId, state);
    if (r.draftError || !r.draft)
      throw new BadRequestException(
        `The ${r.market.state} draft is not valid: ${r.draftError}`,
      );
    if (r.market.draftStatus === 'in_review')
      throw new ConflictException(
        `The ${r.market.state} draft is already with counsel.`,
      );
    await this.prisma.market.update({
      where: { id: r.market.id },
      data: {
        draftStatus: 'in_review',
        submittedAt: new Date(),
        submittedBy: userId,
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'market.draft.submit',
      resource: `market:${r.market.state}`,
    });
    return this.detail(accountId, r.market.state);
  }

  async returnToDraft(
    accountId: string,
    state: string,
    userId: string,
    note: string,
  ) {
    const r = await this.one(accountId, state);
    if (r.market.draftStatus !== 'in_review')
      throw new ConflictException(
        `The ${r.market.state} draft is not in review.`,
      );
    await this.prisma.market.update({
      where: { id: r.market.id },
      data: {
        draftStatus: 'draft',
        submittedAt: null,
        submittedBy: null,
        statusNote: note,
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'market.draft.return',
      resource: `market:${r.market.state}`,
      details: { note },
    });
    return this.detail(accountId, r.market.state);
  }

  /**
   * Counsel's approval: snapshot the draft as a new immutable version. The
   * approver names counsel, attaches the memo and confirms the statement;
   * the draft must answer the questions the gates turn on and state the
   * conditions of anything conditional.
   */
  async approve(
    accountId: string,
    state: string,
    userId: string,
    input: {
      counselName: string;
      counselFirm?: string | null;
      memoDocumentId: string;
      attest: boolean;
      reviewExpiresAt?: Date | null;
    },
  ) {
    const r = await this.one(accountId, state);
    const code = r.market.state;
    if (r.market.draftStatus !== 'in_review') {
      throw new ConflictException(
        `Submit the ${code} draft for review before approving it.`,
      );
    }
    if (!input.attest)
      throw new BadRequestException('Confirm the approval statement.');
    if (!r.draft)
      throw new BadRequestException(
        `The ${code} draft is not valid: ${r.draftError}`,
      );
    const c = r.draft;
    const problems: string[] = [];
    if (r.market.classification === 'unclassified')
      problems.push('the market has no classification');
    for (const q of APPROVAL_REQUIRED_QUESTIONS) {
      if (c.answers[q].answer === 'unknown')
        problems.push(`"${QUESTION_LABEL[q]}" is unknown`);
      if (c.answers[q].answer === 'conditional' && !c.answers[q].note.trim())
        problems.push(
          `"${QUESTION_LABEL[q]}" is conditional with no conditions written`,
        );
    }
    for (const s of TRANSACTION_STRUCTURES) {
      if (
        c.structures[s].permission === 'conditional' &&
        !c.structures[s].conditions?.trim()
      )
        problems.push(
          `${s.replace(/_/g, ' ')} is conditional with no conditions written`,
        );
    }
    for (const ch of MARKETING_CHANNELS) {
      if (
        c.channels[ch].permission === 'conditional' &&
        !c.channels[ch].conditions?.trim()
      )
        problems.push(
          `${ch.replace(/_/g, ' ')} is conditional with no conditions written`,
        );
    }
    if (
      c.answers.disclosures_required.answer === 'yes' &&
      c.disclosures.length === 0
    )
      problems.push('disclosures are required but none is listed');
    if (
      c.answers.seller_cancellation_right.answer === 'yes' &&
      !c.deadlines.some((d) => d.effect === 'seller_may_cancel')
    ) {
      problems.push('sellers may cancel but no cancellation window is set');
    }
    const memo = await this.prisma.document.findFirst({
      where: { id: input.memoDocumentId, accountId, status: 'active' },
      select: { id: true, tags: true },
    });
    if (!memo) problems.push("counsel's memo is not in the documents library");
    const now = new Date();
    const expires =
      input.reviewExpiresAt ??
      new Date(now.getTime() + DEFAULT_REVIEW_MONTHS * 30.44 * 86_400_000);
    if (expires <= now)
      problems.push('the review expiry must be in the future');
    if (
      expires.getTime() - now.getTime() >
      MAX_REVIEW_MONTHS * 30.44 * 86_400_000
    )
      problems.push(`a review lasts at most ${MAX_REVIEW_MONTHS} months`);
    if (problems.length) {
      throw new BadRequestException({
        code: 'POLICY_NOT_APPROVABLE',
        message: `The ${code} policy cannot be approved: ${problems.join('; ')}.`,
        problems,
      });
    }

    const version = await this.prisma.$transaction(async (tx) => {
      const last = await tx.marketPolicyVersion.findFirst({
        where: { accountId, state: code },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const created = await tx.marketPolicyVersion.create({
        data: {
          accountId,
          state: code,
          version: (last?.version ?? 0) + 1,
          classification: r.market.classification,
          content: asJson(c),
          approvedBy: userId,
          approvedAt: now,
          counselName: input.counselName,
          counselFirm: input.counselFirm ?? null,
          memoDocumentId: input.memoDocumentId,
          attestation: APPROVAL_ATTESTATION,
          reviewExpiresAt: expires,
        },
      });
      await tx.marketPolicyVersion.updateMany({
        where: {
          accountId,
          state: code,
          id: { not: created.id },
          supersededAt: null,
        },
        data: { supersededAt: now },
      });
      await tx.market.update({
        where: { id: r.market.id },
        data: {
          approvedVersionId: created.id,
          draftStatus: 'draft',
          submittedAt: null,
          submittedBy: null,
          configChangedAt: now,
        },
      });
      return created;
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'market.policy.approve',
      resource: `market:${code}`,
      details: {
        version: version.version,
        classification: version.classification,
        counselName: input.counselName,
        counselFirm: input.counselFirm ?? null,
        memoDocumentId: input.memoDocumentId,
        reviewExpiresAt: expires.toISOString(),
        structures: Object.fromEntries(
          TRANSACTION_STRUCTURES.map((s) => [s, c.structures[s].permission]),
        ),
        channels: Object.fromEntries(
          MARKETING_CHANNELS.map((ch) => [ch, c.channels[ch].permission]),
        ),
      },
    });
    return this.detail(accountId, code);
  }

  // ------------------------------------------------------------ activation

  /**
   * Set how far a market may operate. A rung above what the approved
   * policy and the requirements support is refused with what is missing;
   * RESTRICTED and BLOCKED are always accepted and stop new activity at once.
   */
  async setStatus(
    accountId: string,
    state: string,
    userId: string,
    input: { status: ActivationStatus; note: string },
  ) {
    const r = await this.one(accountId, state);
    const code = r.market.state;
    const target = input.status;
    if (
      target === 'PENDING_LEGAL_REVIEW' ||
      target === 'PENDING_REQUIREMENTS'
    ) {
      throw new BadRequestException(
        `${ACTIVATION_LABEL[target]} follows from the review and the requirements; it is not set by hand.`,
      );
    }
    if (ladderRank(target) >= ladderRank('APPROVED_FOR_ACQUISITION')) {
      const max = r.evaluation.maxStatus;
      if (ladderRank(max) < ladderRank(target)) {
        throw new BadRequestException({
          code: 'MARKET_NOT_READY',
          message: `${code} cannot be ${ACTIVATION_LABEL[target].toLowerCase()}: it supports at most ${ACTIVATION_LABEL[max].toLowerCase()}. ${r.evaluation.missing.join(' ')}`,
          missing: r.evaluation.missing,
          maxStatus: max,
        });
      }
    }
    const now = new Date();
    await this.prisma.market.update({
      where: { id: r.market.id },
      data: {
        requestedStatus: target,
        statusNote: input.note,
        statusSetBy: userId,
        statusSetAt: now,
      },
    });
    let pausedCampaigns = 0;
    if (
      target === 'RESTRICTED' ||
      target === 'BLOCKED' ||
      ladderRank(target) < ladderRank('APPROVED_FOR_DISPOSITION')
    ) {
      pausedCampaigns = await this.pauseCampaigns(
        accountId,
        code,
        `market ${target}`,
      );
    }
    await this.audit.log({
      accountId,
      userId,
      action: 'market.status.set',
      resource: `market:${code}`,
      details: {
        from: r.market.requestedStatus,
        to: target,
        note: input.note,
        maxStatus: r.evaluation.maxStatus,
        pausedCampaigns,
      },
    });
    return { ...(await this.detail(accountId, code)), pausedCampaigns };
  }

  /** Stop live buyer campaigns for deals in a market that may no longer market them. */
  private async pauseCampaigns(
    accountId: string,
    state: string,
    reason: string,
  ) {
    const live = await this.prisma.dispositionCampaign.findMany({
      where: { accountId, status: 'active' },
      select: {
        id: true,
        deal: {
          select: {
            property: { select: { state: true } },
            lead: { select: { canonicalState: true } },
          },
        },
      },
    });
    const ids = live
      .filter(
        (c) =>
          toJurisdictionCode(
            c.deal?.property?.state ?? c.deal?.lead?.canonicalState ?? null,
          ) === state,
      )
      .map((c) => c.id);
    if (!ids.length) return 0;
    const res = await this.prisma.dispositionCampaign.updateMany({
      where: { id: { in: ids }, status: 'active' },
      data: { status: 'paused', endedReason: reason },
    });
    return res.count;
  }

  async setOperator(
    accountId: string,
    state: string,
    userId: string,
    input: { operatorUserId: string | null; operatorName: string | null },
  ) {
    const r = await this.one(accountId, state);
    await this.prisma.market.update({
      where: { id: r.market.id },
      data: {
        operatorUserId: input.operatorUserId,
        operatorName: input.operatorName,
        configChangedAt: new Date(),
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'market.operator.set',
      resource: `market:${r.market.state}`,
      details: input,
    });
    return this.detail(accountId, r.market.state);
  }

  // ------------------------------------------------------------ authorizations

  async createAuthorization(
    accountId: string,
    state: string,
    userId: string,
    input: {
      kind: AuthorizationKind;
      holderName: string;
      holderType?: string;
      holderUserId?: string | null;
      identifier?: string | null;
      issuedAt?: Date | null;
      expiresAt?: Date | null;
      documentId?: string | null;
      notes?: string | null;
    },
  ) {
    const code = this.code(state);
    await this.assertDocument(accountId, input.documentId);
    const a = await this.prisma.marketAuthorization.create({
      data: {
        accountId,
        state: code,
        ...input,
        holderType: input.holderType ?? 'company',
        status: 'pending',
        createdBy: userId,
      },
    });
    await this.catalog.markChanged(accountId, [code]);
    await this.audit.log({
      accountId,
      userId,
      action: 'market.authorization.create',
      resource: `market:${code}`,
      details: {
        id: a.id,
        kind: a.kind,
        holderName: a.holderName,
        identifier: a.identifier,
        expiresAt: a.expiresAt,
      },
    });
    return a;
  }

  async updateAuthorization(
    accountId: string,
    id: string,
    userId: string,
    patch: Partial<{
      holderName: string;
      identifier: string | null;
      issuedAt: Date | null;
      expiresAt: Date | null;
      documentId: string | null;
      notes: string | null;
    }>,
  ) {
    const a = await this.authorization(accountId, id);
    await this.assertDocument(accountId, patch.documentId);
    // A verified record that changes must be verified again.
    const material = [
      'identifier',
      'expiresAt',
      'documentId',
      'holderName',
    ].some((k) => k in patch);
    const updated = await this.prisma.marketAuthorization.update({
      where: { id: a.id },
      data: {
        ...patch,
        ...(material && a.verifiedAt
          ? { verifiedAt: null, verifiedBy: null, status: 'pending' }
          : {}),
      },
    });
    await this.catalog.markChanged(accountId, [a.state]);
    await this.audit.log({
      accountId,
      userId,
      action: 'market.authorization.update',
      resource: `market:${a.state}`,
      details: { id, fields: Object.keys(patch) },
    });
    return updated;
  }

  /** A person checks the licence or registration against its evidence. */
  async verifyAuthorization(accountId: string, id: string, userId: string) {
    const a = await this.authorization(accountId, id);
    if (!a.documentId)
      throw new BadRequestException(
        'Attach the licence, registration or agreement before verifying it.',
      );
    if (a.expiresAt && a.expiresAt <= new Date())
      throw new BadRequestException(
        'It has expired; record the renewal first.',
      );
    if (a.status === 'revoked')
      throw new BadRequestException('It was revoked.');
    const updated = await this.prisma.marketAuthorization.update({
      where: { id: a.id },
      data: { status: 'active', verifiedAt: new Date(), verifiedBy: userId },
    });
    await this.catalog.markChanged(accountId, [a.state]);
    await this.audit.log({
      accountId,
      userId,
      action: 'market.authorization.verify',
      resource: `market:${a.state}`,
      details: {
        id,
        kind: a.kind,
        identifier: a.identifier,
        documentId: a.documentId,
        expiresAt: a.expiresAt,
      },
    });
    return updated;
  }

  async revokeAuthorization(
    accountId: string,
    id: string,
    userId: string,
    reason: string,
  ) {
    const a = await this.authorization(accountId, id);
    const updated = await this.prisma.marketAuthorization.update({
      where: { id: a.id },
      data: {
        status: 'revoked',
        notes: [a.notes, `Revoked: ${reason}`].filter(Boolean).join('\n'),
      },
    });
    await this.catalog.markChanged(accountId, [a.state]);
    await this.audit.log({
      accountId,
      userId,
      action: 'market.authorization.revoke',
      resource: `market:${a.state}`,
      details: { id, reason },
    });
    return updated;
  }

  private async authorization(accountId: string, id: string) {
    const a = await this.prisma.marketAuthorization.findFirst({
      where: { id, accountId },
    });
    if (!a) throw new NotFoundException('Authorization not found');
    return a;
  }

  private async assertDocument(accountId: string, documentId?: string | null) {
    if (!documentId) return;
    const d = await this.prisma.document.findFirst({
      where: { id: documentId, accountId, status: 'active' },
      select: { id: true },
    });
    if (!d)
      throw new BadRequestException('That document is not in the library.');
  }

  // ------------------------------------------------------------ research

  /**
   * Load the bundled jurisdiction research into drafts. A draft a person
   * has edited since the last import is left alone unless `overwrite`.
   * Approved versions are never touched: research is a lead for counsel.
   */
  async importResearch(
    accountId: string,
    userId: string,
    input: { states?: string[]; overwrite?: boolean },
  ) {
    await this.ensureAll(accountId);
    const wanted = input.states?.map((s) => this.code(s));
    const markets = await this.prisma.market.findMany({
      where: { accountId, ...(wanted ? { state: { in: wanted } } : {}) },
    });
    const imported: string[] = [];
    const skipped: Array<{ state: string; reason: string }> = [];
    for (const m of markets) {
      const raw = JURISDICTION_RESEARCH.find(
        (x) => (x as { code?: string }).code === m.state,
      );
      if (!raw) {
        skipped.push({ state: m.state, reason: 'no research bundled' });
        continue;
      }
      const editedSince =
        !!m.draftUpdatedBy &&
        (!m.researchImportedAt ||
          (m.draftUpdatedAt && m.draftUpdatedAt > m.researchImportedAt));
      if (editedSince && !input.overwrite) {
        skipped.push({
          state: m.state,
          reason: 'the draft was edited by a person',
        });
        continue;
      }
      if (m.draftStatus === 'in_review' && !input.overwrite) {
        skipped.push({ state: m.state, reason: 'the draft is with counsel' });
        continue;
      }
      const research = JurisdictionResearchSchema.parse(raw);
      const { content, classification } = draftFromResearch(research);
      MarketPolicyContentSchema.parse(content);
      await this.prisma.market.update({
        where: { id: m.id },
        data: {
          draft: asJson(content),
          classification,
          draftStatus: 'draft',
          researchImportedAt: new Date(),
          researchDate: research.researchedAt,
          researchConfidence: research.confidence,
          configChangedAt: new Date(),
        },
      });
      imported.push(m.state);
    }
    await this.audit.log({
      accountId,
      userId,
      action: 'market.research.import',
      resource: 'markets',
      details: { imported, skipped, overwrite: !!input.overwrite },
    });
    return { imported, skipped };
  }

  // ------------------------------------------------------------ self-test

  /**
   * Prove the market's encoded rules do what they say, without touching a
   * deal (docs/markets.md s7): the gate holds marketing until each required
   * disclosure is on file and each cancellation window has closed; the
   * evaluator allows exactly the structures and channels the policy
   * permits; every applicable template fills every blank and makes a PDF.
   */
  async selfTest(accountId: string, state: string, userId: string) {
    const r = await this.one(accountId, state);
    const code = r.market.state;
    const c = r.approvedContent ?? r.draft;
    const steps: Array<{
      name: string;
      passed: boolean;
      detail: string;
      skipped?: boolean;
    }> = [];
    const push = (
      name: string,
      passed: boolean,
      detail: string,
      skipped = false,
    ) => steps.push({ name, passed, detail, skipped });

    if (!c) {
      push('policy', false, `The ${code} draft is not valid: ${r.draftError}`);
    } else {
      push(
        'policy',
        true,
        r.approvedContent
          ? `Testing approved policy v${r.approved!.version}.`
          : 'Testing the draft policy (nothing approved yet).',
      );
      const tz = jurisdiction(code)!.timeZone;
      const signed = new Date('2027-01-15T15:00:00Z');
      const base: EligibilityInput = {
        now: new Date('2027-03-01T15:00:00Z'),
        state: code,
        agreement: {
          status: 'executed',
          executedAt: signed,
          executedDocumentId: 'synthetic',
          verifiedAt: signed,
          assignability: 'permitted',
          sellerConsentDocumentId: null,
          closingDeadline: new Date('2027-04-01T00:00:00Z'),
          earnestMoneyAmount: 1000,
          earnestMoneyDueAt: signed,
          earnestMoneyDepositedAt: signed,
        },
        market: {
          status: 'APPROVED_FOR_DISPOSITION',
          version: 1,
          buyerMarketing: { allowed: true, reason: '' },
          structure: 'assignment',
          structureAllowed: { allowed: true, reason: '' },
          conditions: null,
          missingAuthorizations: [],
          nextStep: null,
        },
        disclosures: [],
        blockingIssues: [],
      };
      const buyerNotices = c.disclosures.filter(
        (d) => d.audience === 'buyer' && d.timing === 'before_marketing',
      );
      if (buyerNotices.length) {
        const missing = evaluateDispositionEligibility({
          ...base,
          disclosures: buyerNotices.map((d) => ({
            key: d.key,
            title: d.title,
            satisfied: false,
          })),
        });
        const present = evaluateDispositionEligibility({
          ...base,
          disclosures: buyerNotices.map((d) => ({
            key: d.key,
            title: d.title,
            satisfied: true,
          })),
        });
        const ok =
          missing.checks.find((x) => x.key === 'buyer_disclosures')?.status ===
            'fail' &&
          present.checks.find((x) => x.key === 'buyer_disclosures')?.status ===
            'pass';
        push(
          'buyer_disclosures',
          ok,
          ok
            ? `Marketing waits for: ${buyerNotices.map((d) => d.title).join('; ')}.`
            : 'The gate did not hold marketing for a missing disclosure.',
        );
      } else {
        push(
          'buyer_disclosures',
          true,
          'No buyer disclosure is required before marketing.',
          true,
        );
      }
      const windows = c.deadlines.filter(
        (d) =>
          d.effect === 'seller_may_cancel' &&
          d.trigger === 'seller_signed' &&
          d.blocksMarketing,
      );
      if (windows.length) {
        let ok = true;
        const details: string[] = [];
        for (const w of windows) {
          const end = deadlineFrom(signed, w, tz);
          const during = evaluateDispositionEligibility({
            ...base,
            now: new Date(signed.getTime() + 3_600_000),
            cancellationWindows: [{ label: w.label, endsAt: end.endsAt }],
          });
          const after = evaluateDispositionEligibility({
            ...base,
            now: new Date(end.endsAt.getTime() + 60_000),
            cancellationWindows: [{ label: w.label, endsAt: end.endsAt }],
          });
          const held =
            during.checks.find((x) => x.key === 'cancellation_period')
              ?.status === 'fail';
          const released =
            after.checks.find((x) => x.key === 'cancellation_period')
              ?.status === 'pass';
          ok =
            ok &&
            held &&
            released &&
            (w.days === 0 || end.endsOn > '2027-01-15');
          details.push(
            `${w.label}: signed 15 Jan 2027, closes ${end.endsOn} (${w.days} ${w.businessDays ? 'business' : 'calendar'} days).`,
          );
        }
        push('cancellation_windows', ok, details.join(' '));
      } else {
        push(
          'cancellation_windows',
          true,
          'No seller cancellation window is encoded.',
          true,
        );
      }
      // As if counsel approved this content and every requirement were met.
      const sim = evaluateMarket({
        ...r.input,
        requestedStatus: 'ACTIVE',
        approved: {
          version: 1,
          content: c,
          classification:
            r.market.classification === 'unclassified' ||
            r.market.classification === 'E'
              ? 'B'
              : (r.market.classification as MarketClassification),
          approvedAt: new Date(),
          reviewExpiresAt: null,
        },
        authorizations: c.requirements.map((q) => ({
          kind: q.kind,
          status: 'active' as const,
          verifiedAt: new Date(),
          expiresAt: null,
        })),
        templates: [
          'purchase_agreement',
          'assignment_agreement',
          'seller_disclosure',
          'buyer_disclosure',
          'cancellation_notice',
          'notice',
        ].map((k) => ({
          kind: k as never,
          status: 'approved' as const,
        })),
        operatorAssigned: true,
        selfTest: { ranAt: new Date(), passed: true, stale: false },
      });
      const wrong: string[] = [];
      for (const s of TRANSACTION_STRUCTURES) {
        if (permits(c.structures[s].permission) !== sim.structures.includes(s))
          wrong.push(s);
      }
      for (const ch of MARKETING_CHANNELS) {
        if (permits(c.channels[ch].permission) !== sim.channels.includes(ch))
          wrong.push(ch);
      }
      push(
        'structures_and_channels',
        wrong.length === 0,
        wrong.length
          ? `The evaluator disagrees with the policy on: ${wrong.join(', ')}.`
          : `Allowed exactly as written: ${[...sim.structures, ...sim.channels].join(', ').replace(/_/g, ' ') || 'nothing'}.`,
      );

      const needed = new Set<string>(['purchase_agreement']);
      if (c.structures.assignment.permission !== 'prohibited')
        needed.add('assignment_agreement');
      for (const d of c.disclosures)
        if (d.templateKind) needed.add(d.templateKind);
      for (const kind of needed) {
        const t = r.templates
          .filter((x) => x.kind === kind)
          .sort(
            (a, b) =>
              Number(b.status === 'approved') - Number(a.status === 'approved'),
          )[0];
        if (!t) {
          push(
            `template:${kind}`,
            false,
            `No ${kind.replace(/_/g, ' ')} template applies to ${code}.`,
          );
          continue;
        }
        const out = await this.catalog.renderSample(
          accountId,
          t.versionId,
          code,
        );
        push(
          `template:${kind}`,
          out.ok,
          out.detail +
            (out.pdf === 'skipped' && t.format === 'docx'
              ? ' PDF skipped: PDF_CONVERTER_URL is not set.'
              : ''),
        );
      }
    }

    const passed = steps.every((s) => s.passed);
    const ranAt = new Date();
    await this.prisma.market.update({
      where: { id: r.market.id },
      data: {
        selfTestAt: ranAt,
        selfTestPassed: passed,
        selfTestResult: asJson({ ranAt, passed, steps }),
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'market.self_test',
      resource: `market:${code}`,
      details: {
        passed,
        failed: steps.filter((s) => !s.passed).map((s) => s.name),
      },
    });
    return { state: code, ranAt, passed, steps };
  }

  /** The coverage measures alone, for dashboards. */
  async kpis(accountId: string) {
    return (await this.matrix(accountId)).kpis;
  }

  /** Every jurisdiction's name, for pickers. */
  jurisdictions() {
    return JURISDICTIONS;
  }

  /** The authorization kinds and their labels, for forms. */
  authorizationKinds() {
    return Object.entries(AUTHORIZATION_LABEL).map(([key, label]) => ({
      key,
      label,
    }));
  }
}
