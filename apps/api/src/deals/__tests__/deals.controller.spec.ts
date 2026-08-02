import { DealsController } from '../deals.controller';

describe('DealsController', () => {
  it('forces new stage on create', async () => {
    const dealsService = {
      create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
    };
    const controller = new DealsController(dealsService as any);

    await controller.create(
      {
        leadId: 'lead-1',
        stage: 'closed',
      },
      'tenant-1',
      'user-1',
    );

    expect(dealsService.create).toHaveBeenCalledTimes(1);
    expect(dealsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'tenant-1',
        leadId: 'lead-1',
        stage: 'new',
      }),
      'user-1',
    );
  });
});
