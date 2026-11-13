import { describe, expect, it } from 'vitest';
import {
  EMPTY_GITHUB_REPO_STATS,
  assembleGithubRepoStats,
  contributorCountFromLink,
  fetchGithubRepoStats,
  formatGithubStat,
  type GithubRepoParts,
} from './repoStats';

const REPO = { stargazers_count: 12, license: { spdx_id: 'MIT' } };
const LINK = '<https://api.github.com/repositories/1/contributors?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/contributors?per_page=1&page=4>; rel="last"';

function parts(overrides: Partial<GithubRepoParts> = {}): GithubRepoParts {
  return {
    repoStatus: 200,
    repoBody: REPO,
    contributorsStatus: 200,
    contributorsBody: [{}],
    contributorsLink: LINK,
    releaseStatus: 200,
    releaseBody: { tag_name: 'v0.5.0' },
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown, link?: string): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: link ? { link } : undefined,
  });
}

describe('contributorCountFromLink', () => {
  it('uses the last page when each page is one contributor', () => {
    expect(contributorCountFromLink(LINK, 1)).toBe(4);
  });

  it('uses the body length when the result fits on one page', () => {
    expect(contributorCountFromLink(null, 1)).toBe(1);
    expect(contributorCountFromLink(null, 0)).toBe(0);
  });

  it('ignores a link that has no last page', () => {
    expect(contributorCountFromLink('<https://api.github.com/repos?page=2>; rel="next"', 1)).toBe(1);
  });

  it('rejects a negative page length', () => {
    expect(contributorCountFromLink(null, -1)).toBeNull();
  });
});

describe('assembleGithubRepoStats', () => {
  it('reads stars, contributors, licence and the latest tag', () => {
    expect(assembleGithubRepoStats(parts())).toEqual({
      stars: 12,
      contributors: 4,
      licence: 'MIT',
      latestRelease: 'v0.5.0',
    });
  });

  it('keeps a count of one when there is no link header', () => {
    expect(assembleGithubRepoStats(parts({ contributorsLink: null })).contributors).toBe(1);
  });

  it('counts zero contributors', () => {
    expect(assembleGithubRepoStats(parts({ contributorsBody: [], contributorsLink: null })).contributors).toBe(0);
  });

  it('leaves the release empty when the repo has none', () => {
    expect(assembleGithubRepoStats(parts({ releaseStatus: 404, releaseBody: null })).latestRelease).toBeNull();
  });

  it('leaves the licence empty when the repo declares none', () => {
    expect(assembleGithubRepoStats(parts({ repoBody: { stargazers_count: 0, license: null } })).licence).toBeNull();
  });

  it('drops a field whose body is not the shape GitHub documents', () => {
    const stats = assembleGithubRepoStats(parts({ repoBody: { stargazers_count: 'many' }, contributorsBody: {} }));
    expect(stats.stars).toBeNull();
    expect(stats.licence).toBeNull();
    expect(stats.contributors).toBeNull();
    expect(stats.latestRelease).toBe('v0.5.0');
  });

  it('drops fields when GitHub refuses the request', () => {
    expect(assembleGithubRepoStats(parts({ repoStatus: 403, contributorsStatus: 403, releaseStatus: 403 }))).toEqual(
      EMPTY_GITHUB_REPO_STATS
    );
  });
});

describe('formatGithubStat', () => {
  it('shows an em dash for a missing value and groups numbers', () => {
    expect(formatGithubStat(null)).toBe('—');
    expect(formatGithubStat(0)).toBe('0');
    expect(formatGithubStat(1200)).toBe('1,200');
    expect(formatGithubStat('v0.5.0')).toBe('v0.5.0');
  });
});

describe('fetchGithubRepoStats', () => {
  it('maps the three GitHub responses', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/marketmitra')) return jsonResponse(200, REPO);
      if (url.includes('/contributors')) return jsonResponse(200, [{}], LINK);
      if (url.includes('/releases/latest')) return jsonResponse(200, { tag_name: 'v0.5.0' });
      throw new Error(url);
    };
    await expect(fetchGithubRepoStats(fetchImpl)).resolves.toEqual({
      stars: 12,
      contributors: 4,
      licence: 'MIT',
      latestRelease: 'v0.5.0',
    });
  });

  it('sends a token when one is configured', async () => {
    let authorization: string | null = null;
    const fetchImpl: typeof fetch = async (_input, init) => {
      authorization = new Headers(init?.headers).get('authorization');
      return jsonResponse(200, { stargazers_count: 1, license: { spdx_id: 'MIT' } });
    };
    await fetchGithubRepoStats(fetchImpl, ' ghp_test ');
    expect(authorization).toBe('Bearer ghp_test');
  });

  it('returns empty stats when GitHub cannot be reached', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('offline');
    };
    await expect(fetchGithubRepoStats(fetchImpl)).resolves.toEqual(EMPTY_GITHUB_REPO_STATS);
  });

  it('leaves the release empty on a 404 and still reads the repo', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/releases/latest')) return jsonResponse(404, { message: 'Not Found' });
      if (url.includes('/contributors')) return jsonResponse(200, [], undefined);
      return jsonResponse(200, { stargazers_count: 3, license: { spdx_id: 'MIT' } });
    };
    await expect(fetchGithubRepoStats(fetchImpl)).resolves.toEqual({
      stars: 3,
      contributors: 0,
      licence: 'MIT',
      latestRelease: null,
    });
  });
});
