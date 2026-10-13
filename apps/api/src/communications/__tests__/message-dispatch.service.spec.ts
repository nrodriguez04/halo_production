import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MessageDispatchService } from '../message-dispatch.service';
import { PrismaService } from '../../prisma.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { ComplianceBlockedException } from '../../compliance/compliance-blocked.exception';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { TwilioSendService } from '../../integrations/twilio-send/twilio-send.service';
import { EmailSendService } from '../../integrations/email/email-send.service';
import { IntegrationUnavailableException } from '../../integrations/integration-unavailable.exception';
import { DealsService } from '../../deals/deals.service';
import { DisclosureGateService } from '../../compliance/disclosure-gate.service';
import { counterpartyColumns } from '../message-counterparty';
import { verifyUnsubscribeToken } from '../unsubscribe-token';

describe('MessageDispatchService', () => {
  let service: MessageDispatchService;
  let prisma: {
    message: { findFirst: jest.Mock };
    deal: { findFirst: jest.Mock };
  };
  let deals: { updateStage: jest.Mock };
  let disclosure: { assertEquitableInterest: jest.Mock };
  let compliance: { getFacts: jest.Mock };
  let controlPlane: { getStatus: jest.Mock };
  let twilio: { sendSms: jest.Mock };
  let email: { sendEmail: jest.Mock };
  const env = { ...process.env };

  beforeEach(async () => {
    process.env = {
      ...env,
      PII_ENCRYPTION_KEY_V1: '11'.repeat(32),
      PII_ENCRYPTION_KEY_CURRENT_VERSION: '1',
      PII_INDEX_KEY: '22'.repeat(32),
      TWILIO_PHONE_NUMBER: '+15550009999',
      EMAIL_FROM: 'offers@halo.example',
      EMAIL_POSTAL_ADDRESS: '100 Main St, Suite 5\nAustin, TX 78701',
      PUBLIC_API_URL: 'https://api.halo.example/api',
      MESSAGING_BRAND_NAME: 'Halo Homes',
    };
    delete process.env.SENDGRID_FROM_EMAIL;

    prisma = {
      message: { findFirst: jest.fn() },
      deal: { findFirst: jest.fn().mockResolvedValue({ stage: 'contacted' }) },
    };
    deals = { updateStage: jest.fn().mockResolvedValue({}) };
    disclosure = {
      assertEquitableInterest: jest
        .fn()
        .mockResolvedValue({ required: false, satisfied: true }),
    };
    compliance = {
      getFacts: jest.fn().mockResolvedValue({ isDnc: false, hasConsent: true }),
    };
    controlPlane = {
      getStatus: jest.fn().mockResolvedValue({
        enabled: true,
        smsEnabled: true,
        emailEnabled: true,
      }),
    };
    twilio = {
      sendSms: jest
        .fn()
        .mockResolvedValue({ sid: 'SM1', numSegments: 1, status: 'queued' }),
    };
    email = {
      sendEmail: jest
        .fn()
        .mockResolvedValue({ messageId: 'sg-1', provider: 'sendgrid' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageDispatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: ComplianceService, useValue: compliance },
        { provide: ControlPlaneService, useValue: controlPlane },
        { provide: TwilioSendService, useValue: twilio },
        { provide: EmailSendService, useValue: email },
        { provide: DealsService, useValue: deals },
        { provide: DisclosureGateService, useValue: disclosure },
      ],
    }).compile();
    service = module.get(MessageDispatchService);
  });

  afterAll(() => {
    process.env = env;
  });

  const approved = (overrides: Record<string, unknown> = {}) => ({
    id: 'msg-1',
    accountId: 'tenant-1',
    leadId: 'lead-1',
    dealId: 'deal-1',
    automationRunId: null,
    channel: 'sms',
    direction: 'outbound',
    status: 'approved',
    approvedAt: new Date(),
    approvedBy: 'user-1',
    content: 'Hi, still interested in an offer on 1 Main St?',
    metadata: {},
    ...counterpartyColumns('sms', '+15125550100'),
    ...overrides,
  });

  const noProviderCalled = () => {
    expect(twilio.sendSms).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  };

  describe('what may be sent', () => {
    it.each(['draft', 'pending_approval', 'blocked', 'sent', 'failed'])(
      'refuses a %s message',
      async (status) => {
        prisma.message.findFirst.mockResolvedValue(approved({ status }));

        await expect(service.sendApproved('tenant-1', 'msg-1')).rejects.toThrow(
          ConflictException,
        );
        expect(compliance.getFacts).not.toHaveBeenCalled();
        noProviderCalled();
      },
    );

    it('refuses an "approved" row that no approval actually produced', async () => {
      prisma.message.findFirst.mockResolvedValue(
        approved({ approvedAt: null, approvedBy: null }),
      );

      await expect(service.sendApproved('tenant-1', 'msg-1')).rejects.toThrow(
        ConflictException,
      );
      noProviderCalled();
    });

    it('refuses an inbound message', async () => {
      prisma.message.findFirst.mockResolvedValue(
        approved({ direction: 'inbound' }),
      );

      await expect(service.sendApproved('tenant-1', 'msg-1')).rejects.toThrow(
        ConflictException,
      );
      noProviderCalled();
    });

    it("only finds the calling tenant's message", async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(service.sendApproved('tenant-2', 'msg-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: { id: 'msg-1', accountId: 'tenant-2' },
      });
      noProviderCalled();
    });

    it('refuses a message with no stored recipient', async () => {
      prisma.message.findFirst.mockResolvedValue(
        approved({ counterpartyEnc: null, counterpartyHash: null }),
      );

      await expect(service.sendApproved('tenant-1', 'msg-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      noProviderCalled();
    });
  });

  describe('SMS', () => {
    it('sends to the stored recipient with opt-out text appended server-side', async () => {
      prisma.message.findFirst.mockResolvedValue(approved());

      const receipt = await service.sendApproved('tenant-1', 'msg-1');

      expect(receipt).toEqual({
        channel: 'sms',
        sid: 'SM1',
        numSegments: 1,
        status: 'queued',
      });
      expect(twilio.sendSms).toHaveBeenCalledWith(
        {
          to: '+15125550100',
          from: '+15550009999',
          body: 'Hi, still interested in an offer on 1 Main St?\n\nReply STOP to opt out.',
          messageId: 'msg-1',
        },
        expect.objectContaining({
          accountId: 'tenant-1',
          actor: 'system',
          leadId: 'lead-1',
          dealId: 'deal-1',
        }),
      );
    });

    it('does not repeat opt-out instructions the author already wrote', async () => {
      prisma.message.findFirst.mockResolvedValue(
        approved({ content: 'Offer inside. Text STOP to end messages.' }),
      );

      await service.sendApproved('tenant-1', 'msg-1');

      expect(twilio.sendSms.mock.calls[0][0].body).toBe(
        'Offer inside. Text STOP to end messages.',
      );
    });

    it('re-checks compliance against the stored recipient at send time', async () => {
      prisma.message.findFirst.mockResolvedValue(approved());

      await service.sendApproved('tenant-1', 'msg-1');

      expect(compliance.getFacts).toHaveBeenCalledWith({
        accountId: 'tenant-1',
        channel: 'sms',
        phone: '+15125550100',
        email: undefined,
        leadId: 'lead-1',
      });
      // The send path must not provision (and so switch on) a missing tenant.
      expect(controlPlane.getStatus).toHaveBeenCalledWith('tenant-1', {
        provision: false,
      });
    });

    it('blocks a contact on the DNC list', async () => {
      prisma.message.findFirst.mockResolvedValue(approved());
      compliance.getFacts.mockResolvedValue({ isDnc: true, hasConsent: true });

      const err = await service
        .sendApproved('tenant-1', 'msg-1')
        .catch((e) => e);

      expect(err).toBeInstanceOf(ComplianceBlockedException);
      expect(err.reason).toBe('DNC_BLOCKED');
      noProviderCalled();
    });

    it("blocks during the recipient's quiet hours and says which zone", async () => {
      prisma.message.findFirst.mockResolvedValue(approved());
      compliance.getFacts.mockResolvedValue({
        isDnc: false,
        hasConsent: true,
        timezone: 'America/New_York',
        timezoneSource: 'recipient',
        localHour: 22,
        quietHoursStart: 20,
        quietHoursEnd: 9,
      });

      const err = await service
        .sendApproved('tenant-1', 'msg-1')
        .catch((e) => e);

      expect(err).toBeInstanceOf(ComplianceBlockedException);
      expect(err.reason).toBe('QUIET_HOURS_BLOCKED');
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          timezone: 'America/New_York',
          localHour: 22,
        }),
      );
      noProviderCalled();
    });

    it('blocks when SMS is switched off in the control plane', async () => {
      prisma.message.findFirst.mockResolvedValue(approved());
      controlPlane.getStatus.mockResolvedValue({
        enabled: true,
        smsEnabled: false,
        emailEnabled: false,
      });

      const err = await service
        .sendApproved('tenant-1', 'msg-1')
        .catch((e) => e);

      expect(err).toBeInstanceOf(ComplianceBlockedException);
      expect(err.reason).toBe('CONTROL_PLANE_MESSAGING_DISABLED');
      noProviderCalled();
    });

    it('refuses to send without a configured sender number', async () => {
      delete process.env.TWILIO_PHONE_NUMBER;
      prisma.message.findFirst.mockResolvedValue(approved());

      await expect(service.sendApproved('tenant-1', 'msg-1')).rejects.toThrow(
        IntegrationUnavailableException,
      );
      noProviderCalled();
    });
  });

  describe('email', () => {
    const approvedEmail = (overrides: Record<string, unknown> = {}) =>
      approved({
        channel: 'email',
        content: 'Hello <b>Seller</b>,\nWe can close in 7 days & pay cash.',
        metadata: { subject: 'Cash offer\r\nBcc: attacker@evil.example' },
        ...counterpartyColumns('email', 'seller@example.com'),
        ...overrides,
      });

    it('escapes the content and adds the unsubscribe link and postal address', async () => {
      prisma.message.findFirst.mockResolvedValue(approvedEmail());

      const receipt = await service.sendApproved('tenant-1', 'msg-1');

      expect(receipt).toEqual({
        channel: 'email',
        providerMessageId: 'sg-1',
        provider: 'sendgrid',
      });
      const [input, ctx] = email.sendEmail.mock.calls[0];
      expect(input.to).toBe('seller@example.com');
      expect(input.from).toBe('offers@halo.example');
      expect(input.messageId).toBe('msg-1');
      expect(ctx).toEqual(
        expect.objectContaining({ accountId: 'tenant-1', actor: 'system' }),
      );

      // Content is data, never markup.
      expect(input.html).toContain(
        'Hello &lt;b&gt;Seller&lt;/b&gt;,<br>We can close in 7 days &amp; pay cash.',
      );
      expect(input.html).not.toContain('<b>Seller</b>');
      expect(input.html).toContain('100 Main St, Suite 5<br>Austin, TX 78701');
      expect(input.text).toContain('100 Main St, Suite 5\nAustin, TX 78701');

      const link =
        /https:\/\/api\.halo\.example\/api\/unsubscribe\/([^"\s<>]+)/.exec(
          input.text,
        );
      expect(link).not.toBeNull();
      expect(verifyUnsubscribeToken(link![1])).toBe('msg-1');
      expect(input.html).toContain(`href="${link![0]}"`);
      expect(input.headers).toEqual({
        'List-Unsubscribe': `<${link![0]}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
    });

    it('keeps a subject from injecting headers', async () => {
      prisma.message.findFirst.mockResolvedValue(approvedEmail());

      await service.sendApproved('tenant-1', 'msg-1');

      expect(email.sendEmail.mock.calls[0][0].subject).toBe(
        'Cash offer Bcc: attacker@evil.example',
      );
    });

    it('checks DNC for email against the stored address', async () => {
      prisma.message.findFirst.mockResolvedValue(approvedEmail());

      await service.sendApproved('tenant-1', 'msg-1');

      expect(compliance.getFacts).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'email',
          email: 'seller@example.com',
          phone: undefined,
        }),
      );
    });

    it.each(['EMAIL_POSTAL_ADDRESS', 'PUBLIC_API_URL', 'EMAIL_FROM'])(
      'refuses to send without %s',
      async (name) => {
        delete process.env[name];
        prisma.message.findFirst.mockResolvedValue(approvedEmail());

        const err = await service
          .sendApproved('tenant-1', 'msg-1')
          .catch((e) => e);

        expect(err).toBeInstanceOf(IntegrationUnavailableException);
        expect(err.message).toContain(name);
        noProviderCalled();
      },
    );
  });

  describe('deal stage and buyer disclosure', () => {
    it('moves a new deal to contacted after the first message reaches the seller', async () => {
      prisma.message.findFirst.mockResolvedValue(approved());
      prisma.deal.findFirst.mockResolvedValue({ stage: 'new' });
      await service.sendApproved('tenant-1', 'msg-1');
      expect(deals.updateStage).toHaveBeenCalledWith(
        'deal-1',
        'tenant-1',
        'contacted',
        null,
        'system',
      );
    });

    it('leaves deals past new alone and never fails a delivered send over the stage', async () => {
      prisma.message.findFirst.mockResolvedValue(approved());
      prisma.deal.findFirst.mockResolvedValue({ stage: 'negotiating' });
      await service.sendApproved('tenant-1', 'msg-1');
      expect(deals.updateStage).not.toHaveBeenCalled();

      prisma.deal.findFirst.mockResolvedValue({ stage: 'new' });
      deals.updateStage.mockRejectedValue(new Error('race'));
      await expect(
        service.sendApproved('tenant-1', 'msg-1'),
      ).resolves.toMatchObject({ channel: 'sms' });
    });

    it('blocks a buyer message for a Texas deal without the notice, before any provider call', async () => {
      prisma.message.findFirst.mockResolvedValue(
        approved({
          leadId: null,
          metadata: { recipientType: 'buyer', type: 'buyer_blast' },
        }),
      );
      disclosure.assertEquitableInterest.mockRejectedValue(
        new ComplianceBlockedException(
          'TX_EQUITABLE_INTEREST_DISCLOSURE',
          'Texas requires the notice',
        ),
      );
      await expect(
        service.sendApproved('tenant-1', 'msg-1'),
      ).rejects.toBeInstanceOf(ComplianceBlockedException);
      expect(twilio.sendSms).not.toHaveBeenCalled();
      expect(email.sendEmail).not.toHaveBeenCalled();
      expect(deals.updateStage).not.toHaveBeenCalled();
    });

    it('does not consult the Texas gate for seller messages', async () => {
      prisma.message.findFirst.mockResolvedValue(approved());
      await service.sendApproved('tenant-1', 'msg-1');
      expect(disclosure.assertEquitableInterest).not.toHaveBeenCalled();
    });
  });
});
