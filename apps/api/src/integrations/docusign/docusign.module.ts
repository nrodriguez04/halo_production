import { Module } from '@nestjs/common';
import { DocuSignController } from './docusign.controller';
import { DocuSignService } from './docusign.service';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';
import { TimelineModule } from '../../timeline/timeline.module';
import { DealsModule } from '../../deals/deals.module';

@Module({
  imports: [ControlPlaneModule, TimelineModule, DealsModule],
  controllers: [DocuSignController],
  providers: [DocuSignService, PrismaService],
  exports: [DocuSignService],
})
export class DocuSignIntegrationModule {}


