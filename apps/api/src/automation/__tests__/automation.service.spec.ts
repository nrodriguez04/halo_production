import { Test, TestingModule } from '@nestjs/testing';
import { AutomationService } from '../automation.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { NotFoundException } from '@nestjs/common';

describe('AutomationService', () => {
  let service: AutomationService;
  let prisma: any;
  let timelineService: any;
  let controlPlaneService: any;

  beforeEach(async () => {
    prisma = {
      automationRun: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      message: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn(),
      },
    };

    timelineService = {
      appendEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    controlPlaneService = {
      isEnabled: jest.fn().mockResolvedValue(true),
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimelineService, useValue: timelineService },
        { provide: ControlPlaneService, useValue: controlPlaneService },
      ],
    }).compile();

    service = module.get<AutomationService>(AutomationService);
  });

  describe('createRun', () => {
    it('should create a new automation run', async () => {
      const mockRun = {
        id: 'run-1',
        tenantId: 'tenant-1',
        source: 'openclaw',
        status: 'QUEUED',
        entityType: 'deal',
        entityId: 'deal-1',
      };
      prisma.automationRun.create.mockResolvedValue(mockRun);

      const result = await service.createRun({
        tenantId: 'tenant-1',
        source: 'openclaw',
        agentName: 'test-agent',
        workflowName: 'draft-seller-sms',
        entityType: 'deal',
        entityId: 'deal-1',
      });

      expect(result.id).toBe('run-1');
      expect(prisma.automationRun.create).toHaveBeenCalled();
      expect(timelineService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'AUTOMATION_RUN_CREATED',
        }),
      );
    });
  });

  describe('completeRun', () => {
    it('should mark run as completed with output', async () => {
      prisma.automationRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'COMPLETED',
        entityType: 'deal',
        entityId: 'deal-1',
        workflowName: 'test',
      });

      const result = await service.completeRun('run-1', 'tenant-1', {
        outputJson: { success: true },
        aiCostUsd: 0.01,
      });

      expect(result.status).toBe('COMPLETED');
      expect(timelineService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'AUTOMATION_RUN_COMPLETED',
        }),
      );
    });
  });

  describe('failRun', () => {
    it('should mark run as failed with error', async () => {
      prisma.automationRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'FAILED',
        entityType: 'deal',
        entityId: 'deal-1',
      });

      const result = await service.failRun('run-1', 'tenant-1', {
        code: 'TEST_ERROR',
      });

      expect(result.status).toBe('FAILED');
    });
  });

  describe('getRun', () => {
    it('should return run with messages', async () => {
      prisma.automationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        tenantId: 'tenant-1',
        messages: [],
        childRuns: [],
      });

      const result = await service.getRun('run-1', 'tenant-1');
      expect(result.id).toBe('run-1');
    });

    it('should throw NotFoundException for missing run', async () => {
      prisma.automationRun.findFirst.mockResolvedValue(null);

      await expect(
        service.getRun('missing', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('attributeReply', () => {
    it('should attribute inbound reply to prior agent outbound', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce({
          id: 'msg-inbound',
          direction: 'inbound',
          dealId: 'deal-1',
          leadId: 'lead-1',
          createdAt: new Date(),
          metadata: {},
        })
        .mockResolvedValueOnce({
          id: 'msg-outbound',
          direction: 'outbound',
          automationRunId: 'run-1',
          createdAt: new Date(Date.now() - 86400_000),
        });

      prisma.message.update.mockResolvedValue({});

      const result = await service.attributeReply('msg-inbound', 'tenant-1');

      expect(result?.attributed).toBe(true);
      expect(result?.automationRunId).toBe('run-1');
      expect(result?.method).toBe('nearest_prior_outbound');
    });

    it('should return not attributed when no prior outbound', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce({
          id: 'msg-inbound',
          direction: 'inbound',
          dealId: 'deal-1',
          createdAt: new Date(),
          metadata: {},
        })
        .mockResolvedValueOnce(null);

      const result = await service.attributeReply('msg-inbound', 'tenant-1');
      expect(result?.attributed).toBe(false);
    });
  });

  describe('listRuns', () => {
    it('should filter by status and workflow', async () => {
      prisma.automationRun.findMany.mockResolvedValue([]);

      await service.listRuns('tenant-1', {
        status: 'COMPLETED' as any,
        workflowName: 'draft-seller-sms',
      });

      expect(prisma.automationRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            status: 'COMPLETED',
            workflowName: 'draft-seller-sms',
          }),
        }),
      );
    });
  });
});
