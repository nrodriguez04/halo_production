import { z } from 'zod';

// Lead schemas
export const LeadCreateSchema = z.object({
  accountId: z.string(),
  canonicalAddress: z.string().optional(),
  canonicalCity: z.string().optional(),
  canonicalState: z.string().optional(),
  canonicalZip: z.string().optional(),
  canonicalOwner: z.string().optional(),
  canonicalPhone: z.string().optional(),
  canonicalEmail: z.string().optional(),
  status: z.string().default('new'),
  tags: z.array(z.string()).default([]),
});

export const LeadUpdateSchema = LeadCreateSchema.partial();

// Property schemas
export const PropertyCreateSchema = z.object({
  accountId: z.string(),
  leadId: z.string().optional(),
  apn: z.string().optional(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  confidence: z.number().min(0).max(1).default(1.0),
});

// Deal schemas
export const DealCreateSchema = z.object({
  accountId: z.string(),
  leadId: z.string().optional(),
  propertyId: z.string().optional(),
  stage: z.enum(['new', 'contacted', 'negotiating', 'under_contract', 'marketing', 'assigned', 'closed', 'lost']).default('new'),
  arv: z.number().optional(),
  repairEstimate: z.number().optional(),
  mao: z.number().optional(),
  offerAmount: z.number().optional(),
});

export const DealUpdateSchema = DealCreateSchema.partial();

// Message schemas
export const MessageCreateSchema = z.object({
  accountId: z.string(),
  leadId: z.string().optional(),
  dealId: z.string().optional(),
  channel: z.enum(['sms', 'email']),
  direction: z.enum(['inbound', 'outbound']),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
});

// Buyer schemas
export const BuyerCreateSchema = z.object({
  accountId: z.string(),
  name: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  preferences: z.record(z.any()).optional(),
});

// CSV Import schema
export const CSVImportRowSchema = z.object({
  address: z.string(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  owner: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

export type LeadCreate = z.infer<typeof LeadCreateSchema>;
export type LeadUpdate = z.infer<typeof LeadUpdateSchema>;
export type PropertyCreate = z.infer<typeof PropertyCreateSchema>;
export type DealCreate = z.infer<typeof DealCreateSchema>;
export type DealUpdate = z.infer<typeof DealUpdateSchema>;
export type MessageCreate = z.infer<typeof MessageCreateSchema>;
export type BuyerCreate = z.infer<typeof BuyerCreateSchema>;
export type CSVImportRow = z.infer<typeof CSVImportRowSchema>;
