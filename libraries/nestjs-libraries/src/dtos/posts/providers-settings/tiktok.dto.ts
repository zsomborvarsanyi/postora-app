import {
  IsBoolean, ValidateIf, IsIn, IsString, MaxLength, IsOptional, IsDefined, IsNumber, Min, Max, ValidateNested,
  registerDecorator, ValidationArguments, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

// TikTok's Content Sharing UX Guidelines (Required UX Implementation, 3a/3b) require
// these two cross-field rules to actually block publishing, not just be suggested by
// the UI: branded content can never go out as SELF_ONLY, and turning on the
// disclosure toggle without picking "Your brand" / "Branded content" must not be
// submittable. The frontend also disables/greys these out live, but the DTO is the
// authoritative check - it's what `form.trigger()` and the backend both run.
@ValidatorConstraint({ name: 'IsBrandDisclosureComplete', async: false })
export class IsBrandDisclosureCompleteConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as TikTokDto;
    if (!object.disclose) {
      return true;
    }
    return !!(object.brand_organic_toggle || object.brand_content_toggle);
  }

  defaultMessage(): string {
    return 'You need to indicate if your content promotes yourself, a third party, or both.';
  }
}

export function IsBrandDisclosureComplete(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsBrandDisclosureCompleteConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'IsBrandedContentPrivacyAllowed', async: false })
export class IsBrandedContentPrivacyAllowedConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as TikTokDto;
    if (!object.brand_content_toggle) {
      return true;
    }
    return object.privacy_level !== 'SELF_ONLY';
  }

  defaultMessage(): string {
    return 'Branded content visibility cannot be set to private.';
  }
}

export function IsBrandedContentPrivacyAllowed(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsBrandedContentPrivacyAllowedConstraint,
    });
  };
}

// Mirrors of live TikTok state the composer fetches from creator_info, synced into
// the form as hidden fields purely so `form.trigger()` - the one thing that gates
// the Post/Add to Calendar button - can see them. Never sent to TikTok. `@IsOptional`
// means "unknown yet" (still loading) passes; only an explicit `false` fails.
@ValidatorConstraint({ name: 'IsCreatorAbleToPostNow', async: false })
export class IsCreatorAbleToPostNowConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    return value !== false;
  }

  defaultMessage(): string {
    return 'This TikTok account cannot post right now, please try again later.';
  }
}

export function IsCreatorAbleToPostNow(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsCreatorAbleToPostNowConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'IsVideoWithinCreatorMaxDuration', async: false })
export class IsVideoWithinCreatorMaxDurationConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    return value !== false;
  }

  defaultMessage(): string {
    return 'This video is longer than TikTok allows for this account.';
  }
}

export function IsVideoWithinCreatorMaxDuration(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsVideoWithinCreatorMaxDurationConstraint,
    });
  };
}

export class TikTokMusic {
  @IsDefined()
  @IsString()
  @JSONSchema({
    description:
      'The commercial music library track id, taken from the "id" returned by the musicSearch function.',
  })
  id: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  audio_volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  video_volume?: number;
}

export class TikTokLocation {
  @IsDefined()
  @IsString()
  @JSONSchema({
    description:
      'The location tag id, taken from the "id" returned by the locationSearch function.',
  })
  id: string;

  @IsDefined()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;
}

// TikTok only honors most of these settings on a DIRECT_POST. With
// content_posting_method=UPLOAD the media lands in the user's TikTok inbox as a
// draft, and TikTok's inbox/upload endpoints accept nothing but the title /
// description - every other field below is silently discarded.
// video_made_with_ai / duet / stitch are additionally video-only: TikTok's photo
// post_info has no is_aigc, disable_duet or disable_stitch field.
// music / location are TikTok Business only: the legacy TikTok provider ignores
// them (its Content Posting API has no music_sound_info / location fields).
// Fields stay required here (existing clients depend on it); the constraints are
// documented, not enforced.
export class TikTokDto {
  @ValidateIf((p) => p.title)
  @MaxLength(90)
  @JSONSchema({
    description:
      'Used as the title of the post. The only setting TikTok keeps when content_posting_method=UPLOAD.',
  })
  title: string;

  @IsIn([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY',
  ])
  @IsString()
  @JSONSchema({
    description:
      'Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  privacy_level:
    | 'PUBLIC_TO_EVERYONE'
    | 'MUTUAL_FOLLOW_FRIENDS'
    | 'FOLLOWER_OF_CREATOR'
    | 'SELF_ONLY';

  @IsBoolean()
  @JSONSchema({
    description:
      'Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no duet setting for photo posts.',
  })
  duet: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no stitch setting for photo posts.',
  })
  stitch: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  comment: boolean;

  @IsIn(['yes', 'no'])
  @JSONSchema({
    description:
      'Photo posts only, and only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD. ' +
      'On TikTok Business, "yes" attaches a random commercial music library track and overrides the music setting; ' +
      'on legacy TikTok, "yes" lets TikTok auto-add its recommended music.',
  })
  autoAddMusic: 'yes' | 'no';

  @IsBoolean()
  @IsBrandedContentPrivacyAllowed()
  @JSONSchema({
    description:
      'Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD. Cannot be true together with privacy_level=SELF_ONLY - branded content visibility cannot be private.',
  })
  brand_content_toggle: boolean;

  @IsOptional()
  @IsBoolean()
  @IsBrandDisclosureComplete()
  @JSONSchema({
    description:
      'UI-only: whether the commercial content disclosure toggle is on. Not sent to TikTok. When true, at least one of brand_organic_toggle / brand_content_toggle is required.',
  })
  disclose?: boolean;

  @IsBoolean()
  @IsOptional()
  @JSONSchema({
    description:
      'Labels the post as AI generated. Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no AI-generated label for photo posts, and discards it on UPLOAD.',
  })
  video_made_with_ai: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  brand_organic_toggle: boolean;

  @Type(() => TikTokMusic)
  @ValidateNested()
  @IsOptional()
  @JSONSchema({
    description:
      'TikTok Business only, and only when content_posting_method=DIRECT_POST. Attaches a commercial music library track to the post (use the musicSearch function to find one). audio_volume / video_volume apply to video posts only. For photos, ignored when autoAddMusic is "yes" (a random track is attached instead).',
  })
  music?: TikTokMusic;

  @Type(() => TikTokLocation)
  @ValidateNested()
  @IsOptional()
  @JSONSchema({
    description:
      'TikTok Business only, and only when content_posting_method=DIRECT_POST. Tags the post with a location (use the locationSearch function to find one).',
  })
  location?: TikTokLocation;

  @IsIn(['DIRECT_POST', 'UPLOAD'])
  @IsString()
  @JSONSchema({
    description:
      'Required. Use "DIRECT_POST" to actually publish the post to TikTok. ' +
      '"UPLOAD" does NOT publish: it only sends the media to the user\'s TikTok app inbox, ' +
      'where they must manually finish and publish it within 24 hours or it is discarded, ' +
      'and it makes TikTok ignore every other setting here. ' +
      'Only use "UPLOAD" when the user explicitly asks to review or edit the post inside the TikTok app before publishing.',
  })
  content_posting_method: 'DIRECT_POST' | 'UPLOAD';

  @IsOptional()
  @IsCreatorAbleToPostNow()
  @JSONSchema({
    description:
      'Runtime-only: mirrors creator_info().canPost right before publish. Not sent to TikTok.',
  })
  _creatorCanPost?: boolean;

  @IsOptional()
  @IsVideoWithinCreatorMaxDuration()
  @JSONSchema({
    description:
      'Runtime-only: whether the selected video is within creator_info().maxDurationSeconds. Not sent to TikTok.',
  })
  _videoDurationValid?: boolean;
}
