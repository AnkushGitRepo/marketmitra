// Public stats for this repository, shown on the landing page and at GET /api/github/repo.
// Unauthenticated GitHub allows 60 requests an hour per IP, so callers cache for an hour.
// A missing field stays null — never a guessed number.

import { z } from 'zod';

export const GITHUB_OWNER = 'AnkushGitRepo';
export const GITHUB_REPO = 'marketmitra';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

const REVALIDATE_SECONDS = 60 * 60;
const GITHUB_API = 'https://api.github.com';

export interface GithubRepoStats {
  readonly stars: number | null;
  readonly contributors: number | null;
  readonly licence: string | null;
  readonly latestRelease: string | null;
}

export const EMPTY_GITHUB_REPO_STATS: GithubRepoStats = {
  stars: null,
  contributors: null,
  licence: null,
  latestRelease: null,
};

/** Em dash when GitHub did not return a value. Numbers use Indian grouping. */
export function formatGithubStat(value: number | string | null): string {
  if (value === null) return '—';
  if (typeof value === 'number') return value.toLocaleString('en-IN');
  return value;
}

const repoSchema = z.object({
  stargazers_count: z.number().int().nonnegative(),
  license: z.object({ spdx_id: z.string().trim().min(1) }).nullable(),
});

const releaseSchema = z.object({
  tag_name: z.string().trim().min(1),
});

const contributorsSchema = z.array(z.unknown());

export interface GithubRepoParts {
  readonly repoStatus: number;
  readonly repoBody: unknown;
  readonly contributorsStatus: number;
  readonly contributorsBody: unknown;
  readonly contributorsLink: string | null;
  readonly releaseStatus: number;
  readonly releaseBody: unknown;
}

/**
 * Contributor total from `GET /contributors?per_page=1`.
 * GitHub's `Link` header `rel="last"` page number is the count. One page has no link, so the body length is the count.
 */
export function contributorCountFromLink(link: string | null, pageLength: number): number | null {
  if (!Number.isInteger(pageLength) || pageLength < 0) return null;
  if (!link) return pageLength;
  const match = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link);
  if (!match) return pageLength;
  const lastPage = Number(match[1]);
  if (!Number.isInteger(lastPage) || lastPage < 1) return pageLength;
  return lastPage;
}

/** Turn the three GitHub responses into stats. A non-200 or a body that fails validation becomes null for that field. */
export function assembleGithubRepoStats(parts: GithubRepoParts): GithubRepoStats {
  const repo = parts.repoStatus === 200 ? repoSchema.safeParse(parts.repoBody) : null;
  const contributors = parts.contributorsStatus === 200 ? contributorsSchema.safeParse(parts.contributorsBody) : null;
  const release = parts.releaseStatus === 200 ? releaseSchema.safeParse(parts.releaseBody) : null;

  return {
    stars: repo?.success ? repo.data.stargazers_count : null,
    contributors: contributors?.success ? contributorCountFromLink(parts.contributorsLink, contributors.data.length) : null,
    licence: repo?.success ? (repo.data.license?.spdx_id ?? null) : null,
    latestRelease: release?.success ? release.data.tag_name : null,
  };
}

function githubHeaders(token: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': `MarketMitra (${GITHUB_REPO_URL})`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

export async function fetchGithubRepoStats(
  fetchImpl: typeof fetch = fetch,
  token: string | undefined = process.env.GITHUB_TOKEN
): Promise<GithubRepoStats> {
  const headers = githubHeaders(token?.trim() || undefined);
  const base = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const init = { headers, next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(8_000) };
  try {
    const [repoRes, contributorsRes, releaseRes] = await Promise.all([
      fetchImpl(base, init),
      fetchImpl(`${base}/contributors?per_page=1`, init),
      fetchImpl(`${base}/releases/latest`, init),
    ]);
    const [repoBody, contributorsBody, releaseBody] = await Promise.all([
      readJson(repoRes),
      readJson(contributorsRes),
      readJson(releaseRes),
    ]);
    return assembleGithubRepoStats({
      repoStatus: repoRes.status,
      repoBody,
      contributorsStatus: contributorsRes.status,
      contributorsBody,
      contributorsLink: contributorsRes.headers.get('link'),
      releaseStatus: releaseRes.status,
      releaseBody,
    });
  } catch {
    return EMPTY_GITHUB_REPO_STATS;
  }
}
