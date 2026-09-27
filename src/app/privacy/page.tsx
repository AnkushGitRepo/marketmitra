// Drafted to reflect what this codebase actually does (hosted vs.
// self-hosted data flows), not generic boilerplate. This is a starting
// point, not a finished legal document — have it reviewed by a real
// lawyer for your jurisdiction before treating it as final. See the
// session log entry for this build for the specific facts it's based on.

import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/landing/LegalPageLayout';
import styles from '@/components/landing/LegalPageLayout.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How MarketMitra handles data in hosted and self-hosted mode.',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout eyebrow="Legal" title="Privacy Policy" updated="12 September 2026">
      <p className={styles.notice}>
        MarketMitra runs two different ways — <strong>hosted</strong> (our deployment) and{' '}
        <strong>self-hosted</strong> (your own deployment, on your own infrastructure) — and what
        happens to your data is genuinely different between them. This policy describes both
        separately rather than blurring them into one generic statement.
      </p>

      <h2>1. If you use the hosted version (marketmitra-v2.vercel.app)</h2>
      <p>
        This section applies only when you use MarketMitra&apos;s own hosted deployment. It does
        not apply to anyone running their own self-hosted instance — see §2.
      </p>
      <p><strong>Account and authentication.</strong> Sign-in is handled by Clerk, a third-party
      identity provider. Clerk processes your email address and authentication credentials under
      its own privacy policy; we never see or store your password. Clerk sets a session cookie
      required for you to stay signed in — this is strictly necessary for the service to function
      and isn&apos;t an optional/marketing cookie.</p>
      <p><strong>Portfolio and app data.</strong> Holdings, alerts, notes, saved chat history, and
      your AI provider settings are stored in our MongoDB Atlas database, associated with your
      account. Your AI provider API key is encrypted at rest (AES-256-GCM) before storage and
      decrypted only server-side, only to make the request you asked for.</p>
      <p><strong>AI features (bring-your-own-key).</strong> When you use an AI insight, the Mitra
      chat, research briefs, or multi-agent analysis, the relevant prompt — which may include your
      portfolio holdings, a stock symbol, or your chat message — is sent to the AI provider
      <em> you configured</em> (Google Gemini, Anthropic, or OpenRouter) using <em>your own</em> API
      key. That provider processes the request under its own privacy policy; MarketMitra does not
      operate or see traffic through any AI model itself. If you don&apos;t add a key, these
      features simply aren&apos;t available to you — nothing is sent anywhere.</p>
      <p><strong>Market data.</strong> Public market data (quotes, fundamentals, news, IPOs) is
      served by our fundamentals-api service and free upstream data sources — this is public
      financial information, not personal data about you.</p>
      <p><strong>Email and webhooks.</strong> If you set up alert notifications, the alert content
      may be sent via Resend (email) or to a webhook URL you provide (e.g. a Telegram/Discord/Slack
      incoming webhook) — only to destinations you configure.</p>
      <p><strong>Analytics.</strong> The hosted deployment uses Vercel Web Analytics, which is
      cookieless — it does not use tracking cookies or any identifier that can single you out
      across sites, and only aggregated, anonymised page-view data is collected. See{' '}
      <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noreferrer">
        Vercel&apos;s Web Analytics privacy documentation
      </a>{' '}
      for detail.</p>
      <p><strong>Performance monitoring.</strong> The hosted deployment also uses Vercel Speed
      Insights to measure page load performance (Core Web Vitals). Like the analytics above, it
      cannot reconstruct your browsing session or identify you — it records route, approximate
      device/network type, country, and page-speed metrics, with no cookie and no cross-site
      identifier. See{' '}
      <a href="https://vercel.com/docs/speed-insights/privacy-policy" target="_blank" rel="noreferrer">
        Vercel&apos;s Speed Insights privacy documentation
      </a>{' '}
      for detail.</p>
      <p><strong>Rate limiting.</strong> Requests are keyed transiently (by account or IP) against
      an Upstash Redis store purely to enforce fair-use limits; this isn&apos;t used for tracking
      and expires on its own short window.</p>
      <p><strong>Data retention and deletion.</strong> Your data is retained while your account
      exists. To request deletion of your account and associated data, contact us via the channel
      in §5.</p>

      <h2>2. If you self-host MarketMitra</h2>
      <p>
        MarketMitra is open-source (MIT licensed) specifically so you can run your own instance.
        In self-hosted mode:
      </p>
      <ul>
        <li>There is no sign-in and no MarketMitra account — the app runs as a single local user.</li>
        <li>Your portfolio, holdings, alerts, and notes are stored in a MongoDB database <em>you</em>
        provide and control — not one operated by us. We have no access to it.</li>
        <li>If you configure an AI provider key, prompts go directly from your own deployment to
        the AI provider you chose, using your own key — never through MarketMitra&apos;s
        infrastructure.</li>
        <li>Market data is fetched from the fundamentals-api service you point your deployment at
        — by default this may be our hosted instance of that service (which serves only public
        market data, not your personal data) unless you also self-host that service yourself.</li>
        <li>No analytics or tracking is included in self-hosted mode by default, and none should
        be added without your own explicit configuration — this is a deliberate design choice, not
        an oversight.</li>
      </ul>
      <p>In short: for a self-hosted instance, MarketMitra (the project maintainers) receive no
      data about you or your usage at all, beyond the public GitHub repository traffic anyone
      running any open-source project can see.</p>

      <h2>3. What we never do</h2>
      <ul>
        <li>We never sell personal data.</li>
        <li>We never use your portfolio data, notes, or chat history to train any model.</li>
        <li>We never invent or infer investment advice from your data — see our guardrail on every
        AI-generated response.</li>
      </ul>

      <h2>4. Your rights</h2>
      <p>Depending on your jurisdiction, you may have rights to access, correct, export, or delete
      your personal data. For the hosted version, contact us (§5) to exercise these. For
      self-hosted instances, you already have direct control over your own database.</p>

      <h2>5. Contact</h2>
      <p>For privacy questions or data-deletion requests regarding the hosted deployment, open an
      issue on our <a href="https://github.com/AnkushGitRepo/marketmitra" target="_blank" rel="noreferrer">GitHub repository</a>{' '}
      marked confidential, or use GitHub&apos;s private security advisory form linked from our{' '}
      <a href="https://github.com/AnkushGitRepo/marketmitra/security/policy" target="_blank" rel="noreferrer">security policy</a>.</p>

      <h2>6. Changes to this policy</h2>
      <p>We may update this policy as the product changes. Material changes will be reflected
      here with an updated date at the top of this page.</p>
    </LegalPageLayout>
  );
}
