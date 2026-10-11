import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PIIService } from './pii.service';

// Global: every response that can carry a contact (leads, deals, the agent
// context, buyers) presents it through PIIService so reveals are audited.
@Global()
@Module({
  providers: [PIIService, PrismaService],
  exports: [PIIService],
})
export class PIIModule {}
