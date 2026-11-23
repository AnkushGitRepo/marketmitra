import { HostedClerkProvider } from '@/components/auth/HostedClerkProvider';
import styles from './onboarding.module.css';

// Full-screen and outside the app shell (ADR 0075): a new user has nothing for the shell's data to show yet.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <HostedClerkProvider>
      <main className={styles.page}>{children}</main>
    </HostedClerkProvider>
  );
}
