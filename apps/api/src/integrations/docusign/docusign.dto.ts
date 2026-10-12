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
  })
  .strict();

// The api compiles with strictNullChecks off, which makes every zod-inferred
// key optional; these are the real shapes the service works with.
export interface EnvelopeRecipientInput {
  role: 'seller' | 'buyer' | 'other';
  buyerId?: string;
  name?: string;
  email?: string;
  routingOrder?: number;
}

export interface CreateEnvelopeInput {
  dealId: string;
  documentIds: string[];
  recipients: EnvelopeRecipientInput[];
  emailSubject?: string;
  emailBlurb?: string;
}
