import { Module } from '@nestjs/common';
import { DispositionEligibilityService } from './eligibility.service';
import { MarketsModule } from '../markets/markets.module';

/**
 * The disposition gate on its own, with no dependencies beyond the
 * database and markets, so the deals module can refuse a move into
 * marketing without importing the rest of disposition (which itself
 * depends on deals).
 */
@Module({
  imports: [MarketsModule],
  providers: [DispositionEligibilityService],
  exports: [DispositionEligibilityService, MarketsModule],
})
export class DispositionGateModule {}
