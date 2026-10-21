import { z } from 'zod';
import {
  AGREEMENT_VERIFICATION_KEYS,
  ASSIGNABILITY_VALUES,
  BUYER_SOURCES,
  BUYER_STATUSES,
  BUYER_TRANSACTION_SOURCES,
  CLOSING_ISSUE_KINDS,
  DEAL_STRUCTURES,
  FUNDING_TYPES,
  INVESTMENT_STRATEGIES,
  ISSUE_SEVERITIES,
  OFFER_KINDS,
  OFFER_SOURCES,
  PERMISSION_VALUES,
  TITLE_STATUSES,
  TRI_STATE,
} from '@halo/shared';

/**
 * Request bodies for the contract-flipping routes. Every body is strict:
 * an unknown key is a 400, never silently dropped.
 */

const money = z.number().finite().min(0).max(100_000_000);
const date = z.coerce.date();
const id = z.string().trim().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);
const state = z
  .string()
  .trim()
  .length(2)
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{2}$/.test(s), 'a two-letter state code');

// ------------------------------------------------------ Purchase agreement

const agreementTerms = {
  purchasePrice: money.nullable().optional(),
  earnestMoneyAmount: money.nullable().optional(),
  earnestMoneyDueAt: date.nullable().optional(),
  inspectionEndsAt: date.nullable().optional(),
  closingDeadline: date.nullable().optional(),
  assignability: z.enum(ASSIGNABILITY_VALUES).optional(),
  assignmentClause: text(2000).nullable().optional(),
  sellerConsentDocumentId: id.nullable().optional(),
  sellerAssignmentNotice: z.boolean().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
};

export const RecordAgreementSchema = z
  .object({
    ...agreementTerms,
    /** `executed` needs the signed copy; `draft` is terms still being negotiated. */
    status: z.enum(['draft', 'executed']).default('draft'),
    executedDocumentId: id.optional(),
    executedAt: date.optional(),
  })
  .strict()
  .refine((v) => v.status !== 'executed' || !!v.executedDocumentId, {
    message: 'An executed agreement needs executedDocumentId (the signed copy)',
    path: ['executedDocumentId'],
  });

export const UpdateAgreementSchema = z.object(agreementTerms).strict();

export const MarkExecutedSchema = z
  .object({ executedDocumentId: id, executedAt: date.optional() })
  .strict();

export const VerifyAgreementSchema = z
  .object({
    /** Every verification key, each true: the person checked it against the signed copy. */
    confirmations: z.record(
      z.enum(AGREEMENT_VERIFICATION_KEYS),
      z.literal(true),
    ),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine(
    (v) =>
      AGREEMENT_VERIFICATION_KEYS.every((k) => v.confirmations[k] === true),
    {
      message: `Confirm every term: ${AGREEMENT_VERIFICATION_KEYS.join(', ')}`,
    },
  );

export const EarnestMoneySchema = z
  .object({ depositedAt: date, documentId: id.optional() })
  .strict();

export const ExtendAgreementSchema = z
  .object({
    closingDeadline: date,
    documentId: id,
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const TerminateAgreementSchema = z
  .object({
    status: z.enum(['terminated', 'expired']).default('terminated'),
    reason: text(1000),
  })
  .strict();

// ---------------------------------------------------- Jurisdiction policy

export const JurisdictionPolicySchema = z
  .object({
    assignmentAllowed: z.enum(PERMISSION_VALUES).optional(),
    doubleCloseAllowed: z.enum(PERMISSION_VALUES).optional(),
    licenseRequired: z.enum(TRI_STATE).optional(),
    licenseDocumentId: id.nullable().optional(),
    publicMarketingAllowed: z.enum(PERMISSION_VALUES).optional(),
    buyerDisclosureKeys: z
      .array(z.string().trim().min(1).max(64))
      .max(20)
      .optional(),
    sellerDisclosureKeys: z
      .array(z.string().trim().min(1).max(64))
      .max(20)
      .optional(),
    conditions: z.string().trim().max(2000).nullable().optional(),
    references: z.string().trim().max(4000).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const ReviewPolicySchema = z
  .object({
    /** Who confirmed it (counsel, a firm, the operator) and on what basis. */
    references: text(4000),
    reviewExpiresAt: date.optional(),
  })
  .strict();

export const StateParamSchema = state;

// --------------------------------------------------------------- Buyers

export const BuyBoxSchema = z
  .object({
    locations: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    priceRange: z
      .object({
        min: money.nullable().optional(),
        max: money.nullable().optional(),
      })
      .strict()
      .optional(),
    propertyTypes: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .default([]),
    maxRepairEstimate: money.nullable().optional(),
    minARV: money.nullable().optional(),
    strategies: z.array(z.enum(INVESTMENT_STRATEGIES)).max(6).default([]),
  })
  .strict();

export const BuyerProfileSchema = z
  .object({
    company: z.string().trim().max(120).nullable().optional(),
    status: z.enum(BUYER_STATUSES).optional(),
    source: z.enum(BUYER_SOURCES).optional(),
    sourceDetail: z.string().trim().max(300).nullable().optional(),
    fundingType: z.enum(FUNDING_TYPES).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    preferences: BuyBoxSchema.optional(),
  })
  .strict();

export const ProofOfFundsSchema = z
  .object({
    status: z.enum(['requested', 'received', 'verified', 'rejected']),
    amount: money.nullable().optional(),
    documentId: id.optional(),
    expiresAt: date.nullable().optional(),
  })
  .strict()
  .refine(
    (v) => v.status !== 'verified' || (!!v.documentId && v.amount != null),
    {
      message:
        'Verifying proof of funds needs the document (documentId) and the amount it shows',
    },
  );

export const BuyerTransactionSchema = z
  .object({
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    state: state.optional(),
    zip: z.string().trim().max(10).optional(),
    propertyType: z.string().trim().max(40).optional(),
    price: money.optional(),
    closedAt: date.optional(),
    source: z.enum(BUYER_TRANSACTION_SOURCES).exclude(['halo_closing']),
    sourceRef: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((v) => !!(v.city || v.zip), {
    message: 'A purchase needs a city or zip',
  });

export const BuyerConsentSchema = z
  .object({
    channel: z.enum(['email', 'sms']),
    /** How the buyer agreed: form, verbal, written, existing_relationship. */
    source: z.enum([
      'form',
      'verbal',
      'written',
      'existing_relationship',
      'deal_page',
    ]),
    /** What proves it: where, when, what they agreed to. */
    evidence: text(2000),
  })
  .strict();

export const BuyerImportSchema = z
  .object({
    source: z.enum(BUYER_SOURCES).exclude(['deal_page', 'manual']),
    sourceDetail: text(300),
    /**
     * Only when every buyer in the file asked to receive deals by email, and
     * how they did (the list's signup form, an event sign-in sheet, ...).
     */
    emailConsentBasis: z.string().trim().min(10).max(1000).optional(),
    rows: z
      .array(
        z
          .object({
            name: text(120),
            company: z.string().trim().max(120).optional(),
            email: z.string().trim().email().max(254).optional(),
            phone: z.string().trim().max(30).optional(),
            locations: z
              .array(z.string().trim().min(1).max(80))
              .max(50)
              .optional(),
            priceMin: money.optional(),
            priceMax: money.optional(),
            propertyTypes: z
              .array(z.string().trim().min(1).max(40))
              .max(20)
              .optional(),
            fundingType: z.enum(FUNDING_TYPES).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();

// --------------------------------------------------------------- Offers

export const RecordOfferSchema = z
  .object({
    buyerId: id,
    amount: money.refine((n) => n > 0, 'amount must be positive'),
    kind: z.enum(OFFER_KINDS).default('written_offer'),
    source: z.enum(OFFER_SOURCES).exclude(['deal_page']).default('manual'),
    sourceMessageId: id.optional(),
    campaignId: id.optional(),
    earnestMoney: money.optional(),
    closeBy: date.optional(),
    financing: z.enum(FUNDING_TYPES).optional(),
    conditions: z.string().trim().max(2000).optional(),
    pofProvided: z.boolean().optional(),
    expiresAt: date.optional(),
  })
  .strict();

export const CounterOfferSchema = z
  .object({
    amount: money.refine((n) => n > 0, 'amount must be positive'),
    /** Send the counter to the buyer by email now (through the normal compliance checks). */
    notifyBuyer: z.boolean().default(true),
    message: z.string().trim().max(2000).optional(),
  })
  .strict();

export const DecideOfferSchema = z
  .object({
    reason: z.string().trim().max(1000).optional(),
    notifyBuyer: z.boolean().default(false),
  })
  .strict();

export const AcceptOfferSchema = z
  .object({
    structure: z.enum(DEAL_STRUCTURES).default('assignment'),
    /** The buyer agreed to our counter: accept at the counter amount. */
    atCounter: z.boolean().default(false),
    buyerDepositAmount: money.optional(),
    buyerDepositDueAt: date.optional(),
    /** Accepting below the minimum net profit needs an explicit reason. */
    belowMinimumReason: z.string().trim().min(5).max(1000).optional(),
  })
  .strict();

// ------------------------------------------------------------- Campaigns

export const PrepareCampaignSchema = z
  .object({
    askingPrice: money.optional(),
    maxBuyers: z.number().int().min(1).max(200).default(25),
  })
  .strict();

export const UpdateCampaignSchema = z
  .object({
    askingPrice: money.optional(),
    outreachSubject: text(150).optional(),
    outreachBody: text(5000).optional(),
    removeBuyerIds: z.array(id).max(200).optional(),
    addBuyerIds: z.array(id).max(200).optional(),
    followUpDays: z.number().int().min(1).max(30).optional(),
    maxFollowUps: z.number().int().min(0).max(5).optional(),
  })
  .strict();

export const EndCampaignSchema = z.object({ reason: text(500) }).strict();

// -------------------------------------------------------------- Closing

export const UpdateClosingSchema = z
  .object({
    structure: z.enum(DEAL_STRUCTURES).optional(),
    titleStatus: z.enum(TITLE_STATUSES).optional(),
    closingAgentCompany: z.string().trim().max(160).nullable().optional(),
    closingAgentOfficer: z.string().trim().max(120).nullable().optional(),
    closingAgentEmail: z.string().trim().email().max(254).nullable().optional(),
    closingAgentPhone: z.string().trim().max(30).nullable().optional(),
    fileNumber: z.string().trim().max(80).nullable().optional(),
    scheduledClosingAt: date.nullable().optional(),
  })
  .strict();

export const MilestoneUpdateSchema = z
  .object({
    status: z.enum(['pending', 'done', 'waived']),
    note: z.string().trim().max(1000).optional(),
    evidenceDocumentId: id.optional(),
  })
  .strict()
  .refine((v) => v.status !== 'waived' || !!v.note, {
    message: 'Waiving a milestone needs a note saying why',
  });

export const RaiseIssueSchema = z
  .object({
    kind: z.enum(CLOSING_ISSUE_KINDS),
    severity: z.enum(ISSUE_SEVERITIES).default('blocking'),
    description: text(1000),
  })
  .strict();

export const ResolveIssueSchema = z.object({ resolution: text(1000) }).strict();

export const AssignmentExecutedSchema = z
  .object({ executedDocumentId: id, executedAt: date.optional() })
  .strict();

export const BuyerDepositSchema = z
  .object({
    receivedAt: date,
    amount: money.optional(),
    documentId: id.optional(),
  })
  .strict();

export const CancelAssignmentSchema = z
  .object({
    /** buyer_default: the buyer walked or could not fund (counts against them). */
    cause: z.enum([
      'buyer_default',
      'our_decision',
      'seller_issue',
      'title_issue',
    ]),
    reason: text(1000),
  })
  .strict();

export const ConfirmClosingSchema = z
  .object({
    closedAt: date,
    settlementDocumentId: id,
    /** The fee on the settlement statement. */
    feeOnStatement: money,
    /** When the fee was actually received, if it has been. */
    feeReceivedAt: date.optional(),
  })
  .strict();

export const FeeReceivedSchema = z
  .object({ amount: money, receivedAt: date })
  .strict();

export const CancelClosingSchema = z
  .object({ reason: text(1000), markDealLost: z.boolean().default(true) })
  .strict();

// ------------------------------------------------------ Public deal page

export const PublicResponseSchema = z
  .object({
    intent: z.enum(['interested', 'offer', 'not_interested', 'unsubscribe']),
    /** For a link not tied to a buyer: who is responding. */
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().max(30).optional(),
    amount: money.optional(),
    earnestMoney: money.optional(),
    closeBy: date.optional(),
    financing: z.enum(FUNDING_TYPES).optional(),
    conditions: z.string().trim().max(1000).optional(),
    message: z.string().trim().max(2000).optional(),
    /** The buyer agrees to receive deals from us by email. */
    consentToEmail: z.boolean().optional(),
    /** The buyer acknowledged the disclosures shown on the page. */
    acknowledgedDisclosures: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.intent !== 'offer' || (v.amount != null && v.amount > 0), {
    message: 'An offer needs an amount',
    path: ['amount'],
  })
  .refine((v) => v.intent !== 'offer' || v.acknowledgedDisclosures === true, {
    message: 'Acknowledge the disclosures before making an offer',
    path: ['acknowledgedDisclosures'],
  });
