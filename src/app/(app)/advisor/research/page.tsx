import { advisorPageUser } from '@/lib/advisor/pageGuard';
import { MemoClient } from '@/components/advisor/MemoClient';

export const dynamic = 'force-dynamic';

export default async function AdvisorResearchPage() {
  const userId = await advisorPageUser();
  if (!userId) return null;
  return <MemoClient />;
}
