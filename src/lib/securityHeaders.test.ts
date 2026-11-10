import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('Permissions-Policy', () => {
  it('lets this origin (and only it) use the microphone, for Mitra dictation', async () => {
    const [{ headers }] = (await nextConfig.headers?.()) ?? [{ headers: [] }];
    const policy = headers.find((h) => h.key === 'Permissions-Policy')?.value ?? '';
    expect(policy).toContain('microphone=(self)');
    expect(policy).not.toMatch(/microphone=\(\*\)/);
  });

  it('keeps every other powerful feature disabled', async () => {
    const [{ headers }] = (await nextConfig.headers?.()) ?? [{ headers: [] }];
    const policy = headers.find((h) => h.key === 'Permissions-Policy')?.value ?? '';
    for (const feature of ['camera', 'geolocation', 'payment', 'usb', 'bluetooth']) {
      expect(policy, feature).toContain(`${feature}=()`);
    }
  });
});
