import { AppShell } from '@/components/appshell/AppShell';
import { HostedClerkProvider } from '@/components/auth/HostedClerkProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <HostedClerkProvider>
      <AppShell>{children}</AppShell>
    </HostedClerkProvider>
  );
}
