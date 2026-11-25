const FRAME_CLEANUP_MS = 120_000;

/**
 * Prints a complete, self-contained HTML document in an invisible frame (so no pop-up blocker is involved) and opens the browser's
 * print dialog, where "Save as PDF" makes the file. The document carries its own styles; nothing is copied from the page.
 */
export function printHtmlDocument(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  frame.onload = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), FRAME_CLEANUP_MS);
  };
  doc.open();
  doc.write(html);
  doc.close();
}
