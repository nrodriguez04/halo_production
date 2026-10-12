import { Test, TestingModule } from '@nestjs/testing';
import { TwilioService } from '../twilio.service';
import { PrismaService } from '../../../prisma.service';
import { AutomationService } from '../../../automation/automation.service';
import { AgentOrchestrationService } from '../../../agent/agent-orchestration.service';
import { LeadPiiService } from '../../../leads/lead-pii.service';
import { OptOutService } from '../../../compliance/opt-out.service';
import { hashPhone } from '@halo/shared';

describe('TwilioService', () => {
  const env = { ...process.env };
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });
  afterEach(() => {
    delete process.env.SMS_KEYWORD_REPLIES;
    delete process.env.MESSAGING_BRAND_NAME;
    delete process.env.MESSAGING_HELP_CONTACT;
  });
  afterAll(() => {
    process.env = env;
  });

  let service: TwilioService;
  let prisma: any;
  let automationService: any;
  let agents: any;

  beforeEach(async () => {
    prisma = {
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async (args: any) => ({
          id: 'msg-inbound-1',
          ...args.data,
        })),
      },
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      buyer: { findMany: jest.fn().mockResolvedValue([]) },
      consent: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      dNCList: {
        upsert: jest.fn().mockResolvedValue({ id: 'dnc-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    automationService = {
      attributeReply: jest.fn().mockResolvedValue({ attributed: false }),
    };
    agents = { enqueue: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioService,
        OptOutService,
        { provide: PrismaService, useValue: prisma },
        { provide: AutomationService, useValue: automationService },
        { provide: AgentOrchestrationService, useValue: agents },
        LeadPiiService,
      ],
    }).compile();

    service = module.get<TwilioService>(TwilioService);
  });

  const inbound = (Body: string, From = '+15551234567') =>
    service.handleInbound({
      From,
      To: '+15550000000',
      Body,
      MessageSid: 'SM1',
    });
  const dncScopes = () =>
    prisma.dNCList.upsert.mock.calls.map((c: any[]) => c[0].create.accountId);
  const storedUnder = () =>
    prisma.message.create.mock.calls[0][0].data.accountId;

  it('routes inbound replies to the unique matching tenant', async () => {
    prisma.message.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);

    const out = await inbound('hello there');

    expect(out).toEqual({ handled: 'message', reply: null });
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'tenant-a',
          direction: 'inbound',
          channel: 'sms',
        }),
      }),
    );
    expect(automationService.attributeReply).toHaveBeenCalledWith(
      'msg-inbound-1',
      'tenant-a',
    );
  });

  it('fails closed when outbound history matches multiple tenants', async () => {
    prisma.message.findMany.mockResolvedValueOnce([
      { accountId: 'tenant-a' },
      { accountId: 'tenant-b' },
    ]);

    await inbound('this should not leak');

    expect(storedUnder()).toBe('unknown');
    expect(automationService.attributeReply).toHaveBeenCalledWith(
      'msg-inbound-1',
      'unknown',
    );
  });

  it('fails closed when outbound and lead ownership disagree', async () => {
    prisma.message.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);
    prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-b' }]);

    await inbound('conflicting ownership');

    expect(storedUnder()).toBe('unknown');
  });

  describe('opt-out keywords', () => {
    it("records an ambiguous STOP for every tenant that knows the number, not under 'unknown'", async () => {
      prisma.message.findMany.mockResolvedValueOnce([
        { accountId: 'tenant-a' },
        { accountId: 'tenant-b' },
      ]);

      const out = await inbound('STOP');

      expect(dncScopes().sort()).toEqual(['tenant-a', 'tenant-b']);
      expect(dncScopes()).not.toContain('unknown');
      expect(prisma.dNCList.upsert).toHaveBeenCalledWith({
        where: {
          accountId_phoneHash: {
            accountId: 'tenant-a',
            phoneHash: hashPhone('+15551234567'),
          },
        },
        create: {
          accountId: 'tenant-a',
          phoneEnc: expect.any(String),
          phoneHash: hashPhone('+15551234567'),
          source: 'stop_keyword',
          reason: 'Replied STOP',
        },
        update: { expiresAt: null },
      });
      // The reply itself stays quarantined: it cannot be tied to one tenant.
      expect(storedUnder()).toBe('unknown');
      expect(automationService.attributeReply).not.toHaveBeenCalled();
      expect(out).toEqual({
        handled: 'opt_out',
        reply: expect.stringContaining('unsubscribed'),
      });
    });

    it('revokes the SMS and call consents of each tenant', async () => {
      prisma.message.findMany.mockResolvedValueOnce([
        { accountId: 'tenant-a' },
      ]);
      prisma.consent.findMany.mockResolvedValueOnce([
        { accountId: 'tenant-c' },
      ]);
      prisma.lead.findMany.mockImplementation(async (args: any) =>
        args.where.accountId === 'tenant-a' ? [{ id: 'lead-a1' }] : [],
      );

      await inbound('stop');

      const revocations = prisma.consent.updateMany.mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(revocations.map((r: any) => r.where.accountId).sort()).toEqual([
        'tenant-a',
        'tenant-c',
      ]);
      const forA = revocations.find(
        (r: any) => r.where.accountId === 'tenant-a',
      );
      expect(forA).toEqual({
        where: {
          accountId: 'tenant-a',
          revokedAt: null,
          channel: { in: ['sms', 'call'] },
          OR: [
            { phoneHash: hashPhone('+15551234567') },
            { leadId: { in: ['lead-a1'] } },
          ],
        },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('also matches tenants through buyers and consents', async () => {
      prisma.buyer.findMany.mockResolvedValueOnce([
        { accountId: 'tenant-buyers' },
      ]);
      prisma.consent.findMany.mockResolvedValueOnce([
        { accountId: 'tenant-consents' },
      ]);

      await inbound('STOP');

      expect(prisma.buyer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phoneHash: { in: [hashPhone('+15551234567')] } },
        }),
      );
      expect(dncScopes().sort()).toEqual(['tenant-buyers', 'tenant-consents']);
    });

    it('records a STOP from a number no tenant knows in the GLOBAL scope', async () => {
      await inbound('STOP');

      expect(dncScopes()).toEqual(['GLOBAL']);
      expect(prisma.consent.updateMany).not.toHaveBeenCalled();
      expect(storedUnder()).toBe('unknown');
    });

    it('files a STOP from a single tenant under that tenant', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);

      await inbound('STOP');

      expect(dncScopes()).toEqual(['tenant-a']);
      expect(storedUnder()).toBe('tenant-a');
      const data = prisma.message.create.mock.calls[0][0].data;
      expect(data.metadata).toEqual(
        expect.objectContaining({
          handledStop: true,
          keyword: 'STOP',
          optOutScopes: 1,
        }),
      );
    });

    it.each([
      'END',
      'quit',
      'Revoke',
      'Stop.',
      'opt out',
      'UNSUBSCRIBE',
      'cancel',
      'STOPALL',
    ])('treats %p as an opt-out', async (body) => {
      const out = await inbound(body);
      expect(out.handled).toBe('opt_out');
      expect(prisma.dNCList.upsert).toHaveBeenCalled();
    });

    it.each([
      'Can you stop by tomorrow?',
      "Don't cancel the appointment",
      'I want to end this conversation politely',
    ])('treats %p as an ordinary reply', async (body) => {
      prisma.message.findMany.mockResolvedValueOnce([
        { accountId: 'tenant-a' },
      ]);

      const out = await inbound(body);

      expect(out).toEqual({ handled: 'message', reply: null });
      expect(prisma.dNCList.upsert).not.toHaveBeenCalled();
      expect(automationService.attributeReply).toHaveBeenCalled();
    });

    it('survives a concurrent STOP creating the same row', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);
      prisma.dNCList.upsert.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(inbound('STOP')).resolves.toEqual(
        expect.objectContaining({ handled: 'opt_out' }),
      );
      expect(prisma.dNCList.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'tenant-a', phoneHash: hashPhone('+15551234567') },
        data: { expiresAt: null },
      });
    });

    it('still records the opt-out when Twilio sends the confirmation itself', async () => {
      process.env.SMS_KEYWORD_REPLIES = 'provider';

      const out = await inbound('STOP');

      expect(out).toEqual({ handled: 'opt_out', reply: null });
      expect(prisma.dNCList.upsert).toHaveBeenCalled();
    });
  });

  describe('HELP', () => {
    it('answers with the brand and opt-out instructions and records no opt-out', async () => {
      process.env.MESSAGING_BRAND_NAME = 'Halo Homes';
      process.env.MESSAGING_HELP_CONTACT = 'support@halo.example';
      prisma.message.findMany.mockResolvedValueOnce([
        { accountId: 'tenant-a' },
      ]);

      const out = await inbound('help');

      expect(out).toEqual({
        handled: 'help',
        reply:
          'Halo Homes: For help, contact support@halo.example. Reply STOP to opt out. Msg & data rates may apply.',
      });
      expect(prisma.dNCList.upsert).not.toHaveBeenCalled();
      expect(prisma.message.create.mock.calls[0][0].data.metadata).toEqual(
        expect.objectContaining({ handledHelp: true }),
      );
    });

    it('does not treat words merely containing "info" as HELP', async () => {
      const out = await inbound('Send me information about the offer');
      expect(out.handled).toBe('message');
    });
  });

  describe('handleStatus', () => {
    const withMessage = (status: string) => {
      prisma.message.findMany.mockResolvedValueOnce([
        { id: 'msg-1', status, metadata: { twilioMessageSid: 'SM1' } },
      ]);
      prisma.message.update = jest.fn().mockResolvedValue({});
    };
    const writtenStatus = () =>
      prisma.message.update.mock.calls[0][0].data.status;

    it('does not reopen approval when a queued callback arrives for a sent message', async () => {
      withMessage('sent');
      await service.handleStatus({
        MessageSid: 'SM1',
        MessageStatus: 'queued',
      });
      expect(writtenStatus()).toBe('sent');
    });

    it('keeps delivered when a late sent callback arrives out of order', async () => {
      withMessage('delivered');
      await service.handleStatus({ MessageSid: 'SM1', MessageStatus: 'sent' });
      expect(writtenStatus()).toBe('delivered');
    });

    it('advances sent to delivered', async () => {
      withMessage('sent');
      await service.handleStatus({
        MessageSid: 'SM1',
        MessageStatus: 'delivered',
      });
      expect(writtenStatus()).toBe('delivered');
    });

    it('marks an undelivered send as failed', async () => {
      withMessage('sent');
      await service.handleStatus({
        MessageSid: 'SM1',
        MessageStatus: 'undelivered',
      });
      expect(writtenStatus()).toBe('failed');
    });

    it('leaves the workflow status alone for an unknown transport state', async () => {
      withMessage('sent');
      await service.handleStatus({
        MessageSid: 'SM1',
        MessageStatus: 'something-new',
      });
      expect(writtenStatus()).toBe('sent');
    });
  });

  it('looks leads up by the phone blind index only', async () => {
    prisma.message.findMany.mockResolvedValueOnce([]);
    prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);

    await inbound('hello');

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      canonicalPhoneHash: {
        in: expect.arrayContaining([hashPhone('+15551234567')]),
      },
    });
  });

  it('stores the inbound sender encrypted on the row and not in metadata', async () => {
    prisma.message.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);

    await inbound('hello');

    const data = prisma.message.create.mock.calls[0][0].data;
    expect(data.counterpartyHash).toBe(hashPhone('+15551234567'));
    expect(data.counterpartyEnc).toEqual(expect.any(String));
    expect(data.metadata).not.toHaveProperty('from');
    expect(data.metadata.to).toBe('+15550000000');
  });

  it('matches prior outbound messages by the recipient blind index first', async () => {
    prisma.message.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);

    await inbound('hello');

    const where = prisma.message.findMany.mock.calls[0][0].where;
    expect(where.direction).toBe('outbound');
    expect(where.OR[0]).toEqual({
      counterpartyHash: {
        in: expect.arrayContaining([hashPhone('+15551234567')]),
      },
    });
  });

  describe('Outreach Drafter trigger', () => {
    it('links an ordinary reply to the lead and its open deal and queues the Drafter', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);
      prisma.lead.findFirst.mockResolvedValueOnce({
        id: 'lead-1',
        deals: [{ id: 'deal-1' }],
      });

      await inbound('Maybe, what are you thinking?');

      const data = prisma.message.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        accountId: 'tenant-a',
        leadId: 'lead-1',
        dealId: 'deal-1',
      });
      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ accountId: 'tenant-a' }),
        }),
      );
      expect(agents.enqueue).toHaveBeenCalledWith({
        agent: 'outreach_drafter',
        accountId: 'tenant-a',
        entityType: 'deal',
        entityId: 'deal-1',
        trigger: 'inbound',
        triggerEventId: 'inbound:msg-inbound-1',
        messageId: 'msg-inbound-1',
      });
    });

    it('queues the Drafter on the lead when there is no open deal, and not at all for unknown senders', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);
      prisma.lead.findFirst.mockResolvedValueOnce({ id: 'lead-1', deals: [] });
      await inbound('Who is this?');
      expect(agents.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'lead', entityId: 'lead-1' }),
      );

      agents.enqueue.mockClear();
      await inbound('Hello?', '+15559999999');
      expect(agents.enqueue).not.toHaveBeenCalled();
    });

    it('never fails the webhook because the queue is down', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);
      prisma.lead.findFirst.mockResolvedValueOnce({
        id: 'lead-1',
        deals: [{ id: 'deal-1' }],
      });
      agents.enqueue.mockRejectedValueOnce(new Error('redis down'));
      await expect(inbound('Still here')).resolves.toEqual({
        handled: 'message',
        reply: null,
      });
    });
  });
});
