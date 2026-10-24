/**
 * The conversion funnel's queries on a real database (docs/data-pipeline.md
 * s5.1): leads by source and state, reachability net of the do-not-contact
 * list, messages both ways, offers, executed contracts, closings with fees,
 * and provider costs per lead. Everything is SYNTHETIC.
 */
import { randomUUID } from 'crypto';
import type { TestingModule } from '@nestjs/testing';
import { buildModule, describeDb, fixtures } from './harness';
import { PrismaService } from '../../src/prisma.service';
import { FunnelService } from '../../src/analytics/funnel.service';

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
    const unlinked = await spend(null, 1.0);

    // Use fixture timestamps rather than the API's default `now` cutoff.
    // Postgres creates these timestamps and its clock may differ slightly
    // from the CI runner's clock, excluding the last inserted cost event.
    const from = new Date(silent.createdAt.getTime() - 60_000);
    const to = new Date(unlinked.createdAt.getTime() + 60_000);
    const out = await new FunnelService(prisma).funnel(accountId, { from, to });
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
  });
});
