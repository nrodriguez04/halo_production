// Static fallback chain — when a provider's hard cap is hit, the cost
// control service tries the next provider in the chain instead of
// blocking outright. Returning `null` means fail closed (BLOCK).
//
// A future enhancement is to read these from `IntegrationProvider.metadata`
// so they can be tuned without a deploy; this file is the seed for that
// data.

const FALLBACK_CHAINS: Record<string, string[]> = {
  // Only keep fallbacks for callers that actually dispatch on
  // `resolved.provider`. Cross-provider chains elsewhere would debit one
  // provider while still calling another, so they must fail closed.
  attom: [],
  rentcast: [],
  batch_skiptrace: [],
  datazapp: [],
  propertyradar: [],

  // EmailSendService switches on `resolved.provider`, so resend -> smtp is safe.
  resend: ['smtp'],
  smtp: [],

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
