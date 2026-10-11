import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import type { CostContext } from '../cost-control/dto/cost-intent.dto';
import { BatchSkipTraceAdapter } from './adapters/batch-skip-trace.adapter';
import { PropertyRadarSkipTraceAdapter } from './adapters/propertyradar-skip-trace.adapter';
import { StubSkipTraceAdapter } from './adapters/stub-skip-trace.adapter';
import type {
  SkipTraceAdapter,
  SkipTraceHints,
  SkipTraceInput,
  SkipTraceResult,
} from './dto/skip-trace.dto';

// Routes a SkipTraceInput to the active adapter. Driven by the
// `SKIP_TRACE_PROVIDER` env var which defaults to `batch`. Adapters that
// hit live APIs route through `IntegrationCostControlService.checkAndCall`
// internally, so this service has no budget logic of its own.

export type SkipTraceProviderKey = 'batch' | 'stub' | 'propertyradar';

@Injectable()
export class SkipTraceService {
  private readonly logger = new Logger(SkipTraceService.name);

  constructor(
    @Inject(BatchSkipTraceAdapter)
    private readonly batch: BatchSkipTraceAdapter,
    @Inject(StubSkipTraceAdapter) private readonly stub: StubSkipTraceAdapter,
    @Inject(PropertyRadarSkipTraceAdapter)
    private readonly propertyRadar: PropertyRadarSkipTraceAdapter,
  ) {}

  /**
   * A cost-control block (429) or an unavailable provider (503) is
   * rethrown as is, so callers can tell "not allowed / not configured" from
   * "the provider failed". Anything else is logged and reported as
   * status 'error' without failing the caller.
   */
  async appendContacts(
    input: SkipTraceInput,
    ctx: CostContext,
    hints?: SkipTraceHints,
  ): Promise<SkipTraceResult> {
    const adapter = this.resolveAdapter();
    try {
      return await adapter.appendContacts(input, ctx, hints);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `Skip-trace failed via ${adapter.providerKey}: ${(err as Error).message}`,
      );
      return {
        provider: adapter.providerKey,
        status: 'error',
        phones: [],
        emails: [],
      };
    }
  }

  private resolveAdapter(): SkipTraceAdapter {
    const requested = (
      process.env.SKIP_TRACE_PROVIDER || 'batch'
    ).toLowerCase() as SkipTraceProviderKey;
    switch (requested) {
      case 'stub':
        return this.stub;
      case 'propertyradar':
        return this.propertyRadar;
      case 'batch':
      default:
        return this.batch;
    }
  }
}
