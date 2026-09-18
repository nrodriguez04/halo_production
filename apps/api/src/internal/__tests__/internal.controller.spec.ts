import { Test, TestingModule } from '@nestjs/testing';
import { InternalController } from '../internal.controller';
import { OpenAIService } from '../../integrations/openai/openai.service';
import { TwilioSendService } from '../../integrations/twilio-send/twilio-send.service';
import { EmailSendService } from '../../integrations/email/email-send.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { GeocodingService } from '../../integrations/geocoding/geocoding.service';
import { AttomService } from '../../integrations/attom/attom.service';
import { PrismaService } from '../../prisma.service';

describe('InternalController enrichment routes', () => {
  let controller: InternalController;
  let geocoding: { geocodeDetailed: jest.Mock };
  let attom: { lookupPropertyDetailed: jest.Mock };
  let prisma: { sourceRecord: { updateMany: jest.Mock } };

  beforeEach(async () => {
    geocoding = { geocodeDetailed: jest.fn() };
    attom = { lookupPropertyDetailed: jest.fn() };
    prisma = {
      sourceRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: OpenAIService, useValue: {} },
        { provide: TwilioSendService, useValue: {} },
        { provide: EmailSendService, useValue: {} },
        { provide: ComplianceService, useValue: {} },
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
});
