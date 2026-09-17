import { HttpException, HttpStatus } from '@nestjs/common';
import type { CostDecision } from './dto/cost-intent.dto';

/**
 * Raised when the cost-control preflight suppresses a paid provider call.
 *
 * Previously a suppressed call returned `null`, which controllers serialised
 * as HTTP 200 with an empty body — indistinguishable from "the provider had
 * no data". Callers silently treated a spend cap as a negative result and
 * carried on with empty values. A distinct 429 with a machine-readable
 * `reason` makes the suppression explicit.
 */
export class CostBlockedException extends HttpException {
  constructor(
    readonly decision: CostDecision,
    readonly provider: string,
    readonly action: string,
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Cost control',
        code: 'COST_BLOCKED',
        reason: decision.kind,
        provider,
        action,
        message: describe(decision.kind, provider),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function describe(kind: string, provider: string): string {
  switch (kind) {
    case 'BLOCK_OVER_BUDGET':
      return `Spend cap reached for "${provider}"; the call was not made.`;
    case 'QUEUE_UNTIL_NEXT_BUDGET_PERIOD':
      return `Spend cap reached for "${provider}"; queued until the next budget period.`;
    case 'BLOCK_FEATURE_DISABLED':
      return `Provider "${provider}" is disabled by a feature flag.`;
    case 'BLOCK_LOW_LEAD_SCORE':
      return `Lead score is below the threshold configured for "${provider}".`;
    case 'BLOCK_DUPLICATE_CALL':
      return `Duplicate call to "${provider}" suppressed by the idempotency window.`;
    case 'REQUIRE_MANUAL_APPROVAL':
      return `Call to "${provider}" exceeds the auto-approval threshold and needs manual approval.`;
    default:
      return `Call to "${provider}" was blocked by cost control (${kind}).`;
  }
}
