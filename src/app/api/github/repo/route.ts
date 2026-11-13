import { NextResponse } from 'next/server';
import { fetchGithubRepoStats } from '@/lib/github/repoStats';

export const revalidate = 3600;

/** Public stats for AnkushGitRepo/marketmitra. Null fields mean GitHub did not return that value. */
export async function GET() {
  const data = await fetchGithubRepoStats();
  return NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
  );
}
