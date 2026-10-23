import { proxyActivities } from '@temporalio/workflow';
import { CommentAutomationActivity } from '@gitroom/orchestrator/activities/comment-automation.activity';

const { processIncomingComment } = proxyActivities<CommentAutomationActivity>({
  startToCloseTimeout: '2 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '10 seconds',
  },
});

// One-shot: started once per incoming webhook comment event, see
// CommentAutomationService.triggerProcessing. Never touched again after it's
// in origin/main - a future parameter change gets a new, separate workflow
// (e.g. commentAutomationWorkflowV2), per the project's workflow versioning rule.
export async function commentAutomationWorkflow(args: {
  integrationId: string;
  providerCommentId: string;
  commentText: string;
}) {
  return processIncomingComment(
    args.integrationId,
    args.providerCommentId,
    args.commentText
  );
}
