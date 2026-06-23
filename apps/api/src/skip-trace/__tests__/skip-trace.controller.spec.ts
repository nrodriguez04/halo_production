import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  it('forwards the authenticated actor into cost-control context', async () => {
    const appendContacts = jest.fn().mockResolvedValue({
      provider: 'batch_skiptrace',
      status: 'ok',
      phones: [],
      emails: [],
    });
    const controller = new SkipTraceController({
      appendContacts,
    } as any);

    await controller.appendContacts(
      'tenant-1',
      'worker',
      'worker',
      {
        leadId: 'lead-1',
        propertyAddress: '1 Main St',
      },
    );

    expect(appendContacts).toHaveBeenCalledWith(
      {
        leadId: 'lead-1',
        propertyAddress: '1 Main St',
        ownerName: undefined,
        ownerMailingAddress: undefined,
        city: undefined,
        state: undefined,
        zip: undefined,
      },
      {
        accountId: 'tenant-1',
        actor: 'worker',
        userId: 'worker',
        leadId: 'lead-1',
      },
    );
  });
});
