import { proxyActivities } from '@temporalio/workflow';
import { CommentAutomationActivity } from '@gitroom/orchestrator/activities/comment-automation.activity';

const { processIncomingDirectMessage } = proxyActivities<CommentAutomationActivity>({
  startToCloseTimeout: '2 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '10 seconds',
  },
});

// One-shot: started once per incoming webhook direct-message event, see
// CommentAutomationService.triggerDirectMessageProcessing. Kept separate
// from commentAutomationWorkflow - same backing service, but a genuinely
// different trigger (an inbound DM, not a comment) - per the project's
// workflow versioning rule, this is a new workflow, not a parameter change
// to the existing one.
export async function directMessageAutomationWorkflow(args: {
  integrationId: string;
  senderId: string;
  messageId: string;
  messageText: string;
}) {
  return processIncomingDirectMessage(
    args.integrationId,
    args.senderId,
    args.messageId,
    args.messageText
  );
}
