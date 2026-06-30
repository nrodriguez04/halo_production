import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  it('preserves forwarded worker actor context for internal calls', async () => {
    const service = {
      appendContacts: jest.fn().mockResolvedValue({
        provider: 'batch_skiptrace',
        status: 'matched',
        phones: [],
        emails: [],
      }),
    };

    const controller = new SkipTraceController(service as any);

    await controller.appendContacts(
      'tenant-1',
      undefined,
      'worker',
      {
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      },
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      {
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
        ownerName: undefined,
        ownerMailingAddress: undefined,
        city: 'Austin',
        state: 'TX',
        zip: '78701',
      },
      {
        accountId: 'tenant-1',
        actor: 'worker',
        userId: undefined,
        leadId: 'lead-1',
      },
    );
  });
});
