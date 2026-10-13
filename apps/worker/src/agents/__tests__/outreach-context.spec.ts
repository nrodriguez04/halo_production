const mockPrisma = {
  deal: { findFirst: jest.fn() },
  message: { findMany: jest.fn(), findFirst: jest.fn() },
  consent: { findMany: jest.fn() },
  dNCList: { findFirst: jest.fn() },
  account: { findUnique: jest.fn() },
};
jest.mock('../../prisma-client', () => ({ prisma: mockPrisma }));

import { loadOutreachContext } from '../outreach-context';

describe('loadOutreachContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.deal.findFirst.mockResolvedValue({
      id: 'deal-1',
      stage: 'marketing',
      arv: 172000,
      mao: 78400,
      offerAmount: 72000,
      createdAt: new Date('2026-10-04T16:00:00.000Z'),
      lead: {
        id: 'lead-1',
        status: 'qualified',
        score: 86,
        tags: [],
        canonicalOwner: 'M. Johnson',
        canonicalPhoneHash: 'phone-hash',
        canonicalEmailHash: 'email-hash',
      },
      property: {
        address: '2418 Pecan Grove Dr',
        city: 'Memphis',
        state: 'TN',
        zip: '38116',
      },
    });
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue(null);
    mockPrisma.consent.findMany.mockResolvedValue([]);
    mockPrisma.dNCList.findFirst.mockResolvedValue(null);
    mockPrisma.account.findUnique.mockResolvedValue({ name: 'Halo' });
  });

  it("reads only the seller's conversation, never buyer emails on the same deal", async () => {
    await loadOutreachContext({
      accountId: 'acct',
      entityType: 'deal',
      entityId: 'deal-1',
      trigger: 'inbound',
      messageId: 'msg-1',
    });
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountId: 'acct',
          OR: [
            { leadId: 'lead-1' },
            {
              dealId: 'deal-1',
              counterpartyHash: { in: ['phone-hash', 'email-hash'] },
            },
          ],
        },
      }),
    );
  });

  it('reads only the lead when the seller has no number or address on file', async () => {
    const deal = await mockPrisma.deal.findFirst();
    mockPrisma.deal.findFirst.mockResolvedValue({
      ...deal,
      lead: {
        ...deal.lead,
        canonicalPhoneHash: null,
        canonicalEmailHash: null,
      },
    });
    await loadOutreachContext({
      accountId: 'acct',
      entityType: 'deal',
      entityId: 'deal-1',
      trigger: 'sweep',
    });
    expect(mockPrisma.message.findMany.mock.calls[0][0].where).toEqual({
      accountId: 'acct',
      OR: [{ leadId: 'lead-1' }],
    });
  });
});
