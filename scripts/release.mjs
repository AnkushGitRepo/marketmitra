#!/usr/bin/env node
// Prepares a release: works out the next version from the Conventional Commits since the last `v*` tag, then updates package.json,
// package-lock.json, public/openapi.json (info.version) and CHANGELOG.md. It changes files only; it does not commit, tag or push.
//
// CHANGELOG.md follows Keep a Changelog 1.1.0 (ADR 0061): the curated entries under "## [Unreleased]" become the new version's section. If
// Unreleased is empty, a DRAFT is seeded from the commit subjects and marked; CI fails until a person rewrites it into curated entries.
//
//   npm run release             prepare the next release
//   npm run release:dry         show what would happen, change nothing
//   npm run release -- --bump minor          force a bump (major | minor | patch)
//   npm run release -- --from <ref>          first release only: where the changelog starts (there is no tag yet)
//
// The next steps are printed at the end. The logic lives in src/lib/release/release.ts (unit tested).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  applyBump,
  decideBump,
  isNewer,
  parseCommit,
  releaseChangelog,
  releaseNotesFor,
  setSpecVersion,
  versionFromReleaseSubject,
} from '../src/lib/release/release.ts';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const read = (path) => readFileSync(path, 'utf8');
const dryRun = flag('--dry-run');

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

if (!dryRun && git('status', '--porcelain', '--untracked-files=no') !== '') {
  fail('the working tree has uncommitted changes. Commit or stash them first (or use --dry-run).');
}

let lastTag = null;
try {
  lastTag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  lastTag = null;
}
const base = value('--from') ?? lastTag;
if (!base) fail('there is no v* tag yet. For the first release pass --from <ref> to say where the changelog starts.');

const raw = git('log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', `${base}..HEAD`);
const commits = raw
  .split('\x1e')
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => {
    const [, subject = '', body = ''] = r.split('\x1f');
    return { subject, body };
  })
  .filter(({ subject }) => versionFromReleaseSubject(subject) === null)
  .map(({ subject, body }) => parseCommit(subject, body))
  .filter((c) => c !== null);

const pkg = JSON.parse(read('package.json'));
const current = pkg.version;
const forced = value('--bump');
if (forced && !['major', 'minor', 'patch'].includes(forced)) fail('--bump must be major, minor or patch.');
const bump = forced ?? decideBump(commits, current);

if (!bump) {
  console.log(`Nothing to release: no feat, fix, perf or refactor commits since ${base} (docs, tests, chores and CI do not release).`);
  process.exit(0);
}

const next = applyBump(current, bump);
if (!isNewer(next, current)) fail(`computed version ${next} is not newer than ${current}.`);

let remote = 'https://github.com/AnkushGitRepo/marketmitra';
try {
  remote = git('remote', 'get-url', 'origin').replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
} catch {
  /* keep the default */
}

const date = value('--date') ?? new Date().toISOString().slice(0, 10);

let existing = null;
try {
  existing = read('CHANGELOG.md');
} catch {
  existing = null;
}
const { text: changelog, drafted } = releaseChangelog({ existing, version: next, date, commits, repoUrl: remote });

console.log(`Current version : ${current}`);
console.log(`Since            : ${base}${lastTag ? '' : ' (first release)'}`);
console.log(`Commits counted  : ${commits.length} (conventional)`);
console.log(`Bump             : ${bump}${forced ? ' (forced)' : ''}`);
console.log(`Next version     : ${next}\n`);
console.log(`## [${next}] - ${date}\n`);
console.log(`${releaseNotesFor(changelog, next)}\n`);
if (drafted) {
  console.log('Note: "## [Unreleased]" had no entries, so the section above is a DRAFT seeded from commit subjects.');
  console.log('      Rewrite it into curated entries for humans (AGENTS.md rule 9, ADR 0061) and delete the DRAFT line; CI fails while it is there.\n');
}

if (dryRun) {
  console.log('Dry run: no files changed.');
  process.exit(0);
}

// package.json: replace only the version line so the file's formatting is untouched.
writeFileSync('package.json', read('package.json').replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));

// package-lock.json: the top-level version and the root package entry.
const lock = JSON.parse(read('package-lock.json'));
lock.version = next;
if (lock.packages?.['']) lock.packages[''].version = next;
writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

// The API reference version follows the product version. Edited as text so nothing else in the file moves.
writeFileSync('public/openapi.json', setSpecVersion(read('public/openapi.json'), next));

writeFileSync('CHANGELOG.md', changelog);

console.log(`Updated package.json, package-lock.json, public/openapi.json and CHANGELOG.md for v${next}.\n`);
console.log('Next steps:');
if (drafted) console.log('  0. rewrite the DRAFT section of CHANGELOG.md into curated entries and delete the DRAFT line');
console.log(`  1. git checkout -b chore/<issue>-release-v${next}`);
console.log(`  2. git commit -am "chore(release): v${next}"   (keep this subject: the tag workflow looks for it; the " (#N)" a squash merge adds is fine)`);
console.log('  3. open a PR, let the checks pass, squash-merge it keeping that subject');
console.log(`  4. the Release workflow then tags v${next} and publishes the GitHub Release`);
console.log('  5. deploy with: npm run deploy:prod   (only with the maintainer\'s go-ahead)');
