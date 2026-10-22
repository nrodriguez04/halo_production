import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { propertyFromRegrid, type NormalizedProperty } from '@halo/shared';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';

/**
 * Regrid parcel data (docs/data-pipeline.md s3): standardized county
 * assessor records for parcels nationwide, by address. Cost-governed like
 * every paid provider; the raw response is kept as a SourceRecord.
 *
 * Built against Regrid's v2 parcel API. It has not been run against a live
 * Regrid account: set REGRID_API_TOKEN (Integrations page or env) and try
 * one lookup before relying on it.
 */
@Injectable()
export class RegridService {
  private readonly logger = new Logger(RegridService.name);
  private readonly baseUrl =
    process.env.REGRID_BASE_URL || 'https://app.regrid.com/api/v2';

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  private token(): Promise<string | null> {
    return this.secrets.resolve('regrid', 'REGRID_API_TOKEN');
  }

  async configured(): Promise<boolean> {
    return !!(await this.token());
  }

  /** The parcel at an address, normalized; null when Regrid has none. */
  async parcelByAddress(
    q: { address: string; state?: string | null },
    ctx: CostContext,
  ): Promise<{
    property: NormalizedProperty | null;
    costUsd: number;
    cached: boolean;
  }> {
    if (!(await this.controlPlane.isExternalDataEnabled(ctx.accountId))) {
      throw IntegrationUnavailableException.disabled('regrid');
    }
    const token = await this.token();
    if (!token)
      throw IntegrationUnavailableException.notConfigured(
        'regrid',
        'REGRID_API_TOKEN',
      );
    const params: Record<string, string> = { query: q.address, limit: '1' };
    if (q.state) params.path = `/us/${q.state.toLowerCase()}`;
    const out = await this.costControl.checkAndCall<
      Record<string, string>,
      unknown
    >({
      provider: 'regrid',
      action: 'parcel_lookup',
      payload: params,
      context: ctx,
      hints: {
        idempotencyKey: `regrid:address:${crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex').slice(0, 16)}`,
      },
      execute: async () => {
        const url = `${this.baseUrl}/parcels/address`;
        const res = await fetch(
          `${url}?${new URLSearchParams({ ...params, token })}`,
          {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (res.status === 401 || res.status === 403) {
          throw new IntegrationUnavailableException(
            'regrid',
            'REJECTED_CREDENTIALS',
            `HTTP ${res.status}`,
          );
        }
        if (res.status === 404) return { parcels: { features: [] } };
        if (!res.ok) throw new Error(`Regrid answered ${res.status}`);
        const data = (await res.json()) as unknown;
        await this.prisma.sourceRecord.create({
          data: {
            provider: 'regrid',
            endpoint: url,
            requestHash: crypto
              .createHash('sha256')
              .update(JSON.stringify(params))
              .digest('hex'),
            response: data as object,
            trustWeight: 0.9,
          },
        });
        return data;
      },
    });
    return {
      property: propertyFromRegrid(out.result),
      costUsd: out.actualCostUsd,
      cached: out.fromCache,
    };
  }
}
