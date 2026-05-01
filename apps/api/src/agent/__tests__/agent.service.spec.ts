import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from '../agent.service';
import { PrismaService } from '../../prisma.service';
import { CommunicationsService } from '../../communications/communications.service';
import { TimelineService } from '../../timeline/timeline.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('AgentService', () => {
  let service: AgentService;
  let prisma: any;
  let timelineService: any;
  let controlPlaneService: any;

  const mockDeal = {
    id: 'deal-1',
    accountId: 'tenant-1',
    stage: 'new',
    arv: 300000,
    repairEstimate: 40000,
    mao: 170000,
    offerAmount: null,
    leadId: 'lead-1',
    propertyId: 'prop-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    lead: {
      id: 'lead-1',
      status: 'new',
      canonicalOwner: 'James Smith',
      canonicalPhone: '+15551234567',
      canonicalEmail: 'james@example.com',
    },
    property: {
      id: 'prop-1',
      address: '123 Oak St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85001',
      estimatedValue: 285000,
    },
    underwritingResult: null,
    economics: null,
    contracts: [],
    marketingMaterials: [],
  };

  beforeEach(async () => {
    prisma = {
      deal: {
        findFirst: jest.fn(),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      automationRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({ id: 'run-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      quietHours: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    timelineService = {
      appendEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      getEntityTimeline: jest.fn().mockResolvedValue([]),
    };

    controlPlaneService = {
      getStatus: jest.fn().mockResolvedValue({
        enabled: true,
        smsEnabled: true,
        emailEnabled: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationsService, useValue: {} },
        { provide: TimelineService, useValue: timelineService },
        { provide: ControlPlaneService, useValue: controlPlaneService },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  describe('getDealSummary', () => {
    it('should return deal summary with related data', async () => {
      prisma.deal.findFirst.mockResolvedValue(mockDeal);

      const result = await service.getDealSummary('deal-1', 'tenant-1');

      expect(result.deal.id).toBe('deal-1');
      expect(result.deal.stage).toBe('new');
      expect(result.lead?.owner).toBe('James Smith');
      expect(result.property?.address).toBe('123 Oak St');
    });

    it('should throw NotFoundException for missing deal', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);

      await expect(
        service.getDealSummary('missing', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('draftMessage', () => {
    it('should create a draft message and automation run', async () => {
      prisma.deal.findFirst.mockResolvedValue(mockDeal);
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        status: 'draft',
        channel: 'sms',
        automationRunId: 'run-1',
      });

      const result = await service.draftMessage(
        'deal-1',
        'tenant-1',
        'sms',
        'seller',
        { content: 'Hello', agentName: 'test-agent' },
      );

      expect(result.message.status).toBe('draft');
      expect(result.automationRunId).toBe('run-1');
      expect(prisma.automationRun.create).toHaveBeenCalled();
      expect(timelineService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'AGENT_DRAFT_CREATED' }),
      );
    });

    it('should throw NotFoundException for missing deal', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);

      await expect(
        service.draftMessage('missing', 'tenant-1', 'sms', 'seller', {
          content: 'Hi',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestSend', () => {
    it('should submit a draft for approval', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        accountId: 'tenant-1',
        status: 'draft',
        channel: 'sms',
        automationRunId: 'run-1',
      });
      prisma.message.update.mockResolvedValue({
        id: 'msg-1',
        status: 'pending_approval',
      });

      const result = await service.requestSend('msg-1', 'tenant-1');

      expect(result.status).toBe('pending_approval');
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'pending_approval' },
        }),
      );
    });

    it('should reject non-draft messages', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        accountId: 'tenant-1',
        status: 'sent',
        channel: 'sms',
      });

      await expect(
        service.requestSend('msg-1', 'tenant-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block send when control plane is disabled', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        accountId: 'tenant-1',
        status: 'draft',
        channel: 'sms',
      });
      controlPlaneService.getStatus.mockResolvedValue({ enabled: false });

      await expect(
        service.requestSend('msg-1', 'tenant-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block send when channel is disabled', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        accountId: 'tenant-1',
        status: 'draft',
        channel: 'email',
      });
      controlPlaneService.getStatus.mockResolvedValue({
        enabled: true,
        smsEnabled: true,
        emailEnabled: false,
      });

      await expect(
        service.requestSend('msg-1', 'tenant-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('suggestNextActions', () => {
    it('should suggest outreach for new deals', async () => {
      prisma.deal.findFirst.mockResolvedValue(mockDeal);

      const result = await service.suggestNextActions('deal-1', 'tenant-1');

      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions[0].action).toBe('draft-seller-sms');
    });
  });

  describe('logAgentNote', () => {
    it('should create a timeline event', async () => {
      prisma.deal.findFirst.mockResolvedValue(mockDeal);

      const result = await service.logAgentNote('deal-1', 'tenant-1', {
        text: 'Test note',
        agentName: 'test',
      });

      expect(result.logged).toBe(true);
      expect(timelineService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'AGENT_NOTE',
          payload: expect.objectContaining({ text: 'Test note' }),
        }),
      );
    });
  });

  describe('classifyInbound', () => {
    it('should classify positive interest', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-in-1',
        accountId: 'tenant-1',
        dealId: 'deal-1',
        direction: 'inbound',
        content: 'Yes, I would be interested in hearing more',
      });

      const result = await service.classifyInbound('deal-1', 'tenant-1', {
        messageId: 'msg-in-1',
      });

      expect(result.classification).toBe('positive_interest');
      expect(result.sentiment).toBe('positive');
    });

    it('should classify opt-out', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-in-2',
        accountId: 'tenant-1',
        dealId: 'deal-1',
        direction: 'inbound',
        content: 'STOP please remove me',
      });

      const result = await service.classifyInbound('deal-1', 'tenant-1', {
        messageId: 'msg-in-2',
      });

      expect(result.classification).toBe('opt_out');
      expect(result.suggestedActions).toContain('honor-opt-out');
    });
  });
});
