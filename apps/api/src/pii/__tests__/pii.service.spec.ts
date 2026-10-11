import { PIIService } from '../pii.service';
import { protectContact } from '../../leads/lead-pii';
import { protectBuyerContact } from '../../buyers/buyer-pii';
import { piiViewer } from '../../auth/pii-access';

describe('PIIService presentation', () => {
  let prisma: { auditLog: { create: jest.Mock } };
  let service: PIIService;

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    service = new PIIService(prisma as any);
  });

  const lead = (id: string) => ({
    id,
    canonicalOwner: 'Jane Seller',
    ...protectContact({ phone: '+15125550100', email: 'seller@example.com' }),
  });
  const permitted = piiViewer({
    accountId: 'tenant-1',
    userId: 'user-1',
    permissions: ['pii:read'],
  });
  const unpermitted = piiViewer({
    accountId: 'tenant-1',
    userId: 'user-2',
    permissions: [],
    roles: ['Member'],
  });

  it('masks for a viewer without pii:read and writes no audit row', async () => {
    const out = await service.presentLead(lead('lead-1'), unpermitted);

    expect(out.canonicalPhone).toBe('••• ••• 0100');
    expect(out.canonicalEmail).toBe('s•••@example.com');
    expect(out).not.toHaveProperty('canonicalPhoneEnc');
    expect(out).not.toHaveProperty('canonicalPhoneHash');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('masks when there is no viewer at all', async () => {
    const out = await service.presentLead(lead('lead-1'));
    expect(out.canonicalPhone).toBe('••• ••• 0100');
  });

  it('reveals to a pii:read viewer and audits who saw what', async () => {
    const out = await service.presentLead(lead('lead-1'), permitted);

    expect(out.canonicalPhone).toBe('+15125550100');
    expect(out.canonicalEmail).toBe('seller@example.com');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        accountId: 'tenant-1',
        userId: 'user-1',
        action: 'pii.reveal',
        resource: 'lead:lead-1',
        details: { ids: ['lead-1'], fields: ['phone', 'email'], count: 1 },
      },
    });
  });

  it('audits a list reveal once', async () => {
    const out = await service.presentLeads(
      [lead('lead-1'), lead('lead-2')],
      permitted,
    );

    expect(out.map((l) => l.canonicalPhone)).toEqual([
      '+15125550100',
      '+15125550100',
    ]);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        resource: 'lead',
        details: {
          ids: ['lead-1', 'lead-2'],
          fields: ['phone', 'email'],
          count: 2,
        },
      }),
    );
  });

  it('fails closed: no audit row, no reveal', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('audit table down'));

    const out = await service.presentLead(lead('lead-1'), permitted);

    expect(out.canonicalPhone).toBe('••• ••• 0100');
    expect(out.canonicalEmail).toBe('s•••@example.com');
  });

  it('does not audit rows that carry no contact', async () => {
    const out = await service.presentLead({ id: 'lead-3' } as any, permitted);
    expect(out.canonicalPhone).toBeNull();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('presents buyers the same way', async () => {
    const buyer = {
      id: 'buyer-1',
      name: 'Acme Holdings',
      ...protectBuyerContact({
        email: 'deals@acme.example',
        phone: '+15125550199',
      }),
    };

    const masked = await service.presentBuyer(buyer, unpermitted);
    expect(masked).toEqual({
      id: 'buyer-1',
      name: 'Acme Holdings',
      email: 'd•••@acme.example',
      phone: '••• ••• 0199',
    });

    const revealed = await service.presentBuyer(buyer, permitted);
    expect(revealed.email).toBe('deals@acme.example');
    expect(prisma.auditLog.create.mock.calls[0][0].data.resource).toBe(
      'buyer:buyer-1',
    );
  });
});
