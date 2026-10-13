import { Injectable, Logger } from '@nestjs/common';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { IntegrationUnavailableException } from '../../integrations/integration-unavailable.exception';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import type {
  SkipTraceAdapter,
  SkipTraceHints,
  SkipTraceInput,
  SkipTraceResult,
} from '../dto/skip-trace.dto';

// BatchSkipTracing.com adapter (https://www.batchskiptracing.com/api). Posts
// a single record and reads back phones + emails. We treat each call as
// `per_record` pricing at the seed-configured unit cost.
//
// Selected via `SKIP_TRACE_PROVIDER=batch` (the default in production). The
// key is resolved at call time from the Integrations page, falling back to
// BATCH_SKIPTRACE_API_KEY in the environment.

interface BatchResponse {
  record_id?: string;
  status?: string;
  phones?: Array<{ phone: string; phone_type?: string; dnc?: boolean }>;
  emails?: Array<{ email: string }>;
}

@Injectable()
export class BatchSkipTraceAdapter implements SkipTraceAdapter {
  readonly providerKey = 'batch_skiptrace';
  private readonly logger = new Logger(BatchSkipTraceAdapter.name);
  private readonly baseUrl =
    process.env.BATCH_SKIPTRACE_BASE_URL ||
    'https://api.batchskiptracing.com/v2';

  constructor(
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  async appendContacts(
    input: SkipTraceInput,
    ctx?: CostContext,
    hints?: SkipTraceHints,
  ): Promise<SkipTraceResult> {
    // Checked before checkAndCall so a missing key neither reserves budget
    // nor hides as an "error" result: enrichment records it as not
    // configured, which is what the operator needs to see.
    const apiKey = await this.secrets.resolve(
      this.providerKey,
      'BATCH_SKIPTRACE_API_KEY',
    );
    if (!apiKey?.trim()) {
      throw IntegrationUnavailableException.notConfigured(
        this.providerKey,
        'BATCH_SKIPTRACE_API_KEY',
      );
    }
    if (!ctx) {
      throw new Error('BatchSkipTraceAdapter requires a CostContext');
    }

    const out = await this.costControl.checkAndCall<
      SkipTraceInput,
      BatchResponse
    >({
      provider: this.providerKey,
      action: 'append_contacts',
      payload: input,
      context: ctx,
      hints: { ...hints, idempotencyKey: `skip:batch:${input.leadId}` },
      execute: async () => {
        const res = await fetch(`${this.baseUrl}/skip-tracing`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                address: {
                  street: input.propertyAddress,
                  city: input.city,
                  state: input.state,
                  zip: input.zip,
                },
                owner_name: input.ownerName,
              },
            ],
          }),
        });
        if (res.status === 401 || res.status === 403) {
          throw new IntegrationUnavailableException(
            this.providerKey,
            'REJECTED_CREDENTIALS',
            `BatchSkipTracing rejected the key (${res.status})`,
          );
        }
        if (!res.ok) {
          throw new Error(
            `Batch skip-trace failed: ${res.status} ${res.statusText}`,
          );
        }
        const json = (await res.json()) as { results?: BatchResponse[] };
        return json.results?.[0] ?? {};
      },
    });

    if (!out.result) {
      return {
        provider: this.providerKey,
        status: 'error',
        phones: [],
        emails: [],
      };
    }

    const data = out.result;
    if (!data.phones?.length && !data.emails?.length) {
      return {
        provider: this.providerKey,
        status: 'no_match',
        phones: [],
        emails: [],
        raw: data,
      };
    }
    return {
      provider: this.providerKey,
      status: 'matched',
      phones: (data.phones ?? []).map((p) => ({
        number: p.phone,
        type: normalizePhoneType(p.phone_type),
        isDnc: !!p.dnc,
      })),
      emails: (data.emails ?? []).map((e) => ({ email: e.email })),
      raw: data,
      costUsd: out.actualCostUsd,
    };
  }
}

function normalizePhoneType(
  t: string | undefined,
): 'mobile' | 'landline' | 'voip' | 'unknown' {
  switch ((t ?? '').toLowerCase()) {
    case 'mobile':
    case 'wireless':
      return 'mobile';
    case 'landline':
    case 'fixedline':
      return 'landline';
    case 'voip':
      return 'voip';
    default:
      return 'unknown';
  }
}
