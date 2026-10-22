import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { TimelineModule } from '../timeline/timeline.module';
import { DispositionGateModule } from '../disposition/disposition-gate.module';
import { TemplatesService } from './templates.service';
import {
  DealTemplatesController,
  TemplatesController,
} from './templates.controller';

/** Document templates and generation (docs/markets.md s6). */
@Module({
  imports: [DocumentsModule, TimelineModule, DispositionGateModule],
  controllers: [TemplatesController, DealTemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
