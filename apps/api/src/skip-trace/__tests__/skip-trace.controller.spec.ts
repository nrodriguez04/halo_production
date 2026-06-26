import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  it('forwards internal worker actor context to the service', async () => {
    const service = {
      appendContacts: jest.fn().mockResolvedValue({
        provider: 'batch_skiptrace',
        status: 'ok',
        phones: [],
        emails: [],
      }),
    };
    const controller = new SkipTraceController(service as any);

    await controller.appendContacts(
      'tenant-1',
      'worker',
      { actor: 'worker', userId: 'worker' },
      {
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
      },
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
      }),
      expect.objectContaining({
        accountId: 'tenant-1',
        actor: 'worker',
        userId: 'worker',
        leadId: 'lead-1',
      }),
    );
  });
});
