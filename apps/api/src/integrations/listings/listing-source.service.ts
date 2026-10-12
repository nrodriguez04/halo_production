import { Injectable } from '@nestjs/common';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import type {
  ListingSearchCriteria,
  ListingSearchResult,
  ListingSource,
  ListingSourceAdapter,
} from './listing-source.types';
import { MlsListingsAdapter } from './mls-listings.adapter';
import { RealieLeadsAdapter } from './realie-leads.adapter';
import { RentCastListingsService } from './rentcast-listings.service';

/** One entry point for "give me records from X"; the import service and the API route use only this. */
@Injectable()
export class ListingSourceService {
  private readonly adapters: Record<ListingSource, ListingSourceAdapter>;

  constructor(
    mls: MlsListingsAdapter,
    rentcast: RentCastListingsService,
    realie: RealieLeadsAdapter,
  ) {
    this.adapters = { mls, rentcast, realie };
  }

  search(
    source: ListingSource,
    criteria: ListingSearchCriteria,
    ctx: CostContext,
  ): Promise<ListingSearchResult> {
    return this.adapters[source].search(criteria, ctx);
  }

  /** Status vocabulary of a source; the first entry is its default. */
  statuses(source: ListingSource): readonly string[] {
    return this.adapters[source].statuses;
  }
}
