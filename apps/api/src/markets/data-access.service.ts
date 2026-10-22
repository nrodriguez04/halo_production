import { Injectable } from '@nestjs/common';
import { JURISDICTION_CODES, toJurisdictionCode } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { IntegrationSecretsService } from '../integration-secrets/integration-secrets.service';

/** Property-data providers whose coverage is national. */
const NATIONWIDE_PROVIDERS = [
  { provider: 'attom', keyName: 'ATTOM_API_KEY', label: 'ATTOM' },
  {
    provider: 'realie',
    keyName: 'REALIE_API_KEY',
    label: 'Realie (county records)',
  },
  { provider: 'rentcast', keyName: 'RENTCAST_API_KEY', label: 'RentCast' },
  {
    provider: 'regrid',
    keyName: 'REGRID_API_TOKEN',
    label: 'Regrid (parcels)',
  },
] as const;

export interface DataAccess {
  /** Providers configured with a key, by label. */
  providers: string[];
  /** Jurisdictions Halo can pull property data for. */
  states: Set<string>;
  /** Whether the tenant's control plane allows external data calls. */
  externalDataEnabled: boolean;
}

/**
 * Where Halo can research properties: research coverage, one of the three
 * market measures (docs/markets.md s2). A nationwide provider with a key
 * covers every jurisdiction; otherwise a jurisdiction is covered when a
 * sourcing market pulls from it.
 */
@Injectable()
export class DataAccessService {
  constructor(
    private prisma: PrismaService,
    private secrets: IntegrationSecretsService,
  ) {}

  async forAccount(accountId: string): Promise<DataAccess> {
    const configured: string[] = [];
    for (const p of NATIONWIDE_PROVIDERS) {
      if (await this.secrets.resolve(p.provider, p.keyName))
        configured.push(p.label);
    }
    const states = new Set<string>(configured.length ? JURISDICTION_CODES : []);
    const markets = await this.prisma.sourcingMarket.findMany({
      where: { accountId },
      select: { state: true },
    });
    for (const m of markets) {
      const code = toJurisdictionCode(m.state);
      if (code) states.add(code);
    }
    const cp = await this.prisma.controlPlane.findUnique({
      where: { accountId },
      select: { externalDataEnabled: true },
    });
    return {
      providers: configured,
      states,
      externalDataEnabled: !!cp?.externalDataEnabled,
    };
  }
}
