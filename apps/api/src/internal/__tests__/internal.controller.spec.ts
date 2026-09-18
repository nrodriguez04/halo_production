import { Test, TestingModule } from '@nestjs/testing';
import { InternalController } from '../internal.controller';
import { OpenAIService } from '../../integrations/openai/openai.service';
import { TwilioSendService } from '../../integrations/twilio-send/twilio-send.service';
import { EmailSendService } from '../../integrations/email/email-send.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { GeocodingService } from '../../integrations/geocoding/geocoding.service';
import { AttomService } from '../../integrations/attom/attom.service';
import { PrismaService } from '../../prisma.service';
import { BadRequestException } from '@nestjs/common';
import { counterpartyColumns } from '../../communications/message-counterparty';

describe('InternalController enrichment routes', () => {
  let controller: InternalController;
  let geocoding: { geocodeDetailed: jest.Mock };
  let attom: { lookupPropertyDetailed: jest.Mock };
  let twilio: { sendSms: jest.Mock };
  let compliance: { getFacts: jest.Mock };
  let prisma: {
    sourceRecord: { updateMany: jest.Mock };
    message: { findFirst: jest.Mock };
  };

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(async () => {
    geocoding = { geocodeDetailed: jest.fn() };
    attom = { lookupPropertyDetailed: jest.fn() };
    twilio = { sendSms: jest.fn().mockResolvedValue({ sid: 'SM1' }) };
    compliance = {
      getFacts: jest.fn().mockResolvedValue({ isDnc: false, hasConsent: true }),
    };
    prisma = {
      sourceRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      message: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: OpenAIService, useValue: {} },
        { provide: TwilioSendService, useValue: twilio },
        { provide: EmailSendService, useValue: {} },
        { provide: ComplianceService, useValue: compliance },
        { provide: GeocodingService, useValue: geocoding },
        { provide: AttomService, useValue: attom },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    controller = module.get(InternalController);
  });

  const dto = {
    address: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    leadId: 'lead-1',
  };

  it('geocodes with the tenant context and links the source record to the lead', async () => {
    geocoding.geocodeDetailed.mockResolvedValue({
      result: { data: {}, sourceRecordId: 'src-1' },
      costUsd: 0.005,
      cached: false,
    });

    const out = await controller.geocode('tenant-1', dto as any);

    expect(out).toEqual({
      sourceRecordId: 'src-1',
      costUsd: 0.005,
      cached: false,
    });
    expect(geocoding.geocodeDetailed).toHaveBeenCalledWith(
      '1 Main St',
      'Austin',
      'TX',
      '78701',
      expect.objectContaining({
        accountId: 'tenant-1',
        actor: 'system',
        leadId: 'lead-1',
      }),
    );
    expect(prisma.sourceRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'src-1', leadId: null },
      data: { leadId: 'lead-1' },
    });
  });

  it('does not touch source records when the lookup produced none', async () => {
    attom.lookupPropertyDetailed.mockResolvedValue({
      result: null,
      costUsd: 0,
      cached: false,
    });

    const out = await controller.propertyLookup('tenant-1', dto as any);

    expect(out).toEqual({ sourceRecordId: null, costUsd: 0, cached: false });
    expect(prisma.sourceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('reports a cache hit without re-linking', async () => {
    attom.lookupPropertyDetailed.mockResolvedValue({
      result: { data: {}, sourceRecordId: 'src-cached' },
      costUsd: 0,
      cached: true,
    });

    const out = await controller.propertyLookup('tenant-1', {
      ...dto,
      leadId: undefined,
    } as any);

    expect(out).toEqual({
      sourceRecordId: 'src-cached',
      costUsd: 0,
      cached: true,
    });
    expect(prisma.sourceRecord.updateMany).not.toHaveBeenCalled();
  });

  describe('send routes resolve the recipient server-side', () => {
    it('reads the SMS recipient from the message counterparty when `to` is omitted', async () => {
      prisma.message.findFirst.mockResolvedValue({
        channel: 'sms',
        direction: 'outbound',
        metadata: {},
        ...counterpartyColumns('sms', '+15125550100'),
      });

      await controller.sendSms('tenant-1', {
        from: '+15550009999',
        body: 'hi',
        messageId: 'msg-1',
      } as any);

      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1', accountId: 'tenant-1' },
        }),
      );
      expect(compliance.getFacts).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+15125550100', channel: 'sms' }),
      );
      expect(twilio.sendSms).toHaveBeenCalledWith(
        expect.objectContaining({ to: '+15125550100', messageId: 'msg-1' }),
        expect.anything(),
      );
    });

    it('rejects a send with no resolvable recipient', async () => {
      prisma.message.findFirst.mockResolvedValue({
        channel: 'sms',
        direction: 'outbound',
        metadata: {},
        counterpartyEnc: null,
      });

      await expect(
        controller.sendSms('tenant-1', {
          from: '+15550009999',
          body: 'hi',
          messageId: 'msg-x',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(twilio.sendSms).not.toHaveBeenCalled();
    });
  });
});
