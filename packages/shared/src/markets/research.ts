import { z } from 'zod';
import {
  ANSWERS,
  MARKET_CLASSIFICATIONS,
  MARKET_QUESTIONS,
  emptyPolicyContent,
  type Answer,
  type DisclosureRule,
  type DisclosureTiming,
  type MarketClassification,
  type MarketPolicyContent,
  type Permission,
  type PolicySource,
  type Requirement,
} from './policy';

/**
 * Jurisdiction research: leads gathered from public sources for counsel to
 * confirm (docs/markets.md s4). Research only ever becomes a draft policy;
 * it is never approved by importing it, and nothing it says permits
 * anything until counsel approves a version.
 */

const lenientAnswer = z
  .string()
  .transform((v): Answer => ((ANSWERS as readonly string[]).includes(v) ? (v as Answer) : 'unknown'));

const ResearchFindingSchema = z.object({
  answer: lenientAnswer,
  note: z.string().default(''),
  sourceIds: z.array(z.string()).default([]),
  items: z
    .array(
      z.object({
        key: z.string().optional(),
        audience: z.string().default('buyer'),
        description: z.string().default(''),
        timing: z.string().default(''),
      }),
    )
    .optional(),
  deadline: z
    .object({ days: z.number(), businessDays: z.boolean().default(false), trigger: z.string().default('') })
    .nullable()
    .optional(),
});

export const JurisdictionResearchSchema = z.object({
  code: z.string().length(2),
  name: z.string(),
  researchedAt: z.string(),
  summary: z.string().default(''),
  proposedClassification: z.string().default('E'),
  classificationRationale: z.string().default(''),
  regulator: z.object({ name: z.string().default(''), url: z.string().nullable().default(null) }).nullable().default(null),
  findings: z.record(ResearchFindingSchema).default({}),
  sources: z
    .array(
      z.object({
        id: z.string(),
        citation: z.string().default(''),
        title: z.string().default(''),
        url: z.string().nullable().default(null),
        type: z.string().default('secondary'),
        effectiveDate: z.string().nullable().default(null),
        summary: z.string().default(''),
      }),
    )
    .default([]),
  pendingLegislation: z
    .array(
      z.object({
        bill: z.string(),
        session: z.string().default(''),
        status: z.string().default(''),
        url: z.string().nullable().default(null),
        summary: z.string().default(''),
      }),
    )
    .default([]),
  openQuestions: z.array(z.string()).default([]),
  activationSteps: z.array(z.string()).default([]),
  confidence: z.enum(['low', 'medium', 'high']).catch('low'),
});
export type JurisdictionResearch = z.infer<typeof JurisdictionResearchSchema>;

const SOURCE_TYPES = ['statute', 'regulation', 'regulator_guidance', 'case', 'bill', 'secondary', 'counsel_memo'] as const;

function validUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? u.slice(0, 1000) : null;
  } catch {
    return null;
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function permissionFrom(a: Answer): Permission {
  return a === 'yes' ? 'allowed' : a === 'conditional' ? 'conditional' : a === 'no' ? 'prohibited' : 'unknown';
}

function timingFrom(audience: 'seller' | 'buyer', text: string): DisclosureTiming {
  const t = text.toLowerCase();
  if (t.includes('closing')) return 'before_closing';
  if (audience === 'seller') return 'before_seller_signs';
  if (/(sign|contract|enter|execut|bind)/.test(t)) return 'before_buyer_signs';
  return 'before_marketing';
}

/**
 * The draft policy research suggests. Every value keeps the research's own
 * uncertainty: an unknown stays unknown, and a "conditional" carries its
 * note as the condition for counsel to rewrite.
 */
export function draftFromResearch(r: JurisdictionResearch): {
  content: MarketPolicyContent;
  classification: MarketClassification;
} {
  const c = emptyPolicyContent();
  const sources: PolicySource[] = [];
  const seen = new Set<string>();
  for (const s of r.sources) {
    if (!s.id || seen.has(s.id) || sources.length >= 60) continue;
    seen.add(s.id);
    sources.push({
      id: clip(s.id, 32),
      citation: clip(s.citation || s.title || s.id, 300),
      title: clip(s.title, 300),
      url: validUrl(s.url),
      type: (SOURCE_TYPES as readonly string[]).includes(s.type) ? (s.type as PolicySource['type']) : 'secondary',
      effectiveDate: s.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(s.effectiveDate) ? s.effectiveDate : null,
      summary: clip(s.summary, 4000),
    });
  }
  c.sources = sources;
  const ids = new Set(sources.map((s) => s.id));
  const cite = (list: string[] | undefined) => (list ?? []).filter((id) => ids.has(id)).slice(0, 20);

  for (const q of MARKET_QUESTIONS) {
    const f = r.findings[q];
    if (f) c.answers[q] = { answer: f.answer, note: clip(f.note, 4000), sourceIds: cite(f.sourceIds) };
  }
  const a = c.answers;
  const entry = (ans: Answer, note: string) => ({
    permission: permissionFrom(ans),
    conditions: ans === 'conditional' ? clip(note || 'Conditions to be confirmed by counsel.', 4000) : null,
  });

  c.structures.assignment = entry(a.principal_assignment_without_license.answer, a.principal_assignment_without_license.note);
  c.structures.double_close = entry(a.double_closing_permitted.answer, a.double_closing_permitted.note);

  const pub = entry(a.public_marketing_permitted.answer, a.public_marketing_permitted.note);
  c.channels.public_listing = pub;
  c.channels.social_media = { ...pub };
  const direct = entry(a.direct_investor_outreach_permitted.answer, a.direct_investor_outreach_permitted.note);
  c.channels.investor_email = direct;
  c.channels.investor_phone = { ...direct };
  c.channels.buyer_deal_page = { ...direct };
  c.channels.investor_sms =
    direct.permission === 'allowed' || direct.permission === 'conditional'
      ? {
          permission: 'conditional',
          conditions: 'Marketing texts need the recipient’s prior express written consent (federal TCPA) plus any state rule.',
        }
      : { ...direct };

  const disc = r.findings.disclosures_required;
  if (disc && (disc.answer === 'yes' || disc.answer === 'conditional')) {
    const rules: DisclosureRule[] = [];
    (disc.items ?? []).slice(0, 10).forEach((item, i) => {
      const audience: 'seller' | 'buyer' = item.audience === 'seller' ? 'seller' : 'buyer';
      const key =
        item.key && /^[a-z][a-z0-9_]{1,63}$/.test(item.key) ? item.key : `${r.code.toLowerCase()}_${audience}_disclosure_${i + 1}`;
      if (rules.some((x) => x.key === key)) return;
      rules.push({
        key,
        title: clip(item.description || `${audience} disclosure`, 200),
        audience,
        timing: timingFrom(audience, item.timing),
        templateKind: audience === 'seller' ? 'seller_disclosure' : 'buyer_disclosure',
        sourceIds: cite(disc.sourceIds),
      });
    });
    c.disclosures = rules;
  }

  const cancel = r.findings.seller_cancellation_right;
  if (cancel && (cancel.answer === 'yes' || cancel.answer === 'conditional') && cancel.deadline && cancel.deadline.days >= 0) {
    c.deadlines = [
      {
        key: 'seller_cancellation',
        label: 'Seller may cancel',
        trigger: 'seller_signed',
        days: Math.min(365, Math.round(cancel.deadline.days)),
        businessDays: !!cancel.deadline.businessDays,
        effect: 'seller_may_cancel',
        blocksMarketing: true,
        sourceIds: cite(cancel.sourceIds),
      },
    ];
  }

  const reqs: Requirement[] = [];
  const reg = a.wholesaler_registration_required.answer;
  if (reg === 'yes' || reg === 'conditional') {
    reqs.push({
      key: 'wholesaler_registration',
      kind: 'wholesaler_registration',
      label: reg === 'yes' ? 'Wholesaler registration' : 'Wholesaler registration (if the conditions apply)',
      appliesTo: ['seller_contracting', 'buyer_marketing'],
      sourceIds: a.wholesaler_registration_required.sourceIds,
    });
  }
  const lic = a.license_required_for_activity.answer;
  if (lic === 'yes' || lic === 'conditional') {
    reqs.push({
      key: 'real_estate_license',
      kind: 'real_estate_license',
      label: lic === 'yes' ? 'Real estate license held for the activity' : 'Real estate license (if the conditions apply)',
      appliesTo: ['buyer_marketing', 'assignment'],
      sourceIds: a.license_required_for_activity.sourceIds,
    });
  }
  if (a.out_of_state_entity_requirements.answer === 'yes') {
    reqs.push({
      key: 'entity_registration',
      kind: 'entity_registration',
      label: 'Foreign entity registration with the Secretary of State',
      appliesTo: ['seller_contracting'],
      sourceIds: a.out_of_state_entity_requirements.sourceIds,
    });
  }
  c.requirements = reqs;

  const local = a.local_restrictions;
  c.localRules = local.answer === 'yes' || local.answer === 'conditional' ? clip(local.note, 4000) : null;
  c.summary = clip(
    `Research dated ${r.researchedAt} (confidence: ${r.confidence}). Not reviewed by counsel. ${r.summary}` +
      (r.classificationRationale ? ` Proposed classification ${r.proposedClassification}: ${r.classificationRationale}` : ''),
    4000,
  );
  c.openQuestions = r.openQuestions.slice(0, 40).map((q) => clip(q, 500));
  c.activationSteps = r.activationSteps.slice(0, 40).map((q) => clip(q, 500));
  c.pendingLegislation = r.pendingLegislation.slice(0, 20).map((p) => ({
    bill: clip(p.bill, 100),
    session: clip(p.session, 50),
    status: clip(p.status, 300),
    url: validUrl(p.url),
    summary: clip(p.summary, 4000),
  }));

  const classification = (MARKET_CLASSIFICATIONS as readonly string[]).includes(r.proposedClassification)
    ? (r.proposedClassification as MarketClassification)
    : 'unclassified';
  return { content: c, classification };
}
