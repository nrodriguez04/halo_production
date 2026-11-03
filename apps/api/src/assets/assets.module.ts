import { Module } from '@nestjs/common';
import { PublicGisModule } from '../integrations/public-gis/public-gis.module';
import { PropertyIntelligenceService } from './property-intelligence.service';
import { AssetsController } from './assets.controller';

/**
 * Asset classes (docs/asset-classes.md): classification, property facts,
 * use-code mappings and the free public-record checks. Underwriting by
 * asset class lives with the deal economics in the disposition module.
 */
@Module({
  imports: [PublicGisModule],
  controllers: [AssetsController],
  providers: [PropertyIntelligenceService],
  exports: [PropertyIntelligenceService],
})
export class AssetsModule {}
