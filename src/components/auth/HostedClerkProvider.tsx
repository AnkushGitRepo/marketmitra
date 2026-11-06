import { ClerkProvider } from '@clerk/nextjs';
import { isHosted } from '@/lib/deployment-mode';

/** Clerk's provider, scoped to the routes that actually use Clerk (dashboard,
 * sign-in, sign-up). Keeping it off the public marketing pages means they stay
 * statically rendered and never load Clerk's JS or its dev-instance handshake
 * redirect. Self-hosted mode has no auth, so it renders children untouched. */
export function HostedClerkProvider({ children }: { children: React.ReactNode }) {
  return isHosted() ? <ClerkProvider>{children}</ClerkProvider> : <>{children}</>;
}
