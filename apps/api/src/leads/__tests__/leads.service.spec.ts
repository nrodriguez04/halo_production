import { BadRequestException } from '@nestjs/common';
import { LeadsService } from '../leads.service';

describe('LeadsService.update', () => {
  let prisma: any;
  let timelineService: any;
  let service: LeadsService;

  beforeEach(() => {
    prisma = {
      lead: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    timelineService = {
      appendEvent: jest.fn(),
    };
    service = new LeadsService(prisma, timelineService);
  });

  it('rejects accountId changes through the generic update endpoint', async () => {
    await expect(
      service.update('lead_1', 'acct_1', { accountId: 'acct_2' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('rejects status changes through the generic update endpoint', async () => {
    await expect(
      service.update('lead_1', 'acct_1', { status: 'qualified' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('still allows non-lifecycle lead fields to be updated', async () => {
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead_1',
      accountId: 'acct_1',
      sourceRecords: [],
      properties: [],
      deals: [],
    });
    prisma.lead.update.mockResolvedValue({
      id: 'lead_1',
      canonicalPhone: '5551112222',
    });

    const result = await service.update('lead_1', 'acct_1', {
      canonicalPhone: '5551112222',
    } as any);

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead_1' },
      data: { canonicalPhone: '5551112222' },
    });
    expect(result).toEqual({
      id: 'lead_1',
      canonicalPhone: '5551112222',
    });
  });
});
