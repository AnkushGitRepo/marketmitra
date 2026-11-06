import { HostedClerkProvider } from '@/components/auth/HostedClerkProvider';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <HostedClerkProvider>{children}</HostedClerkProvider>;
}
