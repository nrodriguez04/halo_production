import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma.service';
import { AgentOrchestrationService } from '../../agent/agent-orchestration.service';
import { TimelineService } from '../../timeline/timeline.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { UnderwritingService } from '../underwriting.service';

describe('UnderwritingService', () => {
  let service: UnderwritingService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      jobRun: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      deal: {
        findFirst: jest.fn(),
      },
      underwritingResult: {
        findUnique: jest.fn(),
      },
      integrationCostEvent: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { actualCostUsd: 0 } }),
      },
      controlPlane: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnderwritingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AgentOrchestrationService,
          useValue: { enqueue: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: TimelineService,
          useValue: { appendEvent: jest.fn() },
        },
        {
          provide: ControlPlaneService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue({
              enabled: true,
              externalDataEnabled: true,
              aiEnabled: true,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UnderwritingService>(UnderwritingService);
  });

  it('returns legacy underwriting results for deals owned by the caller tenant', async () => {
    const legacy = {
      id: 'uw_1',
      dealId: 'deal_1',
      deal: { id: 'deal_1', accountId: 'tenant_1' },
      property: { id: 'property_1' },
    };

    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal_1',
      accountId: 'tenant_1',
    });
    prisma.underwritingResult.findUnique.mockResolvedValue(legacy);

    await expect(
      service.getResult('tenant_1', 'deal_1'),
    ).resolves.toMatchObject({
      source: 'legacy',
      result: legacy,
    });

    expect(prisma.deal.findFirst).toHaveBeenCalledWith({
      where: { id: 'deal_1', accountId: 'tenant_1' },
    });
  });

  it('throws not found before reading legacy data for a foreign tenant deal', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);

    await expect(service.getResult('tenant_2', 'deal_1')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.deal.findFirst).toHaveBeenCalledWith({
      where: { id: 'deal_1', accountId: 'tenant_2' },
    });
    expect(prisma.underwritingResult.findUnique).not.toHaveBeenCalled();
  });

  it('refuses to enqueue underwriting when the tenant AI switch is off', async () => {
    prisma.deal.findFirst.mockResolvedValueOnce({
      id: 'deal-1',
      accountId: 'tenant-1',
    });
    (service as any).controlPlaneService.getStatus.mockResolvedValueOnce({
      enabled: true,
      externalDataEnabled: true,
      aiEnabled: false,
    });

    await expect(
      service.analyze('tenant-1', 'user-1', 'deal-1'),
    ).rejects.toThrow(ForbiddenException);
    expect((service as any).agents.enqueue).not.toHaveBeenCalled();
  });

  it('queues the Deal Underwriter by hand and records the request on the deal timeline', async () => {
    prisma.deal.findFirst.mockResolvedValueOnce({
      id: 'deal-1',
      accountId: 'tenant-1',
    });

    await expect(
      service.analyze('tenant-1', 'user-1', 'deal-1'),
    ).resolves.toEqual({
      queued: true,
      status: 'QUEUED',
      agent: 'deal_underwriter',
    });

    expect((service as any).agents.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'deal_underwriter',
        accountId: 'tenant-1',
        entityType: 'deal',
        entityId: 'deal-1',
        trigger: 'manual',
        actorId: 'user-1',
      }),
    );
    expect((service as any).timelineService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'DEAL',
        entityId: 'deal-1',
        eventType: 'UNDERWRITE_ENQUEUED',
      }),
    );
  });

  it("prefers the Underwriter's row over an older legacy job run, flattened for the deal page", async () => {
    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal_1',
      accountId: 'tenant_1',
    });
    prisma.jobRun.findFirst.mockResolvedValue({
      id: 'job_1',
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      resultJson: { arv: 200000, mao: 100000 },
    });
    prisma.underwritingResult.findUnique.mockResolvedValue({
      id: 'uw_1',
      dealId: 'deal_1',
      arv: 250000,
      repairEstimate: 35000,
      mao: 130000,
      confidence: 0.72,
      rationale: 'Solid spread.',
      updatedAt: new Date('2026-10-12T00:00:00.000Z'),
      evaluationMetadata: {
        agent: 'deal_underwriter',
        automationRunId: 'run-1',
        offerRange: { low: 110000, high: 130000 },
        stale: false,
      },
    });

    await expect(
      service.getResult('tenant_1', 'deal_1'),
    ).resolves.toMatchObject({
      source: 'agent',
      arv: 250000,
      mao: 130000,
      confidence: 0.72,
      summary: 'Solid spread.',
      offerRange: { low: 110000, high: 130000 },
      stale: false,
      automationRunId: 'run-1',
    });
  });

  it('falls back to a newer legacy job run when the result row is older', async () => {
    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal_1',
      accountId: 'tenant_1',
    });
    prisma.jobRun.findFirst.mockResolvedValue({
      id: 'job_1',
      updatedAt: new Date('2026-10-12T00:00:00.000Z'),
      resultJson: { arv: 200000, mao: 100000, rationale: 'legacy' },
    });
    prisma.underwritingResult.findUnique.mockResolvedValue({
      id: 'uw_1',
      dealId: 'deal_1',
      arv: 250000,
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    await expect(
      service.getResult('tenant_1', 'deal_1'),
    ).resolves.toMatchObject({
      source: 'job_run',
      jobId: 'job_1',
      arv: 200000,
      summary: 'legacy',
    });
  });
});
