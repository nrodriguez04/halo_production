// Provider-agnostic skip-trace contracts. Lifted out of any single
// provider so the worker, controllers, and tests can swap adapters via
// the SKIP_TRACE_PROVIDER env var without touching call sites.
import type {
  CostContext,
  CostIntentHints,
} from '../../cost-control/dto/cost-intent.dto';

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

/**
 * In-process only: carries plaintext contacts from the adapter to the code
 * that encrypts them onto the lead. Never returned from a route; see
 * SkipTraceSummary for what callers get.
 */
export interface SkipTraceResult {
  provider: string;
  status: 'matched' | 'no_match' | 'error';
  phones: SkipTracePhone[];
  emails: SkipTraceEmail[];
  /** Provider-specific raw payload for debugging. */
  raw?: unknown;
  /** Cost recorded by the cost-control service when available. */
  costUsd?: number;
}

/** Cost-control hints a caller can add (lead-score gate, workflow budget). */
export type SkipTraceHints = Pick<CostIntentHints, 'leadScore' | 'workflow'>;

export interface SkipTraceAdapter {
  /** Identifier matching `integration_providers.key`. */
  readonly providerKey: string;
  appendContacts(
    input: SkipTraceInput,
    ctx?: CostContext,
    hints?: SkipTraceHints,
  ): Promise<SkipTraceResult>;
}
