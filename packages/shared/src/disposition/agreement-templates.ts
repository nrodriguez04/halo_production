import type { TemplateKind } from '../markets/policy';

/**
 * Document templates (docs/markets.md s6). A template is counsel's text,
 * as a .docx or .txt file, with `{{field}}` merge fields; Halo fills the
 * fields from its records. Halo refuses a template that uses a field it
 * does not know or leaves out one every document of its kind needs, and
 * refuses to fill one when a value is missing, so a half-filled document
 * never reaches a signer. The wording is never Halo's: only the blanks are.
 */

const COMMON: Record<string, string> = {
  effective_date: 'Date the document is prepared',
  property_address: 'Street address',
  property_city: 'City',
  property_state: 'State',
  property_zip: 'Zip',
  property_county: 'County',
  property_apn: 'Parcel number (APN)',
  seller_name: "Seller's name, from the lead",
};

export const TEMPLATE_FIELDS: Record<TemplateKind, Record<string, string>> = {
  purchase_agreement: {
    ...COMMON,
    buyer_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    purchase_price: 'Purchase price',
    earnest_money: 'Earnest money amount',
    earnest_money_due: 'Earnest money due date',
    inspection_ends: 'Inspection period end',
    closing_deadline: 'Closing deadline',
    seller_cancellation_days: "The seller's cancellation period, e.g. '3 business days', from the market's approved policy",
  },
  assignment_agreement: {
    ...COMMON,
    assignor_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    assignee_name: "Buyer's name (or company)",
    original_contract_date: 'Date the purchase agreement was executed',
    original_purchase_price: 'Price in the purchase agreement',
    assignment_price: "Buyer's total price",
    assignment_fee: 'Assignment fee',
    buyer_deposit: "Buyer's deposit",
    buyer_deposit_due: "Buyer's deposit due date",
    closing_deadline: 'Closing deadline',
    closing_agent: 'Title company or closing attorney',
  },
  seller_disclosure: {
    ...COMMON,
    buyer_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    purchase_price: 'Purchase price',
    seller_cancellation_days: "The seller's cancellation period, e.g. '3 business days', from the market's approved policy",
  },
  buyer_disclosure: {
    ...COMMON,
    assignor_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    recipient_name: "The buyer receiving it, when there is one",
    original_contract_date: 'Date the purchase agreement was executed',
    closing_deadline: 'Closing deadline',
  },
  cancellation_notice: {
    ...COMMON,
    buyer_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    original_contract_date: 'Date the purchase agreement was executed',
    seller_cancellation_days: "The seller's cancellation period, e.g. '3 business days', from the market's approved policy",
    cancellation_deadline: 'When the cancellation window closes',
  },
  notice: {
    ...COMMON,
    buyer_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    recipient_name: 'Who receives it',
    original_contract_date: 'Date the purchase agreement was executed',
  },
};

/** Fields every template of a kind must contain. */
export const REQUIRED_TEMPLATE_FIELDS: Record<TemplateKind, readonly string[]> = {
  purchase_agreement: ['buyer_entity', 'seller_name', 'property_address', 'purchase_price', 'earnest_money', 'closing_deadline'],
  assignment_agreement: ['assignor_entity', 'assignee_name', 'property_address', 'original_contract_date', 'assignment_price', 'assignment_fee'],
  seller_disclosure: ['buyer_entity', 'seller_name', 'property_address'],
  buyer_disclosure: ['assignor_entity', 'property_address'],
  cancellation_notice: ['buyer_entity', 'seller_name', 'property_address', 'cancellation_deadline'],
  notice: ['property_address'],
};

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;

/** The placeholders a text template uses, in order of first appearance. */
export function templatePlaceholders(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) seen.add(m[1]);
  return Array.from(seen);
}

/** What is wrong with a template's fields, if anything. */
export function checkTemplateFields(kind: TemplateKind, fields: string[]): { unknown: string[]; missingRequired: string[] } {
  const known = TEMPLATE_FIELDS[kind];
  return {
    unknown: fields.filter((f) => !(f in known)),
    missingRequired: REQUIRED_TEMPLATE_FIELDS[kind].filter((f) => !fields.includes(f)),
  };
}

/** Fields the template uses that have no value on record. */
export function missingValues(fields: string[], values: Partial<Record<string, string | null | undefined>>): string[] {
  return fields.filter((f) => !(values[f] ?? '').toString().trim());
}

export interface FilledTemplate {
  text: string;
  used: string[];
  /** Placeholders the template uses that are not fields of this kind. */
  unknown: string[];
  /** Fields the template uses that have no value on record. */
  missing: string[];
}

/**
 * Fill a text template. Nothing is filled when anything is unknown or
 * missing: the caller gets the lists and refuses.
 */
export function fillTemplate(
  kind: TemplateKind,
  text: string,
  values: Partial<Record<string, string | null | undefined>>,
): FilledTemplate {
  const used = templatePlaceholders(text);
  const { unknown } = checkTemplateFields(kind, used);
  const missing = missingValues(
    used.filter((f) => !unknown.includes(f)),
    values,
  );
  if (unknown.length || missing.length) {
    return { text, used, unknown, missing };
  }
  const filled = text.replace(PLACEHOLDER, (_m, f: string) => String(values[f]).trim());
  return { text: filled, used, unknown, missing };
}

export function formatMoney(n: number | null | undefined): string | null {
  return n == null ? null : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Synthetic values for every field, for self-tests that render a template without a deal. */
export function sampleTemplateValues(kind: TemplateKind, state: string): Record<string, string> {
  const sample: Record<string, string> = {
    effective_date: 'January 15, 2027',
    property_address: '100 SYNTHETIC Test Lane',
    property_city: 'Testville',
    property_state: state,
    property_zip: '00000',
    property_county: 'SYNTHETIC County',
    property_apn: '000-000-000',
    seller_name: 'SYNTHETIC Seller',
    buyer_entity: 'SYNTHETIC Buyer LLC',
    assignor_entity: 'SYNTHETIC Buyer LLC',
    assignee_name: 'SYNTHETIC Investor LLC',
    recipient_name: 'SYNTHETIC Investor LLC',
    purchase_price: '$100,000.00',
    earnest_money: '$1,000.00',
    earnest_money_due: 'January 18, 2027',
    inspection_ends: 'January 25, 2027',
    closing_deadline: 'February 15, 2027',
    seller_cancellation_days: '3 business days',
    cancellation_deadline: 'January 20, 2027',
    original_contract_date: 'January 15, 2027',
    original_purchase_price: '$100,000.00',
    assignment_price: '$110,000.00',
    assignment_fee: '$10,000.00',
    buyer_deposit: '$2,000.00',
    buyer_deposit_due: 'January 22, 2027',
    closing_agent: 'SYNTHETIC Title Co.',
  };
  return Object.fromEntries(Object.keys(TEMPLATE_FIELDS[kind]).map((f) => [f, sample[f] ?? `SYNTHETIC ${f}`]));
}
