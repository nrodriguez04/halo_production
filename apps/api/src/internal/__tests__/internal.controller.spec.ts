import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { InternalController } from '../internal.controller';
import { OpenAIService } from '../../integrations/openai/openai.service';
import { AnthropicService } from '../../integrations/anthropic/anthropic.service';
import { GeocodingService } from '../../integrations/geocoding/geocoding.service';
import { AttomService } from '../../integrations/attom/attom.service';
import { PrismaService } from '../../prisma.service';
import { MessageDispatchService } from '../../communications/message-dispatch.service';
import { LeadSkipTraceService } from '../../skip-trace/lead-skip-trace.service';
import { SkipTraceLeadDto } from '../dto/internal.dto';

describe('InternalController', () => {
  let controller: InternalController;
  let geocoding: { geocodeDetailed: jest.Mock };
  let attom: { lookupPropertyDetailed: jest.Mock };
  let dispatch: { sendApproved: jest.Mock };
  let leadSkipTrace: { traceLead: jest.Mock };
  let prisma: { sourceRecord: { updateMany: jest.Mock } };
  let openai: { chatCompletion: jest.Mock };
  let anthropic: { chatCompletion: jest.Mock };

  beforeEach(async () => {
    geocoding = { geocodeDetailed: jest.fn() };
    attom = { lookupPropertyDetailed: jest.fn() };
    dispatch = {
      sendApproved: jest.fn().mockResolvedValue({
        channel: 'sms',
        sid: 'SM1',
        numSegments: 1,
        status: 'queued',
      }),
    };
    leadSkipTrace = { traceLead: jest.fn() };
    openai = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: 'o',
        tokensIn: 1,
        tokensOut: 1,
        model: 'gpt-4o',
        raw: {},
      }),
    };
    anthropic = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: 'a',
        tokensIn: 2,
        tokensOut: 2,
        model: 'claude-opus-5-5',
        stopReason: 'end_turn',
        raw: {},
      }),
    };
    prisma = {
      sourceRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: OpenAIService, useValue: openai },
        { provide: AnthropicService, useValue: anthropic },
        { provide: MessageDispatchService, useValue: dispatch },
        { provide: LeadSkipTraceService, useValue: leadSkipTrace },
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

  describe('enrichment routes', () => {
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
  });

  describe('sending', () => {
    it('no longer exposes routes that take a raw recipient', () => {
      const routes = Object.getOwnPropertyNames(InternalController.prototype)
        .map((name) =>
          Reflect.getMetadata(
            PATH_METADATA,
            (InternalController.prototype as any)[name],
          ),
        )
        .filter(Boolean);

      expect(routes).toContain('messages/:messageId/send');
      expect(routes).not.toContain('sms/send');
      expect(routes).not.toContain('email/send');
      expect((controller as any).sendSms).toBeUndefined();
      expect((controller as any).sendEmail).toBeUndefined();
    });

    it('sends only a stored message, by id, for the calling tenant', async () => {
      const out = await controller.sendMessage('tenant-1', 'msg-1');

      expect(dispatch.sendApproved).toHaveBeenCalledWith('tenant-1', 'msg-1');
      expect(out).toEqual(
        expect.objectContaining({ channel: 'sms', sid: 'SM1' }),
      );
    });
  });

  describe('enrichment/skip-trace', () => {
    it('traces as the system with the lead-score gate and returns counts, never contacts', async () => {
      leadSkipTrace.traceLead.mockResolvedValue({
        provider: 'batch_skiptrace',
        status: 'matched',
        costUsd: 0.1,
        phones: [{ masked: '••• ••• 0100' }, { masked: '••• ••• 0101' }],
        emails: [{ masked: 's•••@example.com' }],
        stored: { phone: true, email: false },
      });

      const out = await controller.skipTrace('tenant-1', { leadId: 'lead-1' });

      expect(leadSkipTrace.traceLead).toHaveBeenCalledWith({
        accountId: 'tenant-1',
        leadId: 'lead-1',
        actor: 'system',
        automated: true,
      });
      expect(out).toEqual({
        provider: 'batch_skiptrace',
        status: 'matched',
        reason: undefined,
        costUsd: 0.1,
        phonesFound: 2,
        emailsFound: 1,
        stored: { phone: true, email: false },
      });
      expect(JSON.stringify(out)).not.toContain('0100');
    });

    it('accepts only a lead id from the worker', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      const metadata = { type: 'body' as const, metatype: SkipTraceLeadDto };

      await expect(
        pipe.transform(
          { leadId: 'lead-1', propertyAddress: '1 Main St' },
          metadata,
        ),
      ).rejects.toThrow();
      await expect(
        pipe.transform({ leadId: 'lead-1' }, metadata),
      ).resolves.toEqual(expect.objectContaining({ leadId: 'lead-1' }));
    });
  });

  describe('ai/chat-completion routes by model name', () => {
    const body = (model: string) =>
      ({ model, messages: [{ role: 'user', content: 'hi' }] }) as any;

    it('sends claude-* models to the Anthropic adapter', async () => {
      const out = await controller.chatCompletion(
        'tenant-1',
        body('claude-opus-5-5'),
      );
      expect(anthropic.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-5-5' }),
        expect.objectContaining({ accountId: 'tenant-1', actor: 'system' }),
      );
      expect(openai.chatCompletion).not.toHaveBeenCalled();
      // The worker only needs content and counts; raw never leaves the api.
      expect(out).toEqual({
        content: 'a',
        tokensIn: 2,
        tokensOut: 2,
        model: 'claude-opus-5-5',
      });
    });

    it('sends everything else to the OpenAI adapter', async () => {
      await controller.chatCompletion('tenant-1', body('gpt-4o'));
      expect(openai.chatCompletion).toHaveBeenCalledTimes(1);
      expect(anthropic.chatCompletion).not.toHaveBeenCalled();
    });
  });
});
