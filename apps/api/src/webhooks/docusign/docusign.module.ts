import { Module } from '@nestjs/common';
import { DocuSignController } from './docusign.controller';
import { DocuSignService } from './docusign.service';
import { PrismaService } from '../../prisma.service';
import { TimelineModule } from '../../timeline/timeline.module';
import { DealsModule } from '../../deals/deals.module';

@Module({
  imports: [TimelineModule, DealsModule],
  controllers: [DocuSignController],
  providers: [DocuSignService, PrismaService],
})
export class DocuSignModule {}

