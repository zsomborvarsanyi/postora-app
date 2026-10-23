import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CommentMatchType, RuleTriggerSource } from '@prisma/client';

export class CommentAutomationRuleDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsDefined()
  active: boolean;

  // COMMENT: matches a comment under a post, can send a public reply and/or
  // a comment-linked private reply. DIRECT_MESSAGE: matches an inbound
  // Messenger/Instagram DM, publicReply is unused, privateReply is sent as
  // a normal message reply (no comment-id, no once-per-comment limit).
  @IsEnum(RuleTriggerSource)
  @IsDefined()
  triggerSource: RuleTriggerSource;

  // Scopes the rule to one specific post's comments instead of the whole
  // channel. Omit for the default, channel-wide behavior.
  @IsString()
  @IsOptional()
  providerPostId?: string;

  // For CONTAINS: the comment/message contains any of these phrases.
  // For EXACT: the whole comment/message has to be just one of these
  // phrases (e.g. "the DM is literally just 'szia' and nothing else").
  // For REGEX: exactly one pattern is expected, only the first entry is used.
  @IsEnum(CommentMatchType)
  @IsDefined()
  matchType: CommentMatchType;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @IsDefined()
  triggers: string[];

  // One or more variants - one is picked at random each time the rule
  // fires, so repeated matches don't all get the identical wording.
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @IsOptional()
  @MaxLength(2200, { each: true })
  publicReply?: string[];

  // Meta private replies/DMs are shorter-lived, kept well under the
  // Messenger text limit.
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @IsOptional()
  @MaxLength(1000, { each: true })
  privateReply?: string[];
}

export class ReorderCommentAutomationRulesDto {
  @IsArray()
  @IsString({ each: true })
  @IsDefined()
  orderedIds: string[];
}

export class CopyCommentAutomationRulesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @IsDefined()
  targetIntegrationIds: string[];
}

// Mirrors LON's backend/postora-generate-link.php input shape exactly -
// see GenerateLonLinkParams in lon-link.service.ts.
export class GenerateLonLinkDto {
  @IsIn(['landing', 'purchase'])
  @IsDefined()
  type: 'landing' | 'purchase';

  @IsString()
  @IsOptional()
  landingSlug?: string;

  @IsString()
  @IsOptional()
  productSku?: string;

  @IsInt()
  @IsOptional()
  distributorId?: number;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  medium?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  campaign?: string;

  @IsString()
  @IsOptional()
  label?: string;
}
