import { notFound } from 'next/navigation';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isAdminUser } from '@/lib/auth/admin';
import { getSystemStatus } from '@/lib/system/health';
import { listEvents } from '@/lib/system/eventLog';
import { SystemPageClient } from './SystemPageClient';

export const dynamic = 'force-dynamic';

export default async function SystemPage() {
  // Operator-only: anyone else (signed out, or a regular hosted user) gets a plain 404 so the page's
  // existence is not advertised. Self-host: the single local user is the admin (see isAdminUser).
  const userId = await getCurrentUserId();
  if (!isAdminUser(userId)) notFound();

  const status = await getSystemStatus();

  let events: Awaited<ReturnType<typeof listEvents>> = [];
  try {
    events = await listEvents({ limit: 50 });
  } catch {
    // Mongo unreachable — render the shell with an empty log rather than 500.
    // The status cards above already surface a "down" MongoDB component in
    // this case, so the empty log here isn't a silent failure.
  }

  return <SystemPageClient initialStatus={status} initialEvents={events} canViewLogs />;
}
