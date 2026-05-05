import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

// Looks up the unit cost per (provider, action) and computes an estimate
// for a specific payload. Pricing rules live in `provider_pricing_rules`
// and can be updated without a deploy. We cache them in memory for 60s
// since they change rarely.

interface PricingRule {
  id: string;
  providerId: string;
  providerKey: string;
  action: string;
  unitCostUsd: number;
  unit: string; // 'per_call' | 'per_1k_input_tokens' | 'per_1k_output_tokens' | 'per_record' | 'per_segment'
  pricePer: number;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private cache: { rules: PricingRule[]; expiresAt: number } = { rules: [], expiresAt: 0 };

  constructor(private prisma: PrismaService) {}

  async estimate(provider: string, action: string, payload: unknown): Promise<number> {
    const rules = await this.lookupRules(provider, action);
    if (rules.length === 0) return 0;

    const meta = (payload as Record<string, unknown> | undefined) ?? {};

    let total = 0;
    for (const rule of rules) {
      const units = unitsForRule(rule.unit, meta);
      total += (units / rule.pricePer) * rule.unitCostUsd;
    }
    return total;
  }

  async getRulesForProvider(providerKey: string): Promise<PricingRule[]> {
    const all = await this.allRules();
    return all.filter((r) => r.providerKey === providerKey);
  }

  private async lookupRules(provider: string, action: string): Promise<PricingRule[]> {
    const all = await this.allRules();
    return all.filter((r) => r.providerKey === provider && r.action === action);
  }

  private async allRules(): Promise<PricingRule[]> {
    if (this.cache.expiresAt > Date.now()) return this.cache.rules;
    try {
      const rows = await this.prisma.providerPricingRule.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        include: { provider: { select: { key: true } } },
      });
      const rules: PricingRule[] = rows.map((r) => ({
        id: r.id,
        providerId: r.providerId,
        providerKey: r.provider.key,
        action: r.action,
        unitCostUsd: r.unitCostUsd,
        unit: r.unit,
        pricePer: r.pricePer,
      }));
      this.cache = { rules, expiresAt: Date.now() + 60_000 };
      return rules;
    } catch (err) {
      this.logger.warn(`pricing lookup failed, returning empty: ${err}`);
      return [];
    }
  }

  invalidateCache() {
    this.cache = { rules: [], expiresAt: 0 };
  }
}

function unitsForRule(unit: string, meta: Record<string, unknown>): number {
  switch (unit) {
    case 'per_call':
      return 1;
    case 'per_1k_input_tokens':
      return ((meta.tokensIn as number) ?? 0) / 1000;
    case 'per_1k_output_tokens':
      return ((meta.tokensOut as number) ?? 0) / 1000;
    case 'per_record':
      return (meta.recordCount as number) ?? 1;
    case 'per_segment':
      return (meta.segmentCount as number) ?? 1;
    default:
      return 1;
  }
}
