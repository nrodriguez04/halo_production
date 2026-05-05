// Default response-cache TTLs per provider/action. Callers can override
// per-intent via `hints.cacheTtlSec`. A value of 0 disables caching
// (e.g. side-effectful calls like SMS / email and non-deterministic
// LLM completions).

const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h

const CACHE_TTL: Record<string, number> = {
  'attom.property_expanded_profile': 60 * 60 * 24 * 30, // 30d
  'attom.property_assessment': 60 * 60 * 24 * 30,

  'rentcast.value_estimate': 60 * 60 * 24 * 7, // 7d
  'rentcast.rent_estimate': 60 * 60 * 24 * 14, // 14d
  'rentcast.listings': 60 * 60 * 12, // 12h
  'rentcast.property': 60 * 60 * 24 * 14,

  'google_geocoding.geocode': 60 * 60 * 24 * 365, // 1y
  'google_geocoding.reverse_geocode': 60 * 60 * 24 * 365,

  'batch_skiptrace.append_contacts': 60 * 60 * 24 * 90, // 90d
  'datazapp.append_contacts': 60 * 60 * 24 * 90,
  'propertyradar.append_contacts': 60 * 60 * 24 * 90,
  'propertyradar.property_lookup': 60 * 60 * 24 * 30,

  // Side effects + non-deterministic — never cache
  'twilio.send_sms': 0,
  'twilio.send_sms.us': 0,
  'twilio.send_sms.toll_free': 0,
  'resend.send_email': 0,
  'smtp.send_email': 0,
  'openai.chat_completion.gpt-4o-mini': 0,
  'openai.chat_completion.gpt-4o': 0,
  'openai.chat_completion.gpt-4-turbo': 0,
};

export function defaultCacheTtlSec(provider: string, action: string): number {
  const key = `${provider}.${action}`;
  return CACHE_TTL[key] ?? DEFAULT_TTL_SEC;
}
