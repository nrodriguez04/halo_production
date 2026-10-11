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
