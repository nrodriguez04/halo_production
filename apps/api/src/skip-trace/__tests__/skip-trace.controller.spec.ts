import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  const service = {
    appendContacts: jest.fn(),
  };

  let controller: SkipTraceController;

  beforeEach(() => {
    controller = new SkipTraceController(service as any);
    service.appendContacts.mockResolvedValue({
      provider: 'batch_skiptrace',
      status: 'matched',
      phones: [],
      emails: [],
    });
    delete process.env.INTERNAL_API_TOKEN;
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
    jest.clearAllMocks();
  });

  it('charges internal worker calls to the forwarded tenant', async () => {
    process.env.INTERNAL_API_TOKEN = 'internal-token';

    await controller.appendContacts(
      'token-account',
      'user-1',
      'Bearer internal-token',
      'lead-account',
      {
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
      },
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      {
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
        ownerName: undefined,
        ownerMailingAddress: undefined,
        city: undefined,
        state: undefined,
        zip: undefined,
      },
      {
        accountId: 'lead-account',
        actor: 'worker',
        leadId: 'lead-1',
      },
    );
  });

  it('preserves end-user tenancy for normal requests', async () => {
    await controller.appendContacts(
      'user-account',
      'user-1',
      'Bearer session-token',
      'other-account',
      {
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
      },
    );

    expect(service.appendContacts).toHaveBeenCalledWith(
      {
        leadId: 'lead-1',
        propertyAddress: '123 Main St',
        ownerName: undefined,
        ownerMailingAddress: undefined,
        city: undefined,
        state: undefined,
        zip: undefined,
      },
      {
        accountId: 'user-account',
        actor: 'user',
        userId: 'user-1',
        leadId: 'lead-1',
      },
    );
  });
});
