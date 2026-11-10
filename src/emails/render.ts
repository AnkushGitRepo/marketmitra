import { readFileSync } from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';

// Email system (ADR 0040): the supplied designed templates live in src/emails/templates/*.html and are rendered
// with Handlebars. `{{var}}` is HTML-escaped by Handlebars, and no template uses triple-stash, so a value can
// never inject markup. Templates are cached per process.

export const TEMPLATE_NAMES = [
  'welcome',
  'alert',
  'digest',
  'whats-new',
  'promo',
  'verify-email',
  'password-reset',
  'mitra-summary',
] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

/** The leading comment documents variables using literal `{{#each}}` / `{{#if}}`, which Handlebars would try to parse. */
export function stripDocComment(source: string): string {
  return source.replace(/^(\s*<!DOCTYPE[^>]*>\s*)<!--[\s\S]*?-->/i, '$1');
}

const compiled = new Map<string, Handlebars.TemplateDelegate>();

function load(name: TemplateName, strict: boolean): Handlebars.TemplateDelegate {
  const key = `${name}:${strict}`;
  let fn = compiled.get(key);
  if (!fn) {
    const source = stripDocComment(readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8'));
    fn = Handlebars.compile(source, { strict });
    compiled.set(key, fn);
  }
  return fn;
}

/**
 * Renders one template. `strict` (used by tests) throws on any variable the data does not provide;
 * production renders leniently so one missing optional value can never block a send.
 */
export function renderTemplate(name: TemplateName, vars: Record<string, unknown>, opts: { strict?: boolean } = {}): string {
  return load(name, opts.strict === true)(vars);
}
