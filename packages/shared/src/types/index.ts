// Core domain types

export type DealStage =
  | 'new'
  | 'contacted'
  | 'negotiating'
  | 'under_contract'
  | 'marketing'
  | 'assigned'
  | 'closed'
  | 'lost';

export type MessageChannel = 'sms' | 'email';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'delivered'
  | 'failed';

export type LeadStatus =
  | 'new'
  | 'enriched'
  | 'underwriting'
  | 'contacted'
  | 'qualified'
  | 'rejected';

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'completed' | 'declined';

export type AIProvider = 'openai' | 'anthropic';

export type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'delayed';

export interface UnderwritingAnalysis {
  arv: number;
  repairEstimate: number;
  mao: number;
  confidence: number;
  rationale: string;
  compsSummary: {
    properties: Array<{
      address: string;
      salePrice: number;
      saleDate: string;
      distance: number;
    }>;
    averagePrice: number;
    medianPrice: number;
  };
}

export interface MarketingMaterial {
  type: 'flyer' | 'video_script' | 'buyer_blast';
  content: string;
  fileUrl?: string;
  metadata?: Record<string, any>;
}

export interface BuyerPreferences {
  locations?: string[];
  priceRange?: {
    min: number;
    max: number;
  };
  propertyTypes?: string[];
  minARV?: number;
  maxRepairEstimate?: number;
}
