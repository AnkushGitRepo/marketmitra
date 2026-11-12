import { describe, expect, it } from 'vitest';
import {
  applyBump,
  decideBump,
  isNewer,
  latestChangelogVersion,
  parseCommit,
  parseVersion,
  CHANGELOG_HEADER,
  DRAFT_MARKER,
  linkReferences,
  parseChangelog,
  releaseChangelog,
  releaseNotesFor,
  renderDraftBody,
  validateChangelog,
  setSpecVersion,
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

const REPO = 'https://github.com/o/r';

describe('draft entries from commits (Keep a Changelog sections)', () => {
  const body = (subjects: string[]) => renderDraftBody(subjects.map((x) => c(x)), REPO);

  it('maps commit types to Added, Changed, Fixed and Security, in the guide\'s order, and leaves out docs, tests, chores and CI', () => {
    const s = body(['fix: chart on iPhone (#65)', 'feat(alerts): reliable emails (#86)', 'perf: faster (#3)', 'docs: notes', 'chore: tidy', 'ci: cache', 'test: more', 'fix(security): stop leaking SQL (#9)']);
    expect(s.indexOf('### Added')).toBeLessThan(s.indexOf('### Changed'));
    expect(s.indexOf('### Changed')).toBeLessThan(s.indexOf('### Fixed'));
    expect(s.indexOf('### Fixed')).toBeLessThan(s.indexOf('### Security'));
    expect(s).toContain('- **alerts:** Reliable emails. ([#86](https://github.com/o/r/pull/86))');
    expect(s).toContain('- Chart on iPhone. ([#65](https://github.com/o/r/pull/65))');
    expect(s).toContain('### Security\n\n- **security:** Stop leaking SQL.');
    for (const noise of ['notes', 'tidy', 'cache', 'more']) expect(s).not.toContain(noise);
    expect(s).not.toMatch(/### (Features|Fixes|Refactors|Performance|Breaking changes)/);
  });

  it('puts a breaking change under Changed with a Breaking prefix, and a security-worded fix under Security', () => {
    const s = body(['feat(api)!: rename the route (#9)', 'fix: close an XSS hole in the news page']);
    expect(s).toContain('### Changed\n\n- **api:** **Breaking:** Rename the route.');
    expect(s).toContain('### Security\n\n- Close an XSS hole in the news page.');
    expect(s).not.toContain('### Added');
  });

  it('omits empty sections and capitalises and ends each entry like a sentence', () => {
    const s = body(['fix: only a fix.']);
    expect(s).toBe('### Fixed\n\n- Only a fix.\n');
  });
});

const OLD = `${CHANGELOG_HEADER}
## [Unreleased]

## [0.2.0] - 2026-11-11

### Added

- First thing.

[Unreleased]: ${REPO}/compare/v0.2.0...HEAD
[0.2.0]: ${REPO}/releases/tag/v0.2.0
`;

describe('parseChangelog and linkReferences', () => {
  it('reads the header, the Unreleased body and every version, ignoring the link references', () => {
    const p = parseChangelog(OLD);
    expect(p.header).toContain('Keep a Changelog');
    expect(p.unreleased).toBe('');
    expect(p.versions.map((v) => v.version)).toEqual(['0.2.0']);
    expect(p.versions[0].body).toBe('### Added\n\n- First thing.');
  });

  it('builds compare links for each version, a tag link for the oldest, and Unreleased against the newest', () => {
    expect(linkReferences(['0.3.0', '0.2.0'], REPO)).toBe(
      `[Unreleased]: ${REPO}/compare/v0.3.0...HEAD\n[0.3.0]: ${REPO}/compare/v0.2.0...v0.3.0\n[0.2.0]: ${REPO}/releases/tag/v0.2.0\n`,
    );
    expect(linkReferences([], REPO)).toBe('');
  });
});

describe('releaseChangelog', () => {
  const next = (existing: string | null, commits: string[] = ['fix: draft me'], version = '0.3.0') => releaseChangelog({ existing, version, date: '2026-11-12', commits: commits.map((x) => c(x)), repoUrl: REPO });

  it('moves the curated Unreleased entries into the new version and leaves an empty Unreleased on top', () => {
    const withEntries = OLD.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Fixed\n\n- A curated fix.\n');
    const r = next(withEntries);
    expect(r.drafted).toBe(false);
    expect(r.text.indexOf('## [Unreleased]')).toBeLessThan(r.text.indexOf('## [0.3.0] - 2026-11-12'));
    expect(r.text.indexOf('## [0.3.0]')).toBeLessThan(r.text.indexOf('## [0.2.0]'));
    expect(parseChangelog(r.text).unreleased).toBe('');
    expect(releaseNotesFor(r.text, '0.3.0')).toBe('### Fixed\n\n- A curated fix.');
    expect(r.text).not.toContain(DRAFT_MARKER);
  });

  it('seeds a clearly marked draft from the commits when Unreleased is empty', () => {
    const r = next(OLD);
    expect(r.drafted).toBe(true);
    expect(releaseNotesFor(r.text, '0.3.0')).toContain(DRAFT_MARKER);
    expect(releaseNotesFor(r.text, '0.3.0')).toContain('- Draft me.');
  });

  it('regenerates the link references for every version and keeps older sections byte for byte', () => {
    const r = next(OLD);
    expect(r.text).toContain(`[Unreleased]: ${REPO}/compare/v0.3.0...HEAD`);
    expect(r.text).toContain(`[0.3.0]: ${REPO}/compare/v0.2.0...v0.3.0`);
    expect(r.text).toContain(`[0.2.0]: ${REPO}/releases/tag/v0.2.0`);
    expect(r.text).not.toContain(`[Unreleased]: ${REPO}/compare/v0.2.0...HEAD`);
    expect(releaseNotesFor(r.text, '0.2.0')).toBe('### Added\n\n- First thing.');
  });

  it('creates the file with the Keep a Changelog header when there is none', () => {
    const r = next(null);
    expect(r.text.startsWith('# Changelog')).toBe(true);
    expect(r.text).toContain('keepachangelog.com/en/1.1.0');
    expect(latestChangelogVersion(r.text)).toBe('0.3.0');
  });

  it('keeps a [YANKED] marker on an older version', () => {
    const yanked = OLD.replace('## [0.2.0] - 2026-11-11', '## [0.2.0] - 2026-11-11 [YANKED]');
    expect(next(yanked).text).toContain('## [0.2.0] - 2026-11-11 [YANKED]');
  });
});

describe('releaseNotesFor and latestChangelogVersion', () => {
  it('extracts one version without the heading or the link references, and null for a version that is not there', () => {
    expect(releaseNotesFor(OLD, '0.2.0')).toBe('### Added\n\n- First thing.');
    expect(releaseNotesFor(OLD, '9.9.9')).toBeNull();
    expect(releaseNotesFor(OLD, 'Unreleased')).toBe('');
  });

  it('skips the Unreleased heading when finding the newest version', () => {
    expect(latestChangelogVersion(OLD)).toBe('0.2.0');
    expect(latestChangelogVersion('# Changelog\n\n## [Unreleased]\n')).toBeNull();
  });
});

describe('validateChangelog (the Keep a Changelog rule, ADR 0061)', () => {
  it('accepts a well-formed changelog', () => {
    expect(validateChangelog(OLD)).toEqual([]);
  });

  const problems = (text: string) => validateChangelog(text).join(' | ');

  it('requires the header to name Keep a Changelog and Semantic Versioning, and Unreleased to come first', () => {
    expect(problems(OLD.replace('keepachangelog.com/en/1.1.0', 'example.com'))).toMatch(/Keep a Changelog/);
    expect(problems(OLD.replace('semver.org', 'example.com'))).toMatch(/Semantic Versioning/);
    expect(problems(OLD.replace('## [Unreleased]\n\n', ''))).toMatch(/Unreleased/);
  });

  it('requires ISO dates, newest first, and rejects a draft marker left behind', () => {
    expect(problems(OLD.replace('2026-11-11', '11/11/2026'))).toMatch(/heading/);
    const two = OLD.replace('## [0.2.0]', '## [0.1.0] - 2026-01-01\n\n### Added\n\n- Old.\n\n## [0.2.0]');
    expect(problems(two)).toMatch(/newest first/);
    expect(problems(OLD.replace('- First thing.', `${DRAFT_MARKER}\n- First thing.`))).toMatch(/draft/i);
  });

  it('allows only the six section headings, in order, each with at least one entry, and no empty release', () => {
    expect(problems(OLD.replace('### Added', '### Features'))).toMatch(/Features/);
    expect(problems(OLD.replace('### Added\n\n- First thing.', '### Fixed\n\n- b.\n\n### Added\n\n- a.'))).toMatch(/order/);
    expect(problems(OLD.replace('- First thing.\n', ''))).toMatch(/empty|no entries/i);
    expect(problems(OLD.replace('### Added\n\n- First thing.', 'Just prose.'))).toMatch(/empty|no entries|section/i);
  });

  it('requires a link reference for Unreleased and for every version', () => {
    expect(problems(OLD.replace(`[0.2.0]: ${REPO}/releases/tag/v0.2.0\n`, ''))).toMatch(/link reference.*0\.2\.0/);
    expect(problems(OLD.replace(`[Unreleased]: ${REPO}/compare/v0.2.0...HEAD\n`, ''))).toMatch(/link reference.*Unreleased/);
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

describe('setSpecVersion', () => {
  const spec = `{
  "openapi": "3.0.3",
  "info": {
    "title": "API",
    "version": "0.1.0",
    "description": "has a \\"version\\": \\"9\\" mention"
  },
  "paths": {
    "/a": { "get": { "responses": { "404": { "description": "x" }, "200": { "description": "y" } } } }
  }
}
`;

  it('changes only info.version, leaving the rest byte for byte (response codes stay in their order)', () => {
    const out = setSpecVersion(spec, '0.2.0');
    expect(JSON.parse(out).info.version).toBe('0.2.0');
    expect(out).toBe(spec.replace('"version": "0.1.0"', '"version": "0.2.0"'));
    expect(out.indexOf('"404"')).toBeLessThan(out.indexOf('"200"'));
  });

  it('refuses a document without info.version', () => {
    expect(() => setSpecVersion('{"paths":{}}', '1.0.0')).toThrow();
  });
});
