import { HttpStatus } from '@nestjs/common';
import { LeadSkipTraceService } from '../lead-skip-trace.service';
import { SkipTraceService } from '../skip-trace.service';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { CostBlockedException } from '../../cost-control/cost-blocked.exception';

describe('LeadSkipTraceService (worker path)', () => {
  let prisma: { lead: { findFirst: jest.Mock; updateMany: jest.Mock } };

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(() => {
    prisma = {
      lead: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lead-1',
          canonicalAddress: '1 Main St',
          canonicalCity: 'Austin',
          canonicalState: 'TX',
          canonicalZip: '78701',
          canonicalOwner: 'Jane Seller',
          score: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  });

  const build = (skipTrace: Partial<SkipTraceService>) =>
    new LeadSkipTraceService(
      prisma as any,
      skipTrace as SkipTraceService,
      new LeadPiiService(),
    );

  it("traces from the lead's own address with the score gate and pipeline budget", async () => {
    const appendContacts = jest.fn().mockResolvedValue({
      provider: 'batch_skiptrace',
      status: 'no_match',
      phones: [],
      emails: [],
    });

    await build({ appendContacts }).traceLead({
      accountId: 'tenant-1',
      leadId: 'lead-1',
      actor: 'system',
      automated: true,
    });

    expect(appendContacts).toHaveBeenCalledWith(
      {
        leadId: 'lead-1',
        propertyAddress: '1 Main St',
        ownerName: 'Jane Seller',
        ownerMailingAddress: undefined,
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      },
      {
        accountId: 'tenant-1',
        actor: 'system',
        userId: undefined,
        leadId: 'lead-1',
      },
      // An unscored lead counts as 0, below the skip-trace threshold.
      { leadScore: 0, workflow: 'skip_trace_pipeline' },
    );
  });

  it('lets a cost-control block reach the worker as a 429', async () => {
    const appendContacts = jest
      .fn()
      .mockRejectedValue(
        new CostBlockedException(
          { kind: 'BLOCK_LOW_LEAD_SCORE', leadScore: 0, threshold: 60 },
          'batch_skiptrace',
          'append_contacts',
        ),
      );

    const err = await build({ appendContacts })
      .traceLead({
        accountId: 'tenant-1',
        leadId: 'lead-1',
        actor: 'system',
        automated: true,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(CostBlockedException);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('skips a lead with no address without calling a provider', async () => {
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      canonicalAddress: null,
      score: 90,
    });
    const appendContacts = jest.fn();

    const out = await build({ appendContacts }).traceLead({
      accountId: 'tenant-1',
      leadId: 'lead-1',
      actor: 'system',
      automated: true,
    });

    expect(out).toEqual(
      expect.objectContaining({ status: 'skipped', reason: 'no_address' }),
    );
    expect(appendContacts).not.toHaveBeenCalled();
  });
});

describe('SkipTraceService errors', () => {
  beforeEach(() => {
    delete process.env.SKIP_TRACE_PROVIDER;
  });

  it('rethrows cost-control blocks instead of reporting them as provider errors', async () => {
    const blocked = new CostBlockedException(
      {
        kind: 'BLOCK_OVER_BUDGET',
        bucket: 'provider/batch_skiptrace',
        spent: 250,
        cap: 250,
      },
      'batch_skiptrace',
      'append_contacts',
    );
    const batch = {
      providerKey: 'batch_skiptrace',
      appendContacts: jest.fn().mockRejectedValue(blocked),
    };
    const service = new SkipTraceService(batch as any, {} as any, {} as any);

    await expect(
      service.appendContacts(
        { leadId: 'l', propertyAddress: 'a' },
        { accountId: 't', actor: 'system' },
      ),
    ).rejects.toBe(blocked);
  });

  it('still reports an unexpected provider failure as status error', async () => {
    const batch = {
      providerKey: 'batch_skiptrace',
      appendContacts: jest.fn().mockRejectedValue(new Error('socket hang up')),
    };
    const service = new SkipTraceService(batch as any, {} as any, {} as any);

    await expect(
      service.appendContacts(
        { leadId: 'l', propertyAddress: 'a' },
        { accountId: 't', actor: 'system' },
      ),
    ).resolves.toEqual({
      provider: 'batch_skiptrace',
      status: 'error',
      phones: [],
      emails: [],
    });
  });
});
