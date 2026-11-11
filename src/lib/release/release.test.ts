import { describe, expect, it } from 'vitest';
import {
  applyBump,
  decideBump,
  isNewer,
  latestChangelogVersion,
  parseCommit,
  parseVersion,
  prependChangelog,
  releaseNotesFor,
  renderSection,
  versionFromReleaseSubject,
  type Commit,
} from './release';

const c = (subject: string, body = ''): Commit => {
  const parsed = parseCommit(subject, body);
  if (!parsed) throw new Error(`not conventional: ${subject}`);
  return parsed;
};

describe('parseCommit', () => {
  it('reads type, scope, description and the PR number from a squash-merge subject', () => {
    expect(parseCommit('feat(alerts): reliable alert emails (#86)')).toEqual({
      type: 'feat', scope: 'alerts', description: 'reliable alert emails', pr: 86, breaking: false,
    });
    expect(parseCommit('fix: stop the chart collapsing on iPhone (#65)')).toMatchObject({ type: 'fix', scope: null, pr: 65 });
  });

  it('flags a breaking change from "!" or a BREAKING CHANGE footer', () => {
    expect(parseCommit('feat(api)!: rename wishlists to watchlists (#92)')?.breaking).toBe(true);
    expect(parseCommit('feat: new thing', 'Details\n\nBREAKING CHANGE: removes the old route')?.breaking).toBe(true);
    expect(parseCommit('feat: new thing', 'no footer here')?.breaking).toBe(false);
  });

  it('returns null for anything that is not a Conventional Commit', () => {
    for (const s of ['Merge branch main into x', 'Update README.md', 'first commit', 'polish(api-explorer): thing', 'Revert "fix: x"', 'feat missing colon', '']) {
      expect(parseCommit(s)).toBeNull();
    }
  });

  it('handles a subject without a PR number', () => {
    expect(parseCommit('chore: tidy')?.pr).toBeNull();
  });
});

describe('decideBump', () => {
  it('a feature is a minor bump, a fix a patch, the biggest wins', () => {
    expect(decideBump([c('fix: a'), c('feat: b')], '0.2.0')).toBe('minor');
    expect(decideBump([c('fix: a'), c('perf: b'), c('refactor: c')], '0.2.0')).toBe('patch');
  });

  it('docs, tests, chores and CI alone do not release', () => {
    expect(decideBump([c('docs: a'), c('test: b'), c('chore: c'), c('ci: d')], '0.2.0')).toBeNull();
    expect(decideBump([], '0.2.0')).toBeNull();
  });

  it('a breaking change is major from 1.0.0 and minor before it', () => {
    expect(decideBump([c('feat!: x')], '1.4.2')).toBe('major');
    expect(decideBump([c('feat!: x')], '0.2.0')).toBe('minor');
    expect(decideBump([c('fix!: x')], '0.9.9')).toBe('minor');
  });
});

describe('versions', () => {
  it('bumps and resets lower parts', () => {
    expect(applyBump('0.2.5', 'patch')).toBe('0.2.6');
    expect(applyBump('0.2.5', 'minor')).toBe('0.3.0');
    expect(applyBump('1.2.5', 'major')).toBe('2.0.0');
  });
  it('rejects anything that is not MAJOR.MINOR.PATCH', () => {
    expect(() => parseVersion('1.2')).toThrow();
    expect(() => parseVersion('v1.2.3')).toThrow();
    expect(() => parseVersion('1.2.3-beta')).toThrow();
  });
  it('compares strictly', () => {
    expect(isNewer('0.3.0', '0.2.9')).toBe(true);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
  });
});

describe('changelog', () => {
  const repo = 'https://github.com/o/r';
  const commits = [c('feat(alerts): reliable emails (#86)'), c('fix: chart on iPhone (#65)'), c('docs: notes (#74)'), c('chore: tidy'), c('perf: faster (#3)'), c('refactor: split file (#4)')];

  it('groups features, fixes, performance and refactors with PR links and leaves out docs/chore', () => {
    const s = renderSection({ version: '0.3.0', date: '2026-11-11', commits, repoUrl: repo });
    expect(s).toContain('## [0.3.0] - 2026-11-11');
    expect(s.indexOf('### Features')).toBeLessThan(s.indexOf('### Fixes'));
    expect(s).toContain('- **alerts:** reliable emails ([#86](https://github.com/o/r/pull/86))');
    expect(s).toContain('- chart on iPhone ([#65](https://github.com/o/r/pull/65))');
    expect(s).toContain('### Performance');
    expect(s).toContain('### Refactors');
    expect(s).not.toContain('notes');
    expect(s).not.toContain('tidy');
  });

  it('lists breaking changes first, once', () => {
    const s = renderSection({ version: '1.0.0', date: '2026-12-01', commits: [c('feat: a'), c('feat(api)!: rename (#9)')], repoUrl: repo });
    expect(s.indexOf('### Breaking changes')).toBeLessThan(s.indexOf('### Features'));
    expect(s.match(/rename/g)).toHaveLength(1);
  });

  it('omits empty groups', () => {
    const s = renderSection({ version: '0.2.1', date: '2026-11-12', commits: [c('fix: only a fix')], repoUrl: repo });
    expect(s).toContain('### Fixes');
    expect(s).not.toContain('### Features');
  });

  it('prepends under the header, above older releases, and creates the file when missing', () => {
    const first = prependChangelog(null, renderSection({ version: '0.2.0', date: '2026-11-11', commits, repoUrl: repo }));
    expect(first.startsWith('# Changelog')).toBe(true);
    const second = prependChangelog(first, renderSection({ version: '0.2.1', date: '2026-11-12', commits: [c('fix: x')], repoUrl: repo }));
    expect(second.indexOf('## [0.2.1]')).toBeLessThan(second.indexOf('## [0.2.0]'));
    expect(second.startsWith('# Changelog')).toBe(true);
    expect(latestChangelogVersion(second)).toBe('0.2.1');
  });

  it('extracts the notes for one version only', () => {
    const log = prependChangelog(prependChangelog(null, renderSection({ version: '0.2.0', date: 'd', commits: [c('feat: old')], repoUrl: repo })), renderSection({ version: '0.2.1', date: 'd', commits: [c('fix: new')], repoUrl: repo }));
    const notes = releaseNotesFor(log, '0.2.1');
    expect(notes).toContain('new');
    expect(notes).not.toContain('old');
    expect(releaseNotesFor(log, '9.9.9')).toBeNull();
  });
});

describe('versionFromReleaseSubject', () => {
  it('recognises only the release commit', () => {
    expect(versionFromReleaseSubject('chore(release): v0.2.0')).toBe('0.2.0');
    expect(versionFromReleaseSubject('chore(release): v10.20.30 ')).toBe('10.20.30');
    // GitHub's squash merge appends the PR number to the title.
    expect(versionFromReleaseSubject('chore(release): v0.2.0 (#93)')).toBe('0.2.0');
    for (const s of ['chore: release v0.2.0', 'feat: v0.2.0', 'chore(release): 0.2.0', 'chore(release): v0.2', 'chore(release): v0.2.0 extra', 'chore(release): v0.2.0 (#x)']) expect(versionFromReleaseSubject(s)).toBeNull();
  });
});
