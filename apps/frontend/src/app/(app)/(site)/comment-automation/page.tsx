import { CommentAutomation } from '@gitroom/frontend/components/comment-automation/comment-automation';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postora' : 'Gitroom'} Comment Automation`,
  description: '',
};
export default async function Index() {
  return <CommentAutomation />;
}
