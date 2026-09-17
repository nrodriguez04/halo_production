import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Entity ids so spend can be attributed on the cost dashboards. */
export class CostAttributionDto {
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

  @IsOptional() @IsNumber() @Min(0) @Max(2)
  temperature?: number;

  @IsOptional() @IsInt() @Min(1) @Max(32_000)
  maxTokens?: number;
}

export class SendSmsDto extends CostAttributionDto {
  @IsString() to!: string;
  @IsString() from!: string;

  @IsString()
  @MaxLength(1600)
  body!: string;

  @IsOptional() @IsIn(['us', 'toll_free'])
  variant?: 'us' | 'toll_free';

  /** Doubles as the idempotency key so a retried job cannot double-send. */
  @IsOptional() @IsString()
  messageId?: string;
}

export class SendEmailDto extends CostAttributionDto {
  @IsString() to!: string;
  @IsString() @MaxLength(500) subject!: string;

  @IsOptional() @IsString() @MaxLength(200_000) text?: string;
  @IsOptional() @IsString() @MaxLength(200_000) html?: string;
  @IsOptional() @IsString() from?: string;

  @IsOptional() @IsString()
  messageId?: string;
}
