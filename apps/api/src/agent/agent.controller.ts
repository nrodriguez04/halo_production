import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AGENT_NAMES } from '@halo/shared';
import { AutomationRunStatus } from '@prisma/client';
import { AgentOrchestrationService } from './agent-orchestration.service';
import { AgentService } from './agent.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { APPROVE } from '../disposition/disposition.controller';
import {
  CurrentAccountId,
  CurrentUser,
  CurrentUserId,
} from '../auth/decorators';
import { piiViewer } from '../auth/pii-access';
import {
  DraftMessageDto,
  LogAgentNoteDto,
  NextActionsDto,
  ClassifyInboundDto,
  ProposeFollowUpDto,
  RequestSendDto,
} from './dto/agent.dto';

const QueueAgentRunSchema = z
  .object({
    agent: z.enum(AGENT_NAMES),
    entityType: z.enum(['lead', 'deal', 'message']).default('lead'),
    entityId: z.string().trim().min(1).max(64),
  })
  .strict();
const RejectRunSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .strict();
const RUN_STATUSES = new Set(Object.values(AutomationRunStatus));

@Controller('agent')
@UseGuards(AuthGuard, PermissionsGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly orchestration: AgentOrchestrationService,
  ) {}

  @Get('deals/:id/summary')
  async getDealSummary(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.agentService.getDealSummary(dealId, accountId, {
      viewer: piiViewer(user),
    });
  }

  @Get('deals/:id/context')
  async getDealContext(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.agentService.getDealContext(dealId, accountId, {
      viewer: piiViewer(user),
    });
  }

  @Post('deals/:id/next-actions')
  async getNextActions(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: NextActionsDto,
  ) {
    return this.agentService.suggestNextActions(dealId, accountId, body);
  }

  @Post('deals/:id/draft-seller-email')
  async draftSellerEmail(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: DraftMessageDto,
  ) {
    return this.agentService.draftMessage(
      dealId,
      accountId,
      'email',
      'seller',
      body,
    );
  }

  @Post('deals/:id/draft-seller-sms')
  async draftSellerSms(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: DraftMessageDto,
  ) {
    return this.agentService.draftMessage(
      dealId,
      accountId,
      'sms',
      'seller',
      body,
    );
  }

  @Post('deals/:id/draft-buyer-email')
  async draftBuyerEmail(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: DraftMessageDto,
  ) {
    return this.agentService.draftMessage(
      dealId,
      accountId,
      'email',
      'buyer',
      body,
    );
  }

  @Post('deals/:id/draft-buyer-sms')
  async draftBuyerSms(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: DraftMessageDto,
  ) {
    return this.agentService.draftMessage(
      dealId,
      accountId,
      'sms',
      'buyer',
      body,
    );
  }

  @Get('communications/pending-approvals')
  async getPendingApprovals(@CurrentAccountId() accountId: string) {
    return this.agentService.getPendingApprovals(accountId);
  }

  @Post('communications/:id/request-send')
  async requestSend(
    @Param('id') messageId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: RequestSendDto,
  ) {
    return this.agentService.requestSend(messageId, accountId, body);
  }

  @Post('deals/:id/log-agent-note')
  async logAgentNote(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: LogAgentNoteDto,
  ) {
    return this.agentService.logAgentNote(dealId, accountId, body);
  }

  @Post('deals/:id/classify-inbound')
  async classifyInbound(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: ClassifyInboundDto,
  ) {
    return this.agentService.classifyInbound(dealId, accountId, body);
  }

  @Post('deals/:id/propose-follow-up')
  async proposeFollowUp(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: ProposeFollowUpDto,
  ) {
    return this.agentService.proposeFollowUp(dealId, accountId, body);
  }

  // ------------------------------------------------------------ agent runs

  /** Queue an agent for an entity by hand (docs/agent-design.md s4). */
  @Post('runs')
  async queueAgentRun(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const dto = QueueAgentRunSchema.parse(body);
    const queued = await this.orchestration.enqueue({
      agent: dto.agent,
      accountId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      trigger: 'manual',
      triggerEventId: `manual:${Date.now()}`,
      actorId: userId ?? null,
    });
    return { queued };
  }

  /** Agent runs with a label for the entity, newest first. */
  @Get('runs')
  listAgentRuns(
    @CurrentAccountId() accountId: string,
    @Query('agent') agent?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Number(limit);
    return this.orchestration.listRuns(accountId, {
      agent: (AGENT_NAMES as readonly string[]).includes(agent ?? '')
        ? (agent as (typeof AGENT_NAMES)[number])
        : undefined,
      status:
        status && RUN_STATUSES.has(status as AutomationRunStatus)
          ? (status as AutomationRunStatus)
          : undefined,
      limit: Number.isInteger(n) && n > 0 ? n : undefined,
    });
  }

  /**
   * A person accepts the recommendation; the gated actions happen now. The
   * same permission as the actions themselves (a buyer blast, a lead
   * disqualified), so approving a run is no way around it.
   */
  @Post('runs/:id/approve')
  @Permissions(APPROVE)
  approveAgentRun(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.orchestration.approve(accountId, id, userId);
  }

  /** A person declines; the lead is left as it was. */
  @Post('runs/:id/reject')
  @Permissions(APPROVE)
  rejectAgentRun(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = RejectRunSchema.parse(body ?? {});
    return this.orchestration.reject(accountId, id, userId, dto.reason);
  }
}
