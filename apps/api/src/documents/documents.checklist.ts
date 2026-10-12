/**
 * The paperwork a wholesale operation keeps on file, as a checklist the
 * Documents page scores against the library. Items are matched by the tag
 * `checklist:<key>` on an active document. Statute references are pointers
 * for counsel to confirm, not legal advice; they are the usual Texas and
 * federal sources for the standard wholesale and outreach paperwork.
 */

export const DOCUMENT_CATEGORIES = [
  'agreement_template',
  'contract',
  'disclosure',
  'compliance',
  'closing',
  'marketing',
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  agreement_template: 'Agreement template',
  contract: 'Signed contract',
  disclosure: 'Disclosure',
  compliance: 'Compliance record',
  closing: 'Closing paperwork',
  marketing: 'Marketing',
  other: 'Other',
};

export const CHECKLIST_TAG_PREFIX = 'checklist:';

/** `all` applies everywhere; a state code applies when operating in that state. */
export type ChecklistJurisdiction = 'all' | 'TX';

export interface ChecklistItem {
  key: string;
  title: string;
  category: DocumentCategory;
  jurisdiction: ChecklistJurisdiction;
  why: string;
  reference?: string;
}

export const WHOLESALE_CHECKLIST: readonly ChecklistItem[] = [
  {
    key: 'purchase_agreement',
    title: 'Purchase and sale agreement (assignable)',
    category: 'agreement_template',
    jurisdiction: 'all',
    why: 'The contract signed with the seller. It must permit assignment and state the earnest money, the inspection period and the closing timeline.',
  },
  {
    key: 'assignment_contract',
    title: 'Assignment of contract',
    category: 'agreement_template',
    jurisdiction: 'all',
    why: 'Transfers your position to the cash buyer for the assignment fee; names the fee, the deposit and who closes.',
  },
  {
    key: 'equitable_interest_disclosure',
    title: 'Equitable interest disclosure (Texas)',
    category: 'disclosure',
    jurisdiction: 'TX',
    why: 'Texas requires written notice to a prospective buyer that you hold only a contractual (equitable) interest and not title, before the buyer commits; sellers should also be told in writing that you intend to assign.',
    reference: 'Tex. Prop. Code 5.086; Tex. Occ. Code 1101.0045',
  },
  {
    key: 'seller_disclosure',
    title: "Seller's disclosure notice",
    category: 'disclosure',
    jurisdiction: 'all',
    why: "The seller's statement of the property's condition. Texas prescribes the form for residential sales; most states have an equivalent.",
    reference: 'Tex. Prop. Code 5.008 (Texas)',
  },
  {
    key: 'earnest_money_receipt',
    title: 'Earnest money receipt and title instructions',
    category: 'closing',
    jurisdiction: 'all',
    why: 'Proof the deposit reached the title or escrow company, and the instructions that let title close the assignment.',
  },
  {
    key: 'buyer_ncnd',
    title: 'Buyer non-disclosure and non-circumvention',
    category: 'agreement_template',
    jurisdiction: 'all',
    why: 'Signed before a buyer sees the address, so the deal cannot be taken around you.',
  },
  {
    key: 'proof_of_funds_request',
    title: 'Proof of funds request',
    category: 'agreement_template',
    jurisdiction: 'all',
    why: 'The standard ask that qualifies a cash buyer before the contract is assigned.',
  },
  {
    key: 'assignment_fee_invoice',
    title: 'Assignment fee invoice and settlement statement',
    category: 'closing',
    jurisdiction: 'all',
    why: 'What title pays you at closing, and the statement that records it.',
  },
  {
    key: 'wire_fraud_notice',
    title: 'Wire fraud warning',
    category: 'closing',
    jurisdiction: 'all',
    why: 'Given to every buyer and seller before funds move; title companies expect it and it limits liability.',
  },
  {
    key: 'tcpa_consent_policy',
    title: 'Texting and calling consent policy and approved scripts',
    category: 'compliance',
    jurisdiction: 'all',
    why: 'Marketing texts and calls need prior express consent, honoured opt-outs and quiet hours. Keep the written policy and the approved scripts on file; Halo enforces the mechanics (docs/messaging-compliance.md).',
    reference: 'TCPA, 47 U.S.C. 227',
  },
  {
    key: 'dnc_policy',
    title: 'Do-not-call policy and procedure',
    category: 'compliance',
    jurisdiction: 'all',
    why: 'A written do-not-call policy is part of the safe harbour. Halo enforces the internal list; this records the policy and the national-registry subscription.',
    reference: 'Telemarketing Sales Rule, 16 C.F.R. 310.4',
  },
  {
    key: 'email_sender_record',
    title: 'Email sender identity and postal address',
    category: 'compliance',
    jurisdiction: 'all',
    why: 'Every marketing email needs a working unsubscribe and a physical postal address. Keep the sender authentication and address record here.',
    reference: 'CAN-SPAM, 15 U.S.C. 7704',
  },
];

/** The items that apply everywhere plus those for the given state. */
export function checklistFor(jurisdiction?: string): ChecklistItem[] {
  const state = jurisdiction?.trim().toUpperCase();
  return WHOLESALE_CHECKLIST.filter(
    (item) => item.jurisdiction === 'all' || item.jurisdiction === state,
  );
}
