import { AppShell } from '@/components/appshell/AppShell';
import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { HostedClerkProvider } from '@/components/auth/HostedClerkProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <HostedClerkProvider>
      <AppShell advisorEnabled={isAdvisorEnabled()}>{children}</AppShell>
    </HostedClerkProvider>
  );
}
