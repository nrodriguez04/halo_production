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
  'mls.search_listings': 60 * 15, // 15m: a page refresh must not re-query the feed
  'rentcast.search_listings': 60 * 60 * 12, // 12h: repeating a pull is free
  'realie.search_properties': 60 * 60 * 12, // 12h: one token per page
  'realie.address_lookup': 60 * 60 * 24 * 30,

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

/**
 * Actions whose responses carry contact PII (phones, emails). Cached
 * responses for them are sealed at rest.
 */
export function responseContainsContacts(
  provider: string,
  action: string,
): boolean {
  // Listing searches carry the listing agent's direct phone and email.
  return (
    action === 'append_contacts' ||
    action === 'search_listings' ||
    provider === 'mls'
  );
}

export function defaultCacheTtlSec(provider: string, action: string): number {
  // Model completions are non-deterministic and provider-agnostic here, so
  // the rule is by action prefix rather than one entry per model.
  if (action.startsWith('chat_completion.')) return 0;
  const key = `${provider}.${action}`;
  return CACHE_TTL[key] ?? DEFAULT_TTL_SEC;
}
