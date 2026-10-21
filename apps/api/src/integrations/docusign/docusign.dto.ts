import { z } from 'zod';

export const EnvelopeRecipientSchema = z
  .object({
    role: z.enum(['seller', 'buyer', 'other']),
    /** Required for role buyer. */
    buyerId: z.string().trim().min(1).max(64).optional(),
    /** Required for role other; optional override for seller and buyer. */
    name: z.string().trim().min(1).max(120).optional(),
    /** Required for role other. Seller and buyer addresses come from their records. */
    email: z.string().trim().email().max(254).optional(),
    routingOrder: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export const CreateEnvelopeSchema = z
  .object({
    dealId: z.string().trim().min(1).max(64),
    /** Documents from the library, in signing order. */
    documentIds: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
    recipients: z.array(EnvelopeRecipientSchema).min(1).max(6),
    emailSubject: z.string().trim().min(1).max(100).optional(),
    emailBlurb: z.string().trim().max(1000).optional(),
    /**
     * What is being signed. A purchase agreement records the seller contract
     * (docs/contract-flipping.md); an assignment needs the approved
     * assignment it executes. Inferred from the recipients when absent.
     */
    purpose: z.enum(['purchase_agreement', 'assignment', 'other']).optional(),
    assignmentId: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .refine((v) => v.purpose !== 'assignment' || !!v.assignmentId, {
    message: 'An assignment envelope needs the assignmentId it executes',
    path: ['assignmentId'],
  });

// The api compiles with strictNullChecks off, which makes every zod-inferred
// key optional; these are the real shapes the service works with.
export interface EnvelopeRecipientInput {
  role: 'seller' | 'buyer' | 'other';
  buyerId?: string;
  name?: string;
  email?: string;
  routingOrder?: number;
}

export type EnvelopePurpose = 'purchase_agreement' | 'assignment' | 'other';

export interface CreateEnvelopeInput {
  dealId: string;
  documentIds: string[];
  recipients: EnvelopeRecipientInput[];
  emailSubject?: string;
  emailBlurb?: string;
  purpose?: EnvelopePurpose;
  assignmentId?: string;
}

/**
 * Seller only: the purchase agreement. Buyer only: an assignment (it still
 * needs its assignmentId). Anything else is a document Halo stores but does
 * not act on.
 */
export function envelopePurpose(input: CreateEnvelopeInput): EnvelopePurpose {
  if (input.purpose) return input.purpose;
  const roles = new Set(input.recipients.map((r) => r.role));
  if (roles.has('seller') && !roles.has('buyer')) return 'purchase_agreement';
  if (roles.has('buyer') && !roles.has('seller') && input.assignmentId)
    return 'assignment';
  return 'other';
}
