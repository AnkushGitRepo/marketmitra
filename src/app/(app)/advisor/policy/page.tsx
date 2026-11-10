import { advisorPageUser } from '@/lib/advisor/pageGuard';
import { getPolicy } from '@/lib/advisor/policy/store';
import { DEFAULT_POLICY } from '@/lib/advisor/policy/schema';
import { PolicyForm } from '@/components/advisor/PolicyForm';

export const dynamic = 'force-dynamic';

export default async function AdvisorPolicyPage() {
  const userId = await advisorPageUser();
  if (!userId) return null;
  const saved = await getPolicy(userId).catch(() => null);
  return <PolicyForm initial={saved ?? DEFAULT_POLICY} hasSaved={!!saved} />;
}
