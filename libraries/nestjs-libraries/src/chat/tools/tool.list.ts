import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@gitroom/nestjs-libraries/chat/tools/integration.trigger.tool';
import { IntegrationSchedulePostTool } from './integration.schedule.post';
import { GenerateVideoOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.options.tool';
import { VideoFunctionTool } from '@gitroom/nestjs-libraries/chat/tools/video.function.tool';
import { GenerateVideoTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.tool';
import { GenerateImageTool } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { IntegrationListTool } from '@gitroom/nestjs-libraries/chat/tools/integration.list.tool';
import { GroupListTool } from '@gitroom/nestjs-libraries/chat/tools/group.list.tool';
import { UploadFromUrlTool } from '@gitroom/nestjs-libraries/chat/tools/upload.from.url.tool';
import { PostsListTool } from '@gitroom/nestjs-libraries/chat/tools/posts.list.tool';
import { PostSettingsTool } from '@gitroom/nestjs-libraries/chat/tools/post.settings.tool';
import { CommentAutomationPostsListTool } from '@gitroom/nestjs-libraries/chat/tools/comment.automation.posts.list.tool';
import { CommentAutomationRulesListTool } from '@gitroom/nestjs-libraries/chat/tools/comment.automation.rules.list.tool';
import { CommentAutomationRuleUpsertTool } from '@gitroom/nestjs-libraries/chat/tools/comment.automation.rule.upsert.tool';
import { CommentAutomationRuleDeleteTool } from '@gitroom/nestjs-libraries/chat/tools/comment.automation.rule.delete.tool';
import { CommentAutomationRuleReorderTool } from '@gitroom/nestjs-libraries/chat/tools/comment.automation.rule.reorder.tool';
import { CommentAutomationRuleCopyTool } from '@gitroom/nestjs-libraries/chat/tools/comment.automation.rule.copy.tool';
import { LonLinkOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/lon.link.options.tool';
import { LonLinkGenerateTool } from '@gitroom/nestjs-libraries/chat/tools/lon.link.generate.tool';

export const toolList = [
  IntegrationListTool,
  GroupListTool,
  IntegrationValidationTool,
  IntegrationTriggerTool,
  IntegrationSchedulePostTool,
  PostsListTool,
  PostSettingsTool,
  GenerateVideoOptionsTool,
  VideoFunctionTool,
  GenerateVideoTool,
  GenerateImageTool,
  UploadFromUrlTool,
  CommentAutomationPostsListTool,
  CommentAutomationRulesListTool,
  CommentAutomationRuleUpsertTool,
  CommentAutomationRuleDeleteTool,
  CommentAutomationRuleReorderTool,
  CommentAutomationRuleCopyTool,
  LonLinkOptionsTool,
  LonLinkGenerateTool,
];
