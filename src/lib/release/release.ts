// Version and changelog logic for `npm run release`. Pure (no git, no files, no clock), so it is easy to test.
// Imports use relative paths with no aliases because the release script runs this file directly under Node.

export type CommitType = 'feat' | 'fix' | 'perf' | 'refactor' | 'docs' | 'test' | 'chore' | 'ci' | 'build' | 'style' | 'revert';
export type Bump = 'major' | 'minor' | 'patch';

export interface Commit {
  readonly type: CommitType;
  readonly scope: string | null;
  readonly description: string;
  /** Pull request number from a trailing "(#123)", when present. */
  readonly pr: number | null;
  readonly breaking: boolean;
}

const KNOWN_TYPES: readonly string[] = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'ci', 'build', 'style', 'revert'];
const SUBJECT = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+?)(?:\s+\(#(\d+)\))?\s*$/;
const BREAKING_BODY = /^BREAKING[ -]CHANGE:/m;

/** A Conventional Commit, or null for anything else (merge commits, "Update README", reverts without a type). */
export function parseCommit(subject: string, body = ''): Commit | null {
  const m = SUBJECT.exec(subject.trim());
  if (!m || !KNOWN_TYPES.includes(m[1])) return null;
  return {
    type: m[1] as CommitType,
    scope: m[2] ?? null,
    description: m[4],
    pr: m[5] ? Number(m[5]) : null,
    breaking: m[3] === '!' || BREAKING_BODY.test(body),
  };
}

export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function parseVersion(version: string): Semver {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) throw new Error(`Not a plain MAJOR.MINOR.PATCH version: "${version}"`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function formatVersion(v: Semver): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * What the commits call for, or null when nothing user-visible changed (docs, tests, chores and CI alone do not release).
 * Below 1.0.0 a breaking change bumps minor: major is reserved for declaring the API stable.
 */
export function decideBump(commits: readonly Commit[], current: string): Bump | null {
  if (commits.some((c) => c.breaking)) return parseVersion(current).major >= 1 ? 'major' : 'minor';
  if (commits.some((c) => c.type === 'feat')) return 'minor';
  if (commits.some((c) => c.type === 'fix' || c.type === 'perf' || c.type === 'refactor')) return 'patch';
  return null;
}

export function applyBump(current: string, bump: Bump): string {
  const v = parseVersion(current);
  if (bump === 'major') return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
  if (bump === 'minor') return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
  return formatVersion({ ...v, patch: v.patch + 1 });
}

/** Whether `candidate` is strictly newer than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}

// The changelog follows Keep a Changelog 1.1.0 (ADR 0061): written for humans, an [Unreleased] section on top, one dated section per version
// (newest first), only these six headings, and link references at the bottom. The commits are only a starting point for a draft.

export const CHANGELOG_TYPES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'] as const;
export type ChangelogType = (typeof CHANGELOG_TYPES)[number];

export const CHANGELOG_HEADER = `# Changelog

All notable changes to MarketMitra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;

/** Put in a section seeded from commit subjects; CI fails while it is present, so a person must curate the entries first. */
export const DRAFT_MARKER = '<!-- DRAFT: seeded from commit subjects. Rewrite into curated entries for humans (ADR 0061), then delete this line. -->';

const SECURITY_WORDS = /\b(security|vulnerabilit\w*|cve-\d+|xss|csrf|ssrf|injection|codeql|exploit\w*)\b/i;

/** The section a commit belongs to, or null for noise (docs, tests, chores, CI, style, build, reverts). A guide for the draft, not a verdict. */
function sectionFor(c: Commit): ChangelogType | null {
  if (c.type === 'docs' || c.type === 'test' || c.type === 'chore' || c.type === 'ci' || c.type === 'style' || c.type === 'build' || c.type === 'revert') return null;
  if (c.breaking) return 'Changed';
  if (c.scope === 'security' || SECURITY_WORDS.test(c.description)) return 'Security';
  if (c.type === 'feat') return 'Added';
  if (c.type === 'fix') return 'Fixed';
  return 'Changed'; // perf, refactor
}

/** A sentence for the reader: capitalised, ending in a full stop, with the PR link. */
function entry(c: Commit, repoUrl: string): string {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  const breaking = c.breaking ? '**Breaking:** ' : '';
  const text = c.description.charAt(0).toUpperCase() + c.description.slice(1);
  const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
  const pr = c.pr !== null ? ` ([#${c.pr}](${repoUrl}/pull/${c.pr}))` : '';
  return `- ${scope}${breaking}${sentence}${pr}`;
}

/** The body of a draft section: only the headings that have entries, in the guide's order. Empty when nothing is notable. */
export function renderDraftBody(commits: readonly Commit[], repoUrl: string): string {
  const out: string[] = [];
  for (const type of CHANGELOG_TYPES) {
    const items = commits.filter((c) => sectionFor(c) === type);
    if (items.length > 0) out.push(`### ${type}`, '', ...items.map((c) => entry(c, repoUrl)), '');
  }
  return out.join('\n').trimEnd().concat(out.length > 0 ? '\n' : '');
}

export interface ParsedChangelog {
  readonly header: string;
  /** The text under "## [Unreleased]", trimmed. */
  readonly unreleased: string;
  /** Newest first. `heading` is the full "## [X.Y.Z] - date" line, kept verbatim (so a [YANKED] marker survives). */
  readonly versions: readonly { readonly version: string; readonly heading: string; readonly body: string }[];
}

const REFERENCE_LINE = /^\[[^\]\n]+\]:\s*\S+\s*$/;

/** Everything before the trailing block of "[label]: url" lines, and that block's labels. */
function splitReferences(text: string): { body: string; labels: string[] } {
  const lines = text.replace(/\s+$/, '').split('\n');
  const labels: string[] = [];
  while (lines.length > 0 && (REFERENCE_LINE.test(lines[lines.length - 1]) || lines[lines.length - 1].trim() === '')) {
    const last = lines.pop() as string;
    const m = /^\[([^\]\n]+)\]:/.exec(last);
    if (m) labels.push(m[1]);
  }
  return { body: lines.join('\n'), labels };
}

export function parseChangelog(text: string): ParsedChangelog {
  const { body } = splitReferences(text);
  const parts = body.split(/^(?=## \[)/m);
  const header = (parts[0].startsWith('## [') ? '' : parts.shift() ?? '').replace(/\s+$/, '\n');
  let unreleased = '';
  const versions: { version: string; heading: string; body: string }[] = [];
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trimEnd();
    const rest = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    if (/^## \[Unreleased\]/i.test(heading)) unreleased = rest;
    else {
      const m = /^## \[([^\]]+)\]/.exec(heading);
      if (m) versions.push({ version: m[1], heading, body: rest });
    }
  }
  return { header, unreleased, versions };
}

/** "[Unreleased]" compares the newest tag with HEAD, each version compares with the previous one, and the oldest links to its tag. */
export function linkReferences(versionsNewestFirst: readonly string[], repoUrl: string): string {
  if (versionsNewestFirst.length === 0) return '';
  const lines = [`[Unreleased]: ${repoUrl}/compare/v${versionsNewestFirst[0]}...HEAD`];
  versionsNewestFirst.forEach((v, i) => {
    const previous = versionsNewestFirst[i + 1];
    lines.push(previous ? `[${v}]: ${repoUrl}/compare/v${previous}...v${v}` : `[${v}]: ${repoUrl}/releases/tag/v${v}`);
  });
  return `${lines.join('\n')}\n`;
}

/**
 * The changelog after a release: the curated [Unreleased] entries become the new version's section and a fresh empty [Unreleased] is left
 * on top. If [Unreleased] is empty, a draft is seeded from the commits and marked, for the release PR to rewrite. Older sections are kept
 * byte for byte; the link references are regenerated.
 */
// Markdown links to the two specs the header must cite (matched as whole links, not as a substring of some other URL).
const KAC_LINK = /\]\(https:\/\/keepachangelog\.com\/en\/1\.1\.0\/?\)/;
const SEMVER_LINK = /\]\(https:\/\/semver\.org\/spec\/v2\.0\.0\.html\)/;

export function releaseChangelog({ existing, version, date, commits, repoUrl }: { existing: string | null; version: string; date: string; commits: readonly Commit[]; repoUrl: string }): { text: string; drafted: boolean } {
  const parsed = existing ? parseChangelog(existing) : { header: CHANGELOG_HEADER, unreleased: '', versions: [] };
  const header = KAC_LINK.test(parsed.header) ? parsed.header : CHANGELOG_HEADER;
  let body = parsed.unreleased.trim();
  let drafted = false;
  if (body === '') {
    drafted = true;
    body = `${DRAFT_MARKER}\n\n${renderDraftBody(commits, repoUrl)}`.trimEnd();
  }
  const sections = [{ heading: `## [${version}] - ${date}`, body, version }, ...parsed.versions];
  const text = [
    header.trimEnd(),
    '',
    '## [Unreleased]',
    '',
    ...sections.flatMap((v) => [v.heading, '', v.body.trim(), '']),
    linkReferences(sections.map((v) => v.version), repoUrl).trimEnd(),
    '',
  ].join('\n');
  return { text, drafted };
}

/** The notes for one version (its section without the heading or the link references), or null when it is not in the changelog. */
export function releaseNotesFor(changelog: string, version: string): string | null {
  const parsed = parseChangelog(changelog);
  if (version.toLowerCase() === 'unreleased') return parsed.unreleased;
  return parsed.versions.find((v) => v.version === version)?.body ?? null;
}

const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})( \[YANKED\])?$/;

/** The problems with a changelog against the Keep a Changelog rule (ADR 0061). An empty list means it is well formed. */
export function validateChangelog(text: string): string[] {
  const problems: string[] = [];
  const { body, labels } = splitReferences(text);
  const parsed = parseChangelog(text);
  if (!KAC_LINK.test(parsed.header)) problems.push('the header must say it follows Keep a Changelog 1.1.0');
  if (!SEMVER_LINK.test(parsed.header)) problems.push('the header must say it follows Semantic Versioning');
  if (/<!--\s*DRAFT/i.test(text)) problems.push('a draft marker is still in the file: rewrite the seeded entries for humans, then delete the marker');
  const firstHeading = /^## \[([^\]]+)\]/m.exec(body)?.[1];
  if (firstHeading?.toLowerCase() !== 'unreleased') problems.push('the first section must be "## [Unreleased]"');

  const checkSections = (label: string, content: string, required: boolean) => {
    const headings = [...content.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
    if (required && headings.length === 0) problems.push(`${label} has no entries (a release needs at least one section)`);
    let last = -1;
    for (const h of headings) {
      const at = (CHANGELOG_TYPES as readonly string[]).indexOf(h);
      if (at === -1) problems.push(`${label}: "### ${h}" is not one of ${CHANGELOG_TYPES.join(', ')}`);
      else if (at <= last) problems.push(`${label}: sections are out of order or repeated at "### ${h}" (order: ${CHANGELOG_TYPES.join(', ')})`);
      else last = at;
    }
    for (const part of content.split(/^(?=### )/m).filter((x) => x.startsWith('### '))) {
      if (!/^- /m.test(part)) problems.push(`${label}: "${part.split('\n')[0].trim()}" has no entries`);
    }
  };
  checkSections('[Unreleased]', parsed.unreleased, false);

  let previous: string | null = null;
  for (const v of parsed.versions) {
    const m = VERSION_HEADING.exec(v.heading);
    if (!m) {
      problems.push(`heading "${v.heading}" must look like "## [X.Y.Z] - YYYY-MM-DD" (optionally followed by [YANKED])`);
      continue;
    }
    if (previous !== null && !isNewer(previous, m[1])) problems.push(`versions must be newest first: ${m[1]} comes after ${previous}`);
    previous = m[1];
    checkSections(`[${m[1]}]`, v.body, true);
    if (!labels.includes(m[1])) problems.push(`missing the link reference "[${m[1]}]: ..." at the bottom`);
  }
  if (!labels.includes('Unreleased')) problems.push('missing the link reference "[Unreleased]: ..." at the bottom');
  return problems;
}

/** The newest version heading in a changelog, e.g. "0.2.0". */
export function latestChangelogVersion(changelog: string): string | null {
  return /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1] ?? null;
}

/** "chore(release): v0.2.0" -> "0.2.0"; null for any other subject. A trailing "(#123)" (added by a squash merge) is allowed. */
export function versionFromReleaseSubject(subject: string): string | null {
  return /^chore\(release\): v(\d+\.\d+\.\d+)(?:\s+\(#\d+\))?\s*$/.exec(subject.trim())?.[1] ?? null;
}

/**
 * Sets `info.version` in the OpenAPI document as TEXT, touching nothing else. (Round-tripping through JSON.parse/stringify would
 * reorder integer-like keys such as "201" and "404" and turn every release into a noisy diff.)
 */
export function setSpecVersion(specText: string, version: string): string {
  const pattern = /("info":\s*\{[^}]*?"version":\s*")[^"]*(")/;
  if (!pattern.test(specText)) throw new Error('openapi.json has no info.version to update');
  return specText.replace(pattern, `$1${version}$2`);
}
