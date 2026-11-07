import { advisorPageUser } from '@/lib/advisor/pageGuard';
import { ScreenClient } from '@/components/advisor/ScreenClient';

export const dynamic = 'force-dynamic';

export default async function AdvisorScreenPage() {
  const userId = await advisorPageUser();
  if (!userId) return null;
  return <ScreenClient />;
}
