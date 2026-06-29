import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  it('forwards worker actor context without a user id', async () => {
    const service = {
      appendContacts: jest.fn().mockResolvedValue({ status: 'matched' }),
    };
    const controller = new SkipTraceController(service as any);

    await controller.appendContacts(
      'tenant-1',
      undefined,
      { actor: 'worker' },
      {
        leadId: 'lead-1',
        propertyAddress: '123 Oak St',
      },
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        propertyAddress: '123 Oak St',
      }),
      {
        accountId: 'tenant-1',
        actor: 'worker',
        userId: undefined,
        leadId: 'lead-1',
      },
    );
  });

  it('defaults browser requests to the user actor', async () => {
    const service = {
      appendContacts: jest.fn().mockResolvedValue({ status: 'matched' }),
    };
    const controller = new SkipTraceController(service as any);

    await controller.appendContacts(
      'tenant-1',
      'user-1',
      { actor: 'user' },
      {
        leadId: 'lead-1',
        propertyAddress: '123 Oak St',
      },
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        propertyAddress: '123 Oak St',
      }),
      {
        accountId: 'tenant-1',
        actor: 'user',
        userId: 'user-1',
        leadId: 'lead-1',
      },
    );
  });
});
