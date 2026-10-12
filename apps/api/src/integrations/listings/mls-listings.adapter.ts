import { Injectable } from '@nestjs/common';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { MlsService } from '../mls/mls.service';
import type {
  ListingSearchCriteria,
  ListingSearchResult,
  ListingSourceAdapter,
} from './listing-source.types';

/** The licensed RESO feed (docs/integrations/mls.md) behind the common adapter shape. */
@Injectable()
export class MlsListingsAdapter implements ListingSourceAdapter {
  readonly source = 'mls' as const;
  readonly statuses = [
    'Active',
    'Pending',
    'Expired',
    'Withdrawn',
    'Canceled',
    'Closed',
  ] as const;

  constructor(private mls: MlsService) {}

  async search(
    criteria: ListingSearchCriteria,
    ctx: CostContext,
  ): Promise<ListingSearchResult> {
    const result = await this.mls.searchListings(criteria, ctx);
    return {
      source: 'mls',
      feed: result.dialect,
      listings: result.listings,
      total: result.total,
    };
  }
}
