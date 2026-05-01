import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';
import {
  DraftMessageDto,
  LogAgentNoteDto,
  NextActionsDto,
  ClassifyInboundDto,
  ProposeFollowUpDto,
  RequestSendDto,
} from './dto/agent.dto';

@Controller('agent')
@UseGuards(AuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('deals/:id/summary')
  async getDealSummary(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.agentService.getDealSummary(dealId, accountId);
  }

  @Get('deals/:id/context')
  async getDealContext(
    @Param('id') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.agentService.getDealContext(dealId, accountId);
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
  async getPendingApprovals(
    @CurrentAccountId() accountId: string,
  ) {
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
}
