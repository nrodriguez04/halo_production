import { LeadsController } from '../leads.controller';

describe('LeadsController', () => {
  it('forces new status on create', async () => {
    const leadsService = {
      create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
    };
    const controller = new LeadsController(leadsService as any);

    await controller.create(
      {
        canonicalAddress: '123 Main St',
        status: 'qualified',
      },
      'tenant-1',
      'user-1',
    );

    expect(leadsService.create).toHaveBeenCalledTimes(1);
    expect(leadsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'tenant-1',
        canonicalAddress: '123 Main St',
        status: 'new',
        tags: [],
      }),
      'user-1',
    );
  });
});
