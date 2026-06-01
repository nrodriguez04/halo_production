import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  it('forwards the worker actor for internal service requests', async () => {
    const service = {
      appendContacts: jest.fn().mockResolvedValue({ status: 'no_match' }),
    };
    const controller = new SkipTraceController(service as any);

    await controller.appendContacts(
      'acc_1',
      undefined,
      {
        leadId: 'lead_1',
        propertyAddress: '1 Main St',
      },
      { authActor: 'worker' } as any,
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      {
        leadId: 'lead_1',
        propertyAddress: '1 Main St',
        ownerName: undefined,
        ownerMailingAddress: undefined,
        city: undefined,
        state: undefined,
        zip: undefined,
      },
      {
        accountId: 'acc_1',
        actor: 'worker',
        leadId: 'lead_1',
      },
    );
  });
});
