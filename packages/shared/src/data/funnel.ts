import { z } from 'zod';

/**
 * Conversion economics (docs/data-pipeline.md s5.1): how far each lead got,
 * grouped by where it came from and where the property is, with what it
 * cost and what it earned. Pure; the api gathers one record per lead.
 *
 * A lead counts at a stage once it has ever reached it, and the stages
 * nest: every contracted lead was also offered, talked to, contacted and
 * reachable. A lead that skipped a step (a seller who called in and
 * signed) still counts at every earlier stage, which keeps each rate
 * between 0 and 1. Assignment and closing both follow a contract, but
 * neither implies the other.
 *
 * Cost is what provider calls recorded against each lead plus spend a
 * person entered (a mail drop, an ad campaign, a bought list), which no
 * provider call sees. Spend counts toward the source and the state it
 * names, and toward the total either way.
 */

export const FUNNEL_STAGES = [
  'leads',
  'reachable',
  'contacted',
  'conversations',
  'offers',
  'contracts',
  'assignments',
  'closed',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABEL: Record<FunnelStage, string> = {
  leads: 'Leads sourced',
  reachable: 'Reachable owners',
  contacted: 'Contacted',
  conversations: 'Conversations',
  offers: 'Offers',
  contracts: 'Contracts',
  assignments: 'Assignments',
  closed: 'Closed',
};

/** What a stage means, for the page and the docs. */
export const FUNNEL_STAGE_DEFINITION: Record<FunnelStage, string> = {
  leads: 'Created in the period.',
  reachable: 'A phone or email on file, and not on the do-not-contact list.',
  contacted: 'At least one outbound message sent or delivered.',
  conversations: 'The owner wrote back at least once.',
  offers: 'A deal with an offer amount.',
  contracts: 'A purchase agreement executed.',
  assignments: 'An assignment agreement executed.',
  closed: 'The closing file is closed.',
};

/**
 * What each rate is measured against: the stage before it, except that a
 * close is measured against contracts, since a double close or a purchase
 * and resale closes without an assignment.
 */
export const FUNNEL_RATE_BASE: Record<Exclude<FunnelStage, 'leads'>, FunnelStage> = {
  reachable: 'leads',
  contacted: 'reachable',
  conversations: 'contacted',
  offers: 'conversations',
  contracts: 'offers',
  assignments: 'contracts',
  closed: 'contracts',
};

/** One lead, as far as it got. */
export interface FunnelLead {
  source: string;
  state: string | null;
  reachable: boolean;
  contacted: boolean;
  conversation: boolean;
  offer: boolean;
  contract: boolean;
  assignment: boolean;
  closed: boolean;
  /** Realized fee on closing, in dollars. */
  fee: number;
  /** Provider costs recorded against the lead, in dollars. */
  costUsd: number;
}

export interface FunnelRow {
  key: string;
  counts: Record<FunnelStage, number>;
  /** Each stage over its base (FUNNEL_RATE_BASE); null when the base is 0. */
  rates: Record<Exclude<FunnelStage, 'leads'>, number | null>;
  /** Closed over leads. */
  leadToClose: number | null;
  realizedFees: number;
  /** Provider charges on the leads plus entered spend: what every per-unit figure divides. */
  costUsd: number;
  providerCostUsd: number;
  spendUsd: number;
  costPerLead: number | null;
  costPerContract: number | null;
  costPerClose: number | null;
  feesPerLead: number | null;
  /** Fees over costs; null with no cost recorded. */
  returnOnCost: number | null;
}

/** The furthest stage, filling in the steps before it. */
function reached(l: FunnelLead): Record<FunnelStage, boolean> {
  const closed = l.closed;
  const assignments = l.assignment;
  const contracts = l.contract || assignments || closed;
  const offers = l.offer || contracts;
  const conversations = l.conversation || offers;
  const contacted = l.contacted || conversations;
  const reachable = l.reachable || contacted;
  return {
    leads: true,
    reachable,
    contacted,
    conversations,
    offers,
    contracts,
    assignments,
    closed,
  };
}

const ratio = (a: number, b: number): number | null =>
  b > 0 ? Math.round((a / b) * 10_000) / 10_000 : null;
const money = (n: number): number => Math.round(n * 100) / 100;

/** `spendUsd` is entered spend that belongs to this row; see allocateSpend. */
export function funnelRow(key: string, leads: FunnelLead[], spendUsd = 0): FunnelRow {
  const counts = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s, 0]),
  ) as Record<FunnelStage, number>;
  let fees = 0;
  let providerCost = 0;
  for (const l of leads) {
    const r = reached(l);
    for (const s of FUNNEL_STAGES) if (r[s]) counts[s]++;
    if (l.closed) fees += l.fee;
    providerCost += l.costUsd;
  }
  const cost = providerCost + spendUsd;
  const rates = Object.fromEntries(
    (Object.keys(FUNNEL_RATE_BASE) as Array<keyof typeof FUNNEL_RATE_BASE>).map(
      (s) => [s, ratio(counts[s], counts[FUNNEL_RATE_BASE[s]])],
    ),
  ) as FunnelRow['rates'];
  return {
    key,
    counts,
    rates,
    leadToClose: ratio(counts.closed, counts.leads),
    realizedFees: money(fees),
    costUsd: money(cost),
    providerCostUsd: money(providerCost),
    spendUsd: money(spendUsd),
    costPerLead: counts.leads ? money(cost / counts.leads) : null,
    costPerContract: counts.contracts ? money(cost / counts.contracts) : null,
    costPerClose: counts.closed ? money(cost / counts.closed) : null,
    feesPerLead: counts.leads ? money(fees / counts.leads) : null,
    returnOnCost: cost > 0 ? Math.round((fees / cost) * 100) / 100 : null,
  };
}

/**
 * Rows for every value of a dimension, best realized fees first. A value
 * with spend and no leads still gets a row: a mail drop that produced
 * nothing is the row most worth seeing.
 */
export function funnelBy(
  leads: FunnelLead[],
  dimension: (l: FunnelLead) => string,
  spend: ReadonlyMap<string, number> = new Map(),
): FunnelRow[] {
  const groups = new Map<string, FunnelLead[]>();
  for (const l of leads) {
    const k = dimension(l);
    const list = groups.get(k) ?? [];
    list.push(l);
    groups.set(k, list);
  }
  for (const k of spend.keys()) if (!groups.has(k)) groups.set(k, []);
  return [...groups.entries()]
    .map(([k, list]) => funnelRow(k, list, spend.get(k) ?? 0))
    .sort(
      (a, b) =>
        b.realizedFees - a.realizedFees ||
        b.counts.contracts - a.counts.contracts ||
        b.counts.leads - a.counts.leads ||
        b.costUsd - a.costUsd ||
        a.key.localeCompare(b.key),
    );
}

// ------------------------------------------------------------ entered spend

export const SPEND_CATEGORIES = [
  'direct_mail',
  'ads',
  'lists',
  'skip_tracing',
  'cold_calling',
  'texting',
  'software',
  'other',
] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const SPEND_CATEGORY_LABEL: Record<SpendCategory, string> = {
  direct_mail: 'Direct mail',
  ads: 'Ads',
  lists: 'Lists and data',
  skip_tracing: 'Skip tracing (outside Hālo)',
  cold_calling: 'Cold calling',
  texting: 'Texting (outside Hālo)',
  software: 'Software',
  other: 'Other',
};

/** A lead source as the `source:` tags spell it: lowercase words joined by underscores. */
export function sourceKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export const SpendInputSchema = z
  .object({
    /** The day the money was spent, YYYY-MM-DD. */
    spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-24'),
    category: z.enum(SPEND_CATEGORIES),
    amountUsd: z
      .number()
      .positive('The amount must be more than zero')
      .max(10_000_000)
      .transform((n) => Math.round(n * 100) / 100),
    /** The lead source it bought, matching the leads' `source:` tag. */
    source: z
      .string()
      .max(80)
      .nullish()
      .transform((s) => (s ? sourceKey(s) || null : null)),
    state: z
      .string()
      .trim()
      .nullish()
      .transform((s) => (s ? s.toUpperCase() : null))
      .refine((s) => s === null || /^[A-Z]{2}$/.test(s), 'A two-letter state code'),
    vendor: z.string().trim().max(120).nullish().transform((s) => s || null),
    note: z.string().trim().max(500).nullish().transform((s) => s || null),
  })
  .strict();
export type SpendInput = z.output<typeof SpendInputSchema>;

export interface SpendEntry {
  source: string | null;
  state: string | null;
  amountUsd: number;
}

export interface SpendAllocation {
  total: number;
  bySource: Map<string, number>;
  byState: Map<string, number>;
  /** Spend that names no source: in the total, in no source row. */
  withoutSource: number;
  /** Spend that names no state: in the total, in no state row. */
  withoutState: number;
}

/** Where each entry's money counts. An entry is never split or guessed across rows. */
export function allocateSpend(entries: readonly SpendEntry[]): SpendAllocation {
  const out: SpendAllocation = {
    total: 0,
    bySource: new Map(),
    byState: new Map(),
    withoutSource: 0,
    withoutState: 0,
  };
  for (const e of entries) {
    out.total += e.amountUsd;
    if (e.source) out.bySource.set(e.source, (out.bySource.get(e.source) ?? 0) + e.amountUsd);
    else out.withoutSource += e.amountUsd;
    if (e.state) out.byState.set(e.state, (out.byState.get(e.state) ?? 0) + e.amountUsd);
    else out.withoutState += e.amountUsd;
  }
  out.total = money(out.total);
  out.withoutSource = money(out.withoutSource);
  out.withoutState = money(out.withoutState);
  return out;
}

/** A lead's source: its first `source:` tag, or "unattributed". */
export function leadSource(tags: readonly string[]): string {
  const tag = tags.find((t) => t.startsWith('source:'));
  return tag ? tag.slice('source:'.length) || 'unattributed' : 'unattributed';
}
