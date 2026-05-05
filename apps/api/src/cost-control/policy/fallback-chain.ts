// Static fallback chain — when a provider's hard cap is hit, the cost
// control service tries the next provider in the chain instead of
// blocking outright. Returning `null` means fail closed (BLOCK).
//
// A future enhancement is to read these from `IntegrationProvider.metadata`
// so they can be tuned without a deploy; this file is the seed for that
// data.

const FALLBACK_CHAINS: Record<string, string[]> = {
  // Property data — PropertyRadar can substitute when re-enabled
  attom: ['propertyradar'],
  rentcast: [],

  // Skip trace — try cheaper providers first
  batch_skiptrace: ['datazapp', 'propertyradar'],
  datazapp: ['batch_skiptrace', 'propertyradar'],
  propertyradar: ['batch_skiptrace', 'datazapp'],

  // Email — fall back to SMTP if Resend is over budget
  resend: ['smtp'],
  smtp: [],

  // No fallback for AI / SMS / geocoding — those services either work or fail closed
  openai: [],
  twilio: [],
  google_geocoding: [],
};

export function nextFallback(providerKey: string, alreadyTried: Set<string>): string | null {
  const chain = FALLBACK_CHAINS[providerKey] ?? [];
  for (const candidate of chain) {
    if (!alreadyTried.has(candidate)) return candidate;
  }
  return null;
}

export function hasFallback(providerKey: string): boolean {
  return (FALLBACK_CHAINS[providerKey]?.length ?? 0) > 0;
}
