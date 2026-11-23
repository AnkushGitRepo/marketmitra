// The agent folders (.claude, .cursor, .agent, .agents) are committed so any contributor's agent works on this repo (#291, #308). The skills are the same
// files in all four, and none of these folders may hold a secret.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CANONICAL = '.claude/skills';
const MIRRORS = ['.cursor/skills', '.agent/skills', '.agents/skills'] as const;
const AGENT_PATHS = ['.claude/settings.json', '.claude/skills', '.cursor', '.agent', '.agents', '.vscode', 'CURSOR.md', 'GEMINI.md', 'CLAUDE.md', 'AGENTS.md'] as const;

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /AIza[0-9A-Za-z_-]{30,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bsk_(live|test)_[A-Za-z0-9]{10,}/,
  /\bgh[ps]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /mongodb(\+srv)?:\/\/[^\s"'<]+:[^\s"'<@]+@/,
  /postgres(ql)?:\/\/[^\s"'<]+:[^\s"'<@]+@/,
  /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./,
  /vercel_[A-Za-z0-9]{20,}/,
  /whsec_[A-Za-z0-9]{10,}/,
];

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

const skillNames = (dir: string): string[] => readdirSync(join(ROOT, dir)).filter((n) => statSync(join(ROOT, dir, n)).isDirectory()).sort();

describe('project skills', () => {
  it('has the canonical skills', () => {
    expect(skillNames(CANONICAL).length).toBeGreaterThan(0);
  });

  it.each(MIRRORS)('%s has exactly the canonical skills, byte for byte (run `npm run agents:sync`)', (mirror) => {
    expect(skillNames(mirror)).toEqual(skillNames(CANONICAL));
    for (const name of skillNames(CANONICAL)) {
      const want = readFileSync(join(ROOT, CANONICAL, name, 'SKILL.md'), 'utf8');
      expect(readFileSync(join(ROOT, mirror, name, 'SKILL.md'), 'utf8'), `${mirror}/${name}`).toBe(want);
    }
  });

  it('every skill has frontmatter whose name is its folder and a description', () => {
    for (const name of skillNames(CANONICAL)) {
      const text = readFileSync(join(ROOT, CANONICAL, name, 'SKILL.md'), 'utf8');
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
      expect(front, name).toMatch(new RegExp(`^name: ${name}$`, 'm'));
      expect(front, name).toMatch(/^description: .{20,}$/m);
    }
  });
});

describe('agent folders', () => {
  it('hold no secret-like strings', () => {
    const hits = AGENT_PATHS.flatMap(files).flatMap((file) => {
      const text = readFileSync(join(ROOT, file), 'utf8');
      return SECRET_PATTERNS.filter((p) => p.test(text)).map((p) => `${file}: ${p.source.slice(0, 24)}`);
    });
    expect(hits).toEqual([]);
  });

  it('the shared Claude settings are valid JSON and never open .env files', () => {
    const settings = JSON.parse(readFileSync(join(ROOT, '.claude/settings.json'), 'utf8')) as { permissions: { allow: string[]; deny: string[] } };
    expect(settings.permissions.deny).toContain('Read(./.env.local)');
    expect(settings.permissions.allow.some((rule) => /\.env/.test(rule))).toBe(false);
  });

  it('keeps AGENTS.md under Codex\'s default 32 KiB instruction limit, so nothing is cut off', () => {
    expect(statSync(join(ROOT, 'AGENTS.md')).size).toBeLessThan(32 * 1024);
  });

  it('keeps Antigravity rules as a pointer, not a second rulebook', () => {
    const rule = readFileSync(join(ROOT, '.agent/rules/marketmitra.md'), 'utf8');
    expect(rule).toMatch(/AGENTS\.md/);
    expect(rule.split('\n').length).toBeLessThan(20);
  });
});
