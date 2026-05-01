import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class DraftMessageDto {
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsString()
  workflowName?: string;

  @IsOptional()
  @IsString()
  automationRunId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class LogAgentNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsString()
  automationRunId?: string;
}

export class NextActionsDto {
  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class ClassifyInboundDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsOptional()
  @IsString()
  agentName?: string;
}

export class ProposeFollowUpDto {
  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class RequestSendDto {
  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsString()
  automationRunId?: string;
}
