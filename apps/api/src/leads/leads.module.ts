import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { TimelineModule } from '../timeline/timeline.module';
import { ListingsModule } from '../integrations/listings/listings.module';
import { ListingImportService } from './listing-import.service';

@Module({
  imports: [TimelineModule, ListingsModule],
  controllers: [LeadsController],
  providers: [LeadsService, ListingImportService],
  exports: [LeadsService, ListingImportService],
})
export class LeadsModule {}
