import type { TemplateKind } from '@halo/shared';
import type { DocxBlock } from './template-files';

/**
 * Starter scaffolds: the merge-field layout of each document Halo
 * generates, with every clause left for counsel. They are not legal text
 * and are never approved by installing them. They apply to no
 * jurisdiction until a person uploads counsel's version for one, so they
 * do not count toward any market's readiness.
 */

const BANNER: DocxBlock[] = [
  {
    text: 'STARTER SCAFFOLD - NOT LEGAL TEXT - NOT APPROVED FOR USE',
    style: 'note',
  },
  {
    text: 'Halo generated this layout to show the merge fields it fills. Counsel must write every clause marked [COUNSEL]. Upload counsel’s version as a new template version and have it approved for the jurisdictions it covers before any use.',
    style: 'note',
  },
];

const PARTIES_PROPERTY: DocxBlock[] = [
  { text: 'Property', style: 'heading' },
  {
    text: '{{property_address}}, {{property_city}}, {{property_state}} {{property_zip}} (County: {{property_county}}; APN: {{property_apn}})',
  },
];

export const STARTER_SCAFFOLDS: Array<{
  kind: TemplateKind;
  name: string;
  blocks: DocxBlock[];
}> = [
  {
    kind: 'purchase_agreement',
    name: 'Starter scaffold: purchase agreement',
    blocks: [
      ...BANNER,
      { text: 'Purchase and Sale Agreement', style: 'title' },
      { text: 'Effective date: {{effective_date}}' },
      { text: 'Seller: {{seller_name}}' },
      { text: 'Buyer: {{buyer_entity}}, and its successors and assigns' },
      ...PARTIES_PROPERTY,
      { text: 'Price and deposit', style: 'heading' },
      {
        text: 'Purchase price: {{purchase_price}}. Earnest money: {{earnest_money}}, due {{earnest_money_due}}.',
      },
      {
        text: 'Inspection period ends {{inspection_ends}}. Closing on or before {{closing_deadline}}.',
      },
      { text: 'Assignment', style: 'heading' },
      {
        text: '[COUNSEL: assignment clause, including any notice or consent the jurisdiction requires]',
      },
      { text: 'Seller cancellation', style: 'heading' },
      {
        text: '[COUNSEL: statutory cancellation right, if any; the approved policy allows {{seller_cancellation_days}}]',
      },
      { text: 'Disclosures', style: 'heading' },
      {
        text: '[COUNSEL: required wholesaling disclosures, in the form and type size the jurisdiction requires]',
      },
      { text: 'Other terms', style: 'heading' },
      {
        text: '[COUNSEL: title, closing costs, default, remedies, governing law]',
      },
      { text: 'Seller: [SELLER_SIGNATURE] Date: [SELLER_DATE]' },
      { text: 'Buyer: [BUYER_SIGNATURE] Date: [BUYER_DATE]' },
    ],
  },
  {
    kind: 'assignment_agreement',
    name: 'Starter scaffold: assignment of contract',
    blocks: [
      ...BANNER,
      { text: 'Assignment of Purchase and Sale Agreement', style: 'title' },
      { text: 'Effective date: {{effective_date}}' },
      { text: 'Assignor: {{assignor_entity}}. Assignee: {{assignee_name}}.' },
      {
        text: 'Original agreement dated {{original_contract_date}} with {{seller_name}}.',
      },
      ...PARTIES_PROPERTY,
      { text: 'Consideration', style: 'heading' },
      {
        text: 'Assignee’s total price: {{assignment_price}}, which includes an assignment fee of {{assignment_fee}}.',
      },
      {
        text: 'Assignee deposit: {{buyer_deposit}}, due {{buyer_deposit_due}}. Closing on or before {{closing_deadline}} with {{closing_agent}}.',
      },
      { text: 'Terms', style: 'heading' },
      {
        text: '[COUNSEL: assignment and assumption, deposit handling, default, notices, disclosures the jurisdiction requires]',
      },
      { text: 'Assignor: [ASSIGNOR_SIGNATURE] Date: [ASSIGNOR_DATE]' },
      { text: 'Assignee: [BUYER_SIGNATURE] Date: [BUYER_DATE]' },
    ],
  },
  {
    kind: 'seller_disclosure',
    name: 'Starter scaffold: seller disclosure',
    blocks: [
      ...BANNER,
      { text: 'Disclosure to Seller', style: 'title' },
      {
        text: 'Date: {{effective_date}}. To: {{seller_name}}. From: {{buyer_entity}}.',
      },
      ...PARTIES_PROPERTY,
      {
        text: '[COUNSEL: the statutory disclosure text, e.g. intent to assign or market the contract, that the buyer is not acting as the seller’s agent, and the seller’s right to seek counsel]',
      },
      {
        text: '[COUNSEL: cancellation right, if any: {{seller_cancellation_days}}]',
      },
      { text: 'Seller acknowledgment: [SELLER_SIGNATURE] Date: [SELLER_DATE]' },
    ],
  },
  {
    kind: 'buyer_disclosure',
    name: 'Starter scaffold: buyer disclosure',
    blocks: [
      ...BANNER,
      { text: 'Disclosure to Prospective Buyer', style: 'title' },
      { text: 'Date: {{effective_date}}. From: {{assignor_entity}}.' },
      ...PARTIES_PROPERTY,
      {
        text: '[COUNSEL: the statutory notice, e.g. that the seller of the interest holds only a contractual (equitable) interest and not title]',
      },
      { text: 'Buyer acknowledgment: [BUYER_SIGNATURE] Date: [BUYER_DATE]' },
    ],
  },
  {
    kind: 'cancellation_notice',
    name: 'Starter scaffold: notice of cancellation right',
    blocks: [
      ...BANNER,
      { text: 'Notice of Right to Cancel', style: 'title' },
      {
        text: 'Date: {{effective_date}}. To: {{seller_name}}. From: {{buyer_entity}}.',
      },
      ...PARTIES_PROPERTY,
      { text: 'Agreement dated {{original_contract_date}}.' },
      {
        text: 'You may cancel within {{seller_cancellation_days}} of signing, until {{cancellation_deadline}}.',
      },
      {
        text: '[COUNSEL: the statutory form, how to cancel, and where to send notice]',
      },
    ],
  },
];
