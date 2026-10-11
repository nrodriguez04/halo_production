import { MlsService } from '../mls.service';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';

describe('MlsService', () => {
  const env = { ...process.env };
  const ctx = {
    accountId: 'tenant-1',
    actor: 'user' as const,
    userId: 'user-1',
  };
  let costControl: { checkAndCall: jest.Mock };
  let secrets: { resolve: jest.Mock };
  let fetchSpy: jest.SpyInstance;
  let service: MlsService;

  beforeEach(() => {
    process.env = { ...env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MLS_')) delete process.env[key];
    }
    // Pass-through cost control, like the other provider specs.
    costControl = {
      checkAndCall: jest.fn(async (intent: any) => ({
        decision: { kind: 'ALLOW' },
        result: await intent.execute(),
      })),
    };
    // The real resolve() checks the store, then env. Default to env only.
    secrets = {
      resolve: jest.fn(
        async (_provider: string, key: string) => process.env[key] || null,
      ),
    };
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ '@odata.count': 0, value: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    service = new MlsService(costControl as any, secrets as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(() => {
    process.env = env;
  });

  it('lets a setting saved on the Integrations page override env and routes the search through cost control', async () => {
    process.env.MLS_PROVIDER = 'bridge';
    process.env.MLS_DATASET = 'env-dataset';
    process.env.MLS_API_TOKEN = 'env-token';
    secrets.resolve.mockImplementation(
      async (_provider: string, key: string) =>
        key === 'MLS_DATASET' ? 'saved-dataset' : process.env[key] || null,
    );

    const out = await service.searchListings({ city: 'Houston' }, ctx);

    expect(secrets.resolve).toHaveBeenCalledWith('mls', 'MLS_DATASET');
    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.host).toBe('api.bridgedataoutput.com');
    expect(url.pathname).toBe('/api/v2/OData/saved-dataset/Property');
    expect(url.searchParams.get('access_token')).toBe('env-token');
    expect(costControl.checkAndCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'mls',
        action: 'search_listings',
        payload: { city: 'Houston' },
        context: ctx,
      }),
    );
    expect(out).toEqual({ listings: [], total: 0, dialect: 'bridge' });
  });

  it('fails as NOT_CONFIGURED, naming the missing setting, before cost control or the network', async () => {
    process.env.MLS_PROVIDER = 'bridge';

    const failure = service.searchListings({}, ctx);
    await expect(failure).rejects.toBeInstanceOf(
      IntegrationUnavailableException,
    );
    await expect(failure).rejects.toMatchObject({ reason: 'NOT_CONFIGURED' });
    await expect(failure).rejects.toThrow('MLS_DATASET');
    expect(costControl.checkAndCall).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a feed type it does not speak', async () => {
    process.env.MLS_PROVIDER = 'zillow';

    await expect(service.searchListings({}, ctx)).rejects.toThrow(
      'MLS_PROVIDER',
    );
  });

  it('treats a call cost control withheld as no listings', async () => {
    process.env.MLS_PROVIDER = 'simplyrets';
    process.env.MLS_USERNAME = 'demo';
    process.env.MLS_PASSWORD = 'demo';
    costControl.checkAndCall.mockResolvedValueOnce({
      decision: { kind: 'BLOCK' },
      result: null,
    });

    const out = await service.searchListings({ city: 'Houston' }, ctx);

    expect(out).toEqual({ listings: [], total: 0, dialect: 'simplyrets' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
