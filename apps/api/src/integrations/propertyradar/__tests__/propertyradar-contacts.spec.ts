import { PropertyRadarService } from '../propertyradar.service';
import { PropertyRadarController } from '../propertyradar.controller';
import { isSealedJson, openJson } from '../../../pii/contact-crypto';

describe('PropertyRadar contacts', () => {
  const env = { ...process.env };
  const contacts = {
    RadarID: 'P123',
    Phones: [{ Number: '5125550100', Type: 'Mobile', Score: 90 }],
    Emails: [{ Address: 'owner@example.com', Score: 80 }],
  };

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
    process.env.PROPERTYRADAR_API_KEY = 'pr-key';
  });
  afterAll(() => {
    process.env = env;
  });

  const build = () => {
    const prisma = {
      sourceRecord: {
        create: jest.fn(async (args: any) => ({ id: 'src-1', ...args.data })),
      },
    };
    const controlPlane = {
      isExternalDataEnabled: jest.fn().mockResolvedValue(true),
    };
    const costControl = {
      checkAndCall: jest.fn(async (intent: any) => ({
        result: await intent.execute({ provider: intent.provider }),
      })),
    };
    const service = new PropertyRadarService(
      prisma as any,
      controlPlane as any,
      costControl as any,
    );
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => contacts,
    });
    return { service, prisma, costControl };
  };

  it('keeps the provenance record sealed, with only counts in the clear', async () => {
    const { service, prisma } = build();

    const out = await service.appendContacts('P123', {
      accountId: 'tenant-1',
      actor: 'system',
    });

    // In memory the adapter still gets the contacts to encrypt onto the lead.
    expect(out?.data.Phones?.[0].Number).toBe('5125550100');

    const stored = prisma.sourceRecord.create.mock.calls[0][0].data.response;
    expect(isSealedJson(stored)).toBe(true);
    expect(stored).toEqual(
      expect.objectContaining({
        RadarID: 'P123',
        phoneCount: 1,
        emailCount: 1,
      }),
    );
    expect(JSON.stringify(stored)).not.toContain('5125550100');
    expect(JSON.stringify(stored)).not.toContain('owner@example.com');
    expect(openJson(stored)).toEqual(contacts);
  });

  it('passes the skip-trace score gate through to cost control', async () => {
    const { service, costControl } = build();

    await service.appendContacts(
      'P123',
      { accountId: 'tenant-1', actor: 'system' },
      { leadScore: 40, workflow: 'skip_trace_pipeline' },
    );

    expect(costControl.checkAndCall.mock.calls[0][0].hints).toEqual({
      leadScore: 40,
      workflow: 'skip_trace_pipeline',
    });
  });

  it('masks contacts in the API response', async () => {
    const service = {
      appendContacts: jest
        .fn()
        .mockResolvedValue({ data: contacts, sourceRecordId: 'src-1' }),
    };
    const controller = new PropertyRadarController(service as any);

    const out = await controller.appendContacts('tenant-1', 'user-1', 'P123');

    expect(out).toEqual({
      sourceRecordId: 'src-1',
      data: {
        RadarID: 'P123',
        Phones: [{ Number: '••• ••• 0100', Type: 'Mobile', Score: 90 }],
        Emails: [{ Address: 'o•••@example.com', Score: 80 }],
      },
    });
  });
});
