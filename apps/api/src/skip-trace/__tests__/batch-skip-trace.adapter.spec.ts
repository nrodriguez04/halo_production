import { BatchSkipTraceAdapter } from '../adapters/batch-skip-trace.adapter';
import { IntegrationUnavailableException } from '../../integrations/integration-unavailable.exception';

describe('BatchSkipTraceAdapter', () => {
  const fetchMock = jest.fn();
  const secrets = { resolve: jest.fn() };
  const costControl = {
    checkAndCall: jest.fn(async (intent: any) => ({
      decision: { kind: 'ALLOW' },
      result: await intent.execute({ provider: intent.provider }),
      actualCostUsd: 0.1,
      fromCache: false,
    })),
  };
  const adapter = () =>
    new BatchSkipTraceAdapter(costControl as any, secrets as any);
  const input = {
    leadId: 'lead-1',
    propertyAddress: '654 Birch Rd',
    city: 'Memphis',
    state: 'TN',
    zip: '38103',
    ownerName: 'Pat Owner',
  };
  const ctx = { accountId: 'acct', actor: 'system' as const, leadId: 'lead-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = fetchMock;
    secrets.resolve.mockResolvedValue(' key-123 ');
  });

  it('reads the key from the Integrations store at call time and returns the contacts', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            phones: [
              { phone: '+15125550142', phone_type: 'wireless', dnc: false },
            ],
            emails: [{ email: 'pat@example.com' }],
          },
        ],
      }),
    });

    const res = await adapter().appendContacts(input as any, ctx);

    expect(secrets.resolve).toHaveBeenCalledWith(
      'batch_skiptrace',
      'BATCH_SKIPTRACE_API_KEY',
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer key-123',
    );
    expect(res).toMatchObject({
      provider: 'batch_skiptrace',
      status: 'matched',
      phones: [{ number: '+15125550142', type: 'mobile', isDnc: false }],
      emails: [{ email: 'pat@example.com' }],
    });
  });

  it('reports a missing key as not configured before spending anything', async () => {
    secrets.resolve.mockResolvedValue(null);
    const err = await adapter()
      .appendContacts(input as any, ctx)
      .catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationUnavailableException);
    expect(err.reason).toBe('NOT_CONFIGURED');
    expect(costControl.checkAndCall).not.toHaveBeenCalled();
  });

  it('reports a rejected key as rejected credentials', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    const err = await adapter()
      .appendContacts(input as any, ctx)
      .catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationUnavailableException);
    expect(err.reason).toBe('REJECTED_CREDENTIALS');
  });
});
