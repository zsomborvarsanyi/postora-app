import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CommentMatchType } from '@prisma/client';

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

  @IsEnum(CommentMatchType)
  @IsDefined()
  matchType: CommentMatchType;

  // For CONTAINS: one or more phrases, any of them triggers the rule.
  // For REGEX: exactly one pattern is expected, only the first entry is used.
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @IsDefined()
  triggers: string[];

  @IsString()
  @IsOptional()
  @MaxLength(2200)
  publicReply?: string;

  // Meta private replies are shorter-lived DMs, kept well under the Messenger text limit.
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  privateReply?: string;
}

export class ReorderCommentAutomationRulesDto {
  @IsArray()
  @IsString({ each: true })
  @IsDefined()
  orderedIds: string[];
}
