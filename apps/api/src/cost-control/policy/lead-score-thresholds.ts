// Per-action minimum lead score / expected ROI thresholds. Used by the
// cost-control preflight to issue BLOCK_LOW_LEAD_SCORE for leads that
// don't justify the cost of a given provider call.
//
// Scores are 0-100. Expected ROI is in USD and only checked when the
// caller supplies it via metadata; otherwise the rule short-circuits.
//
// These defaults map to the staged enrichment funnel in the plan: cheap
// classification first, expensive AI / skip trace only on qualified leads.

export interface ScoreThreshold {
  minScore: number;
  minExpectedRoiUsd?: number;
}

const THRESHOLDS: Record<string, ScoreThreshold> = {
  // Property data — gate at score 0 (run on every imported lead) up to 30
  'attom.property_expanded_profile': { minScore: 0 },
  'rentcast.value_estimate': { minScore: 30 },
  'rentcast.rent_estimate': { minScore: 30 },
  'rentcast.listings': { minScore: 0 },

  // Geocoding — cheap, no gate
  'google_geocoding.geocode': { minScore: 0 },

  // Skip trace — only worth it on serious leads
  'batch_skiptrace.append_contacts': { minScore: 60, minExpectedRoiUsd: 5000 },
  'datazapp.append_contacts': { minScore: 60, minExpectedRoiUsd: 5000 },
  'propertyradar.append_contacts': { minScore: 60, minExpectedRoiUsd: 5000 },

  // Comms — only when contact confidence is high
  'twilio.send_sms': { minScore: 70 },
  'twilio.send_sms.us': { minScore: 70 },
  'twilio.send_sms.toll_free': { minScore: 70 },
  'resend.send_email': { minScore: 50 },

  // AI — cheap for classification, expensive for reasoning
  'openai.chat_completion.gpt-4o-mini': { minScore: 0 },
  'openai.chat_completion.gpt-4o': { minScore: 80, minExpectedRoiUsd: 10000 },
  'openai.chat_completion.gpt-4-turbo': { minScore: 80, minExpectedRoiUsd: 10000 },
};

export const DEFAULT_THRESHOLD: ScoreThreshold = { minScore: 0 };

export function thresholdFor(provider: string, action: string): ScoreThreshold {
  return THRESHOLDS[`${provider}.${action}`] ?? DEFAULT_THRESHOLD;
}
