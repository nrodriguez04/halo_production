import { Injectable } from '@nestjs/common';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { MlsClient } from './mls.client';
import { resolveMlsConfig } from './mls.config';
import type { MlsSearchCriteria, MlsSearchResult } from './mls.types';

/**
 * Listing search through the tenant's MLS feed, behind cost control like
 * every other external call: rate-limited, ledgered (at $0 unless the feed
 * vendor charges per call; set a pricing rule if so), and cached for a short
 * window so a page refresh does not re-query the feed.
 *
 * Access to MLS data is licensed per MLS. Bridge Data Output, MLS Grid,
 * Trestle and Spark all expose the RESO Web API once an MLS has approved the
 * account; configure the dialect and credentials in env or on the
 * Integrations page. See docs/integrations/mls.md.
 */
@Injectable()
export class MlsService {
  constructor(
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  /**
   * Settings are resolved on every call, so a key saved on the Integrations
   * page takes effect without a restart. A missing setting fails here as
   * NOT_CONFIGURED, before anything is charged or ledgered.
   */
  async searchListings(
    criteria: MlsSearchCriteria,
    ctx: CostContext,
  ): Promise<MlsSearchResult> {
    const config = await resolveMlsConfig((key) =>
      this.secrets.resolve('mls', key),
    );
    const client = new MlsClient(config);
    const out = await this.costControl.checkAndCall<
      MlsSearchCriteria,
      MlsSearchResult
    >({
      provider: 'mls',
      action: 'search_listings',
      payload: criteria,
      context: ctx,
      execute: () => client.search(criteria),
    });
    const result = out.result as MlsSearchResult | null;
    if (!result) {
      // A blocked decision (rate limit, disabled provider) surfaces as a
      // typed exception from cost control; an empty result here means the
      // call was withheld without one, which callers treat as "no listings".
      return { listings: [], total: 0, dialect: client.dialect };
    }
    return result;
  }
}
