/**
 * The conversion funnel's queries on a real database (docs/data-pipeline.md
 * s5.1): leads by source and state, reachability net of the do-not-contact
 * list, messages both ways, offers, executed contracts, closings with fees,
 * and provider costs per lead. Everything is SYNTHETIC.
 */
import { randomUUID } from 'crypto';
import type { TestingModule } from '@nestjs/testing';
import { buildModule, describeDb, fixtures } from './harness';
import type { SpendInput } from '@halo/shared';
import { PrismaService } from '../../src/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { FunnelService } from '../../src/analytics/funnel.service';
import { MarketingSpendService } from '../../src/analytics/marketing-spend.service';

describeDb('conversion funnel (synthetic, real database)', () => {
  let moduleRef: TestingModule;
  let fx: ReturnType<typeof fixtures>;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await buildModule();
    fx = fixtures(moduleRef);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.integrationCostEvent.deleteMany({
      where: { action: 'synthetic_funnel' },
    });
    await fx.cleanup();
    await moduleRef?.close();
  });

  it('follows each lead from sourcing to a realized fee, with its cost', async () => {
    const accountId = await fx.tenant();
    const lead = (tags: string[], hash: string | null, state = 'TX') =>
      prisma.lead.create({
        data: {
          accountId,
          tags,
          canonicalState: state,
          canonicalPhoneHash: hash,
        },
      });

    const silent = await lead(['source:csv_import'], null);
    const suppressed = await lead(['source:csv_import'], `syn-${randomUUID()}`);
    await prisma.dNCList.create({
      data: {
        accountId,
        phoneHash: suppressed.canonicalPhoneHash,
        source: 'manual',
      },
    });
    const talked = await lead(
      ['source:mls_expired'],
      `syn-${randomUUID()}`,
      'AZ',
    );
    const closed = await lead(['source:csv_import'], `syn-${randomUUID()}`);

    const message = (leadId: string, direction: string, status: string) =>
      prisma.message.create({
        data: {
          accountId,
          leadId,
          channel: 'sms',
          direction,
          status,
          content: 'SYNTHETIC',
        },
      });
    await message(talked.id, 'outbound', 'delivered');
    await message(talked.id, 'inbound', 'received');
    await message(closed.id, 'outbound', 'sent');
    await message(silent.id, 'outbound', 'failed');

    const deal = await prisma.deal.create({
      data: {
        accountId,
        leadId: closed.id,
        stage: 'closed',
        offerAmount: 120_000,
      },
    });
    await prisma.purchaseAgreement.create({
      data: {
        accountId,
        dealId: deal.id,
        status: 'executed',
        executedAt: new Date(),
      },
    });
    await prisma.closingFile.create({
      data: {
        accountId,
        dealId: deal.id,
        status: 'closed',
        closedAt: new Date(),
        realizedFee: 11_500,
      },
    });

    const provider = await prisma.integrationProvider.upsert({
      where: { key: 'attom' },
      create: { key: 'attom', displayName: 'ATTOM', category: 'property_data' },
      update: {},
    });
    const spend = (leadId: string | null, usd: number) =>
      prisma.integrationCostEvent.create({
        data: {
          accountId,
          providerId: provider.id,
          providerKey: 'attom',
          action: 'synthetic_funnel',
          reservationId: randomUUID(),
          estimatedCostUsd: usd,
          actualCostUsd: usd,
          status: 'completed',
          decision: 'allow',
          actor: 'system',
          bucketIds: [],
          leadId,
        },
      });
    await spend(closed.id, 0.2);
    await spend(talked.id, 0.1);
    await spend(null, 1.0);

    const out = await new FunnelService(prisma).funnel(accountId, {});
    expect(out.total.counts).toEqual({
      leads: 4,
      reachable: 2,
      contacted: 2,
      conversations: 2,
      offers: 1,
      contracts: 1,
      assignments: 0,
      closed: 1,
    });
    expect(out.total).toMatchObject({ realizedFees: 11_500, costUsd: 0.3 });
    expect(out.unattributedCostUsd).toBe(1);
    expect(
      out.bySource.map((r) => [r.key, r.counts.leads, r.counts.closed]),
    ).toEqual([
      ['csv_import', 3, 1],
      ['mls_expired', 1, 0],
    ]);
    expect(out.byState.map((r) => r.key)).toEqual(['TX', 'AZ']);
    expect(out.stages[0]).toMatchObject({ key: 'leads', rateBase: null });
    expect(out.spend).toEqual({
      totalUsd: 0,
      withoutSourceUsd: 0,
      withoutStateUsd: 0,
    });
  });

  it('counts entered spend as cost, by the source and state it names, and audits it', async () => {
    const accountId = await fx.tenant();
    const audit = moduleRef.get(AuditService);
    const spendService = new MarketingSpendService(prisma, audit);
    await prisma.lead.create({
      data: {
        accountId,
        tags: ['source:direct_mail_q4'],
        canonicalState: 'TX',
      },
    });
    const today = new Date().toISOString().slice(0, 10);
    const entry = (over: Partial<SpendInput>): SpendInput => ({
      spentOn: today,
      category: 'direct_mail',
      amountUsd: 100,
      source: null,
      state: null,
      vendor: null,
      note: 'SYNTHETIC',
      ...over,
    });
    await spendService.add(
      accountId,
      'syn-user',
      entry({ amountUsd: 900, source: 'direct_mail_q4', state: 'TX' }),
    );
    await spendService.add(
      accountId,
      'syn-user',
      entry({
        category: 'lists',
        amountUsd: 250,
        source: 'bought_list',
        state: 'AZ',
      }),
    );
    const software = await spendService.add(
      accountId,
      'syn-user',
      entry({ category: 'software', amountUsd: 50 }),
    );
    await expect(
      spendService.add(accountId, 'syn-user', entry({ spentOn: '2099-01-01' })),
    ).rejects.toThrow(/day it was paid/);

    const out = await new FunnelService(prisma).funnel(accountId, {});
    expect(out.total).toMatchObject({
      costUsd: 1200,
      spendUsd: 1200,
      providerCostUsd: 0,
    });
    expect(out.spend).toEqual({
      totalUsd: 1200,
      withoutSourceUsd: 50,
      withoutStateUsd: 50,
    });
    expect(
      out.bySource.map((r) => [
        r.key,
        r.counts.leads,
        r.costUsd,
        r.costPerLead,
      ]),
    ).toEqual([
      ['direct_mail_q4', 1, 900, 900],
      ['bought_list', 0, 250, null],
    ]);
    expect(out.byState.map((r) => [r.key, r.costUsd])).toEqual([
      ['TX', 900],
      ['AZ', 250],
    ]);

    // Another tenant's entry can be neither seen nor removed.
    const other = await fx.tenant();
    expect(
      await spendService.list(other, {
        from: new Date(0),
        to: new Date(Date.now() + 86_400_000),
      }),
    ).toEqual([]);
    await expect(
      spendService.remove(other, 'syn-user', software.id),
    ).rejects.toThrow(/No such spend/);

    await spendService.remove(accountId, 'syn-user', software.id);
    const after = await new FunnelService(prisma).funnel(accountId, {});
    expect(after.total.costUsd).toBe(1150);
    const trail = await prisma.auditLog.findMany({
      where: { accountId, action: { startsWith: 'analytics.spend.' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(trail.map((t) => t.action)).toEqual([
      'analytics.spend.add',
      'analytics.spend.add',
      'analytics.spend.add',
      'analytics.spend.remove',
    ]);
    expect(trail[3].details).toMatchObject({
      category: 'software',
      amountUsd: 50,
    });
  });
});
