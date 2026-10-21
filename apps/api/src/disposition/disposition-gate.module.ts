import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DispositionEligibilityService } from './eligibility.service';

/**
 * The disposition gate on its own, with no dependencies beyond the
 * database, so the deals module can refuse a move into marketing without
 * importing the rest of disposition (which itself depends on deals).
 */
@Module({
  providers: [DispositionEligibilityService, PrismaService],
  exports: [DispositionEligibilityService],
})
export class DispositionGateModule {}
