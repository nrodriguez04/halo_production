import { Type } from 'class-transformer';
import {
  AGENT_ENTITY_TYPES,
  AGENT_NAMES,
  type AgentEntityType,
  type AgentName,
} from '@halo/shared';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Entity ids so spend can be attributed on the cost dashboards. */
export class CostAttributionDto {
  /** Workflow-scoped budget bucket, e.g. agent:lead_analyst. */
  @IsOptional() @IsString() @MaxLength(80) workflow?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() propertyId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() campaignId?: string;
  @IsOptional() @IsString() automationRunId?: string;
}

export class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  @MaxLength(100_000)
  content!: string;
}

export class ChatCompletionDto extends CostAttributionDto {
  @IsString()
  model!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_000)
  maxTokens?: number;
}

/** Address parts for the enrichment lookups; the worker passes leadId in the attribution. */
export class EnrichmentAddressDto extends CostAttributionDto {
  @IsString() @MaxLength(500) address!: string;
  @IsOptional() @IsString() @MaxLength(200) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(20) zip?: string;
}

/** The worker names the lead; the api reads its address and owner itself. */
export class SkipTraceLeadDto {
  @IsString() @MaxLength(64) leadId!: string;
}

// ----------------------------------------------------------------- agents

export class AgentRunOpenDto {
  @IsIn([...AGENT_NAMES])
  agent!: AgentName;

  @IsIn([...AGENT_ENTITY_TYPES])
  entityType!: AgentEntityType;

  @IsString() @MaxLength(64) entityId!: string;

  @IsIn(['lifecycle', 'inbound', 'sweep', 'manual'])
  trigger!: 'lifecycle' | 'inbound' | 'sweep' | 'manual';

  @IsOptional() @IsString() @MaxLength(120) triggerEventId?: string;
  @IsOptional() @IsString() @MaxLength(64) actorId?: string | null;
}

/** What a market agent sees (docs/agent-design.md s3.6, s3.7). */
export class MarketAgentContextDto {
  @IsIn(['market_intelligence', 'market_expansion'])
  agent!: 'market_intelligence' | 'market_expansion';

  @IsString() @MaxLength(8) entityId!: string;
}

export class AgentDecisionDto {
  @IsIn(['COMPLETED', 'AWAITING_APPROVAL', 'FAILED', 'CANCELLED'])
  status!: 'COMPLETED' | 'AWAITING_APPROVAL' | 'FAILED' | 'CANCELLED';

  @IsOptional() @IsObject() decision?: Record<string, unknown>;
  @IsOptional() @IsNumber() @Min(0) costUsd?: number;
  @IsOptional() @IsString() @MaxLength(2000) error?: string;
  /** What the agent saw and the model's raw reply (docs/agent-eval.md). */
  @IsOptional() @IsObject() replay?: Record<string, unknown>;
}
