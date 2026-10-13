import { ComplianceBlockedException } from '../compliance-blocked.exception';
import {
  DisclosureGateService,
  EQUITABLE_INTEREST_TAG,
  normalizeState,
} from '../disclosure-gate.service';

describe('DisclosureGateService', () => {
  const prisma = {
    deal: { findFirst: jest.fn() },
    document: { findFirst: jest.fn() },
  };
  const service = () => new DisclosureGateService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes state names and codes', () => {
    expect(normalizeState(' tx ')).toBe('TX');
    expect(normalizeState('Texas')).toBe('TX');
    expect(normalizeState('TN')).toBe('TN');
    expect(normalizeState('')).toBeNull();
  });

  it('does not apply outside Texas', async () => {
    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal-1',
      leadId: 'lead-1',
      property: { state: 'TN' },
      lead: null,
    });
    await expect(
      service().equitableInterest('acct', 'deal-1'),
    ).resolves.toEqual({
      required: false,
      satisfied: true,
      state: 'TN',
    });
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });

  it('requires an active disclosure on the deal or its lead in Texas', async () => {
    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal-1',
      leadId: 'lead-1',
      property: null,
      lead: { canonicalState: 'Texas' },
    });
    prisma.document.findFirst.mockResolvedValue({ id: 'doc-9' });

    await expect(
      service().equitableInterest('acct', 'deal-1'),
    ).resolves.toEqual({
      required: true,
      satisfied: true,
      state: 'TX',
      documentId: 'doc-9',
    });
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId: 'acct',
          status: 'active',
          tags: { has: EQUITABLE_INTEREST_TAG },
          OR: [{ dealId: 'deal-1' }, { leadId: 'lead-1' }],
        },
      }),
    );
  });

  it('blocks with a 403 compliance error that says how to fix it when the notice is missing', async () => {
    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal-1',
      leadId: null,
      property: { state: 'TX' },
      lead: null,
    });
    prisma.document.findFirst.mockResolvedValue(null);

    const err = await service()
      .assertEquitableInterest(
        'acct',
        'deal-1',
        'marketing this deal to buyers',
      )
      .catch((e) => e);

    expect(err).toBeInstanceOf(ComplianceBlockedException);
    expect(err.getStatus()).toBe(403);
    expect(err.reason).toBe('TX_EQUITABLE_INTEREST_DISCLOSURE');
    expect(err.message).toContain('marketing this deal to buyers');
    expect(err.message).toContain('Equitable interest disclosure (Texas)');
    expect(prisma.document.findFirst.mock.calls[0][0].where.OR).toEqual([
      { dealId: 'deal-1' },
    ]);
  });

  it('lets an unknown deal through so the caller reports its own not-found', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(
      service().assertEquitableInterest('acct', 'missing', 'x'),
    ).resolves.toMatchObject({ required: false });
  });
});
