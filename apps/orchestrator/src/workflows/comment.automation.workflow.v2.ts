import { proxyActivities } from '@temporalio/workflow';
import { CommentAutomationActivity } from '@gitroom/orchestrator/activities/comment-automation.activity';

const { processIncomingCommentV2 } = proxyActivities<CommentAutomationActivity>({
  startToCloseTimeout: '2 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '10 seconds',
  },
});

// v2 of commentAutomationWorkflow - adds providerPostId so post-scoped
// rules can win over channel-wide ones. The original commentAutomationWorkflow
// (comment.automation.workflow.ts) stays untouched and unused by new code,
// per the project's workflow versioning rule: never change an already-shipped
// workflow/activity signature, ship a new one instead.
export async function commentAutomationWorkflowV2(args: {
  integrationId: string;
  providerCommentId: string;
  commentText: string;
  providerPostId?: string;
}) {
  return processIncomingCommentV2(
    args.integrationId,
    args.providerCommentId,
    args.commentText,
    args.providerPostId
  );
}
