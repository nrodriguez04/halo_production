import { LeadsService } from '../leads.service';

describe('LeadsService.importCSV', () => {
  it('falls back to row-level inserts when bulk create fails', async () => {
    const prisma: any = {
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest
          .fn()
          .mockRejectedValueOnce(new Error('invalid byte sequence')),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'lead_1' })
          .mockRejectedValueOnce(new Error('invalid byte sequence')),
      },
    };
    const timelineService: any = { appendEvent: jest.fn() };
    const service = new LeadsService(prisma, timelineService);

    const result = await service.importCSV(
      [
        { address: '100 Good St', city: 'Austin', state: 'TX', zip: '78701' },
        { address: '200 Bad St', city: 'Austin', state: 'TX', zip: '78702' },
      ],
      'acc_1',
      'user_1',
    );

    expect(prisma.lead.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.lead.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      created: 1,
      duplicates: 0,
      errors: ['Row 200 Bad St: invalid byte sequence'],
    });
  });
});
