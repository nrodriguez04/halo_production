import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  it('marks internal-token requests as worker-driven cost events', async () => {
    const service = { appendContacts: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new SkipTraceController(service as any);

    await controller.appendContacts(
      'acc_1',
      undefined,
      { authType: 'internal' },
      {
        leadId: 'lead_1',
        propertyAddress: '1 Main St',
      },
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
      expect.objectContaining({
        accountId: 'acc_1',
        actor: 'worker',
        leadId: 'lead_1',
      }),
    );
  });

  it('keeps user-authenticated requests attributed to the user actor', async () => {
    const service = { appendContacts: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new SkipTraceController(service as any);

    await controller.appendContacts(
      'acc_1',
      'user_1',
      undefined,
      {
        leadId: 'lead_1',
        propertyAddress: '1 Main St',
      },
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        accountId: 'acc_1',
        actor: 'user',
        userId: 'user_1',
        leadId: 'lead_1',
      }),
    );
  });
});
