/**
 * Agreements from reviewed templates (docs/contract-flipping.md s3). A
 * template is the operator's (and counsel's) text with `{{field}}`
 * placeholders; Halo fills them from verified records and refuses to fill a
 * template that asks for a field it does not know or a value it does not
 * have. The wording is never Halo's: only the blanks are.
 */

export const AGREEMENT_KINDS = ['purchase_agreement', 'assignment'] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

export const TEMPLATE_FIELDS: Record<AgreementKind, Record<string, string>> = {
  purchase_agreement: {
    effective_date: 'Date the agreement is prepared',
    buyer_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    seller_name: "Seller's name, from the lead",
    property_address: 'Street address',
    property_city: 'City',
    property_state: 'State',
    property_zip: 'Zip',
    purchase_price: 'Purchase price',
    earnest_money: 'Earnest money amount',
    earnest_money_due: 'Earnest money due date',
    inspection_ends: 'Inspection period end',
    closing_deadline: 'Closing deadline',
  },
  assignment: {
    effective_date: 'Date the assignment is prepared',
    assignor_entity: 'Our contracting entity (HALO_CONTRACTING_ENTITY)',
    assignee_name: "Buyer's name (or company)",
    seller_name: "Seller's name, from the lead",
    property_address: 'Street address',
    property_city: 'City',
    property_state: 'State',
    property_zip: 'Zip',
    original_contract_date: 'Date the purchase agreement was executed',
    original_purchase_price: 'Price in the purchase agreement',
    assignment_price: "Buyer's total price",
    assignment_fee: 'Assignment fee',
    buyer_deposit: "Buyer's deposit",
    buyer_deposit_due: "Buyer's deposit due date",
    closing_deadline: 'Closing deadline',
    closing_agent: 'Title company or closing attorney',
  },
};

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;

/** The placeholders a template uses, in order of first appearance. */
export function templatePlaceholders(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) seen.add(m[1]);
  return Array.from(seen);
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
 * Fill a template. Nothing is filled when anything is unknown or missing:
 * the caller gets the lists and refuses, so a half-filled agreement can
 * never reach a signer.
 */
export function fillTemplate(
  kind: AgreementKind,
  text: string,
  values: Partial<Record<string, string | null | undefined>>,
): FilledTemplate {
  const fields = TEMPLATE_FIELDS[kind];
  const used = templatePlaceholders(text);
  const unknown = used.filter((f) => !(f in fields));
  const missing = used.filter((f) => f in fields && !(values[f] ?? '').toString().trim());
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
