import { describe, expect, it } from 'vitest';
import { htmlToText } from './pageText';

const page = (body: string, head = '<title>Report &amp; notes</title>') => `<html><head>${head}<style>p{color:red}</style></head><body>${body}</body></html>`;

describe('htmlToText', () => {
  it('reads the title and the visible text, one paragraph per line', () => {
    const out = htmlToText(page('<h1>Heading</h1><p>First   paragraph.</p><p>Second &amp; last.</p>'), 1000);
    expect(out.title).toBe('Report & notes');
    expect(out.text).toBe('Heading\nFirst paragraph.\nSecond & last.');
    expect(out.truncated).toBe(false);
  });
  it('drops scripts, styles, navigation, footers and forms', () => {
    const out = htmlToText(page('<nav>Home | About</nav><script>alert(1)</script><p>Real content here.</p><footer>Copyright</footer><form><input></form>'), 1000);
    expect(out.text).toBe('Real content here.');
  });
  it('prefers a long article over the surrounding page', () => {
    const article = `<article><p>${'Important sentence about the order. '.repeat(20)}</p></article>`;
    const out = htmlToText(page(`<div>Sidebar links and promos</div>${article}`), 5000);
    expect(out.text).toContain('Important sentence');
    expect(out.text).not.toContain('Sidebar');
  });
  it('cuts long pages and says so', () => {
    const out = htmlToText(page(`<p>${'word '.repeat(500)}</p>`), 100);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(101);
  });
  it('does not keep script text hidden in comments', () => {
    expect(htmlToText(page('<!-- <script>bad()</script> --><p>ok</p>'), 100).text).toBe('ok');
  });
  it('leaves no tag characters even from nested or broken markup', () => {
    const out = htmlToText(page('<p>a <scr<b>ipt>alert(1)</scr</b>ipt> b</p><p>1 < 2 > 0</p>'), 1000);
    expect(out.text).not.toMatch(/[<>]/);
    expect(out.text).toContain('a');
  });
  it('copes with an empty or tagless document', () => {
    expect(htmlToText('', 100)).toEqual({ title: '', text: '', truncated: false });
    expect(htmlToText('just text', 100).text).toBe('just text');
  });
});
