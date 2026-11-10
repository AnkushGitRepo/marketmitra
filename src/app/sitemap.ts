import type { MetadataRoute } from 'next';

// Deliberately just the public marketing pages. The app pages (including
// stock detail pages) are not listed: in hosted mode they're behind Clerk
// auth, so a crawler can't reach it anyway, and a self-hosted instance is
// a private individual deployment, not something meant to be indexed by
// search engines. Listing auth-gated URLs in a public sitemap would be
// actively misleading, not just unhelpful.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://marketmitra-v2.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: APP_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${APP_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${APP_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
