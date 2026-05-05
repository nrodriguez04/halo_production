import { Injectable, Logger } from '@nestjs/common';
import { PropertyRadarService } from '../../integrations/propertyradar/propertyradar.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import type {
  SkipTraceAdapter,
  SkipTraceInput,
  SkipTraceResult,
} from '../dto/skip-trace.dto';

// PropertyRadar skip-trace adapter. Uses the existing PropertyRadarService
// (which routes through `checkAndCall`) so re-enabling this provider only
// requires flipping `integration_providers.enabled` for `propertyradar`.
// Disabled by default (cost-control returns BLOCK_FEATURE_DISABLED) until
// the operator opts in.

@Injectable()
export class PropertyRadarSkipTraceAdapter implements SkipTraceAdapter {
  readonly providerKey = 'propertyradar';
  private readonly logger = new Logger(PropertyRadarSkipTraceAdapter.name);

  constructor(private propertyRadar: PropertyRadarService) {}

  async appendContacts(input: SkipTraceInput, ctx?: CostContext): Promise<SkipTraceResult> {
    if (!ctx) {
      throw new Error('PropertyRadarSkipTraceAdapter requires a CostContext');
    }

    // Two-step PropertyRadar flow: import to obtain RadarID, then append
    // contacts. Both steps go through PropertyRadarService.* which checks
    // budget and records cost events for each.
    const importResult = await this.propertyRadar.importRecords(
      [
        {
          Address: input.propertyAddress,
          City: input.city,
          State: input.state,
          Zip: input.zip,
        },
      ],
      ctx,
    );
    const importData = importResult?.data as { Results?: Array<{ RadarID?: string }> } | null;
    const radarId = importData?.Results?.[0]?.RadarID;
    if (!radarId) {
      return { provider: this.providerKey, status: 'no_match', phones: [], emails: [] };
    }

    const contactResult = await this.propertyRadar.appendContacts(radarId, ctx);
    const contactData = contactResult?.data;
    if (!contactData) {
      return { provider: this.providerKey, status: 'error', phones: [], emails: [] };
    }
    const phones = (contactData.Phones ?? []).map((p) => ({
      number: p.Number,
      type: normalizeType(p.Type),
      confidence: typeof p.Score === 'number' ? p.Score / 100 : undefined,
    }));
    const emails = (contactData.Emails ?? []).map((e) => ({
      email: e.Address,
      confidence: typeof e.Score === 'number' ? e.Score / 100 : undefined,
    }));
    return {
      provider: this.providerKey,
      status: phones.length || emails.length ? 'matched' : 'no_match',
      phones,
      emails,
      raw: contactData,
    };
  }
}

function normalizeType(t: string | undefined): 'mobile' | 'landline' | 'voip' | 'unknown' {
  switch ((t ?? '').toLowerCase()) {
    case 'mobile':
    case 'cell':
      return 'mobile';
    case 'landline':
    case 'home':
      return 'landline';
    case 'voip':
      return 'voip';
    default:
      return 'unknown';
  }
}
