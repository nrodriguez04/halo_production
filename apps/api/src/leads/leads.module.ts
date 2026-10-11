import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma.service';
import { TimelineModule } from '../timeline/timeline.module';
import { MlsModule } from '../integrations/mls/mls.module';
import { MlsImportService } from './mls-import.service';

@Module({
  imports: [TimelineModule, MlsModule],
  controllers: [LeadsController],
  providers: [LeadsService, MlsImportService, PrismaService],
  exports: [LeadsService],
})
export class LeadsModule {}
