import { describe, expect, it } from 'vitest';
import { previewNotificationBody } from './notificationPreview';

describe('previewNotificationBody', () => {
  it('keeps a short single-line body as one line with nothing hidden', () => {
    expect(previewNotificationBody('RELIANCE crossed ₹2,900')).toEqual({ lines: ['RELIANCE crossed ₹2,900'], hidden: 0 });
  });
  it('splits a multi-line body into rows, drops blanks and turns "- " bullets into dots', () => {
    const body = 'Priority\n- ACC: Results out\n- PNB: Big drop\n\nOvernight developments\n- IGL: Gas price cut';
    expect(previewNotificationBody(body, 4)).toEqual({
      lines: ['Priority', '• ACC: Results out', '• PNB: Big drop', 'Overnight developments'],
      hidden: 1,
    });
  });
  it('clips a long line with an ellipsis', () => {
    const { lines } = previewNotificationBody(`- ${'x'.repeat(200)}`, 4, 50);
    expect(lines[0]).toHaveLength(50);
    expect(lines[0].endsWith('…')).toBe(true);
  });
  it('handles an empty body', () => {
    expect(previewNotificationBody('  \n ')).toEqual({ lines: [], hidden: 0 });
  });
});
