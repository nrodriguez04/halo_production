// Provider-agnostic skip-trace contracts. Lifted out of any single
// provider so the worker, controllers, and tests can swap adapters via
// the SKIP_TRACE_PROVIDER env var without touching call sites.

export interface SkipTraceInput {
  leadId: string;
  propertyAddress: string;
  ownerName?: string;
  ownerMailingAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  attomId?: string;
}

export interface SkipTracePhone {
  number: string;
  type?: 'mobile' | 'landline' | 'voip' | 'unknown';
  confidence?: number;
  isDnc?: boolean;
}

export interface SkipTraceEmail {
  email: string;
  confidence?: number;
}

export interface SkipTraceResult {
  provider: string;
  status: 'matched' | 'no_match' | 'error';
  phones: SkipTracePhone[];
  emails: SkipTraceEmail[];
  /** Provider-specific raw payload for debugging / audit. */
  raw?: unknown;
  /** Cost recorded by the cost-control service when available. */
  costUsd?: number;
}

export interface SkipTraceAdapter {
  /** Identifier matching `integration_providers.key`. */
  readonly providerKey: string;
  appendContacts(input: SkipTraceInput): Promise<SkipTraceResult>;
}
