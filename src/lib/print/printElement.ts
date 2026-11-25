import { buildPrintDocument } from './printDocument';

const FRAME_CLEANUP_MS = 60_000;

/** Opens the print dialog for one element in an invisible frame (so no pop-up blocker is involved). */
export function printElement(element: HTMLElement, title: string): void {
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
  const headHtml = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join('');
  doc.open();
  doc.write(buildPrintDocument({ title, headHtml, bodyHtml: element.outerHTML }));
  doc.close();
  // Wait for the copied stylesheets, then print.
  frame.onload = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), FRAME_CLEANUP_MS);
  };
}
