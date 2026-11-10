// Plain-text alternative for an HTML email (every send includes one: better deliverability and accessibility).
// Deliberately simple: strip styling and hidden preheaders, keep links as "text (url)", keep paragraph breaks.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rarr: '→', larr: '←',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', zwnj: '', copy: '©',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** The decoded `<title>`, used as the email subject so the subject and the document title never drift. */
export function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

/** Applies a removal until the string stops changing, so nested input like `<<script>script>` cannot leave a tag behind. */
function removeUntilStable(input: string, pattern: RegExp): string {
  let previous: string;
  let current = input;
  do {
    previous = current;
    current = current.replace(pattern, '');
  } while (current !== previous);
  return current;
}

export function htmlToText(html: string): string {
  let s = removeUntilStable(html, /<!--[\s\S]*?-->/g); // comments, including Outlook conditionals
  s = removeUntilStable(s, /<head[\s\S]*?<\/head>/gi);
  s = removeUntilStable(s, /<(script|style|noscript)[\s\S]*?<\/\1>/gi);
  // Hidden preheader / spacer blocks repeat the body and would read as noise.
  s = removeUntilStable(s, /<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi);
  s = s
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const label = decodeEntities(removeUntilStable(inner, /<[^>]+>/g)).replace(/\s+/g, ' ').trim();
      const url = decodeEntities(href).trim();
      if (!label) return '';
      if (!/^https?:/i.test(url) || label === url) return label;
      return `${label} (${url})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table|section)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ');
  s = removeUntilStable(s, /<[^>]+>/g);
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim();
}
