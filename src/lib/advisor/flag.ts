import { isHosted } from '@/lib/deployment-mode';

// Mitra Advisor is a local-only, opt-in tool (docs/decisions/0035). It is
// switched on by an explicit server-side env flag — never by hostname sniffing
// — and is additionally refused on a hosted deployment, so a stray env var on
// Vercel can't expose it. Deliberately not a NEXT_PUBLIC_ var: client code gets
// the boolean from a server component, so the flag name never ships to browsers.
export function isAdvisorEnabled(): boolean {
  return process.env.ADVISOR_MODE === 'enabled' && !isHosted();
}
