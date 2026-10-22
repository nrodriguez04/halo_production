import { BadRequestException } from '@nestjs/common';
import type { DealStructure } from '@halo/shared';

/**
 * Whether the deal's market lets it close this way: an assignment or a
 * double close, each only where the approved policy makes it available
 * (docs/markets.md s3). Its own file so the closing and assignment
 * services can both use it without importing each other.
 */
export function assertStructureAllowed(
  structure: DealStructure,
  market: {
    evaluation: {
      code: string;
      activities: Record<string, { allowed: boolean; reason: string }>;
    };
  } | null,
) {
  const activity = structure === 'double_close' ? 'double_close' : 'assignment';
  const allowed = market?.evaluation.activities[activity];
  if (!allowed?.allowed) {
    throw new BadRequestException(
      market
        ? `A ${structure.replace('_', ' ')} is not available in ${market.evaluation.code}: ${allowed?.reason ?? 'the approved policy does not allow it.'} A double close has its own funding, title and disclosure requirements; counsel decides whether it is lawful there.`
        : "Halo cannot place this property in a state, so no closing structure can be confirmed. Record the property's state.",
    );
  }
}
