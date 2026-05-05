import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CostContext } from '../cost-control/dto/cost-intent.dto';
import { BatchSkipTraceAdapter } from './adapters/batch-skip-trace.adapter';
import { PropertyRadarSkipTraceAdapter } from './adapters/propertyradar-skip-trace.adapter';
import { StubSkipTraceAdapter } from './adapters/stub-skip-trace.adapter';
import type {
  SkipTraceAdapter,
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
    @Inject(BatchSkipTraceAdapter) private readonly batch: BatchSkipTraceAdapter,
    @Inject(StubSkipTraceAdapter) private readonly stub: StubSkipTraceAdapter,
    @Inject(PropertyRadarSkipTraceAdapter) private readonly propertyRadar: PropertyRadarSkipTraceAdapter,
  ) {}

  async appendContacts(input: SkipTraceInput, ctx: CostContext): Promise<SkipTraceResult> {
    const adapter = this.resolveAdapter();
    try {
      return await callAdapter(adapter, input, ctx);
    } catch (err) {
      this.logger.error(`Skip-trace failed via ${adapter.providerKey}: ${(err as Error).message}`);
      return { provider: adapter.providerKey, status: 'error', phones: [], emails: [] };
    }
  }

  private resolveAdapter(): SkipTraceAdapter {
    const requested = (process.env.SKIP_TRACE_PROVIDER || 'batch').toLowerCase() as SkipTraceProviderKey;
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

// Adapters declare a CostContext-aware `appendContacts` even though the
// interface signature is single-arg, so we cast through to forward ctx.
async function callAdapter(
  adapter: SkipTraceAdapter,
  input: SkipTraceInput,
  ctx: CostContext,
): Promise<SkipTraceResult> {
  const fn = adapter.appendContacts as (
    i: SkipTraceInput,
    c?: CostContext,
  ) => Promise<SkipTraceResult>;
  return fn.call(adapter, input, ctx);
}
