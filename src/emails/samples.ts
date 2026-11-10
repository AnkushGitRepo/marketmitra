import {
  buildAlertEmail,
  buildDigestEmail,
  buildMitraSummaryEmail,
  buildPasswordResetEmail,
  buildPromoEmail,
  buildVerifyEmail,
  buildWelcomeEmail,
  buildWhatsNewEmail,
  type RenderedEmail,
} from './emails';

// Clearly-labelled sample data for the admin gallery and the tests. Nothing here is real market data.

export interface SampleEmail {
  readonly id: string;
  readonly label: string;
  readonly group: 'Onboarding' | 'Alerts' | 'Updates' | 'Account';
  readonly note: string;
  readonly build: (appUrl: string, opts?: { strict?: boolean }) => RenderedEmail;
}

const gain = (value: string, change: string) => ({ value, change, dir: 'gain' as const });

const alertBase = {
  stockName: 'Sample Industries Ltd',
  ticker: 'SAMPLE',
  exchange: 'NSE' as const,
  triggeredAt: '2:41 PM IST',
  priceLabel: 'at 2:41 PM',
  changePeriod: 'today',
  holdingImpact: '₹3,104',
  alertUrl: '/alerts',
  manageAlertUrl: '/alerts',
};

export const SAMPLE_EMAILS: readonly SampleEmail[] = [
  {
    id: 'welcome',
    label: 'Welcome',
    group: 'Onboarding',
    note: 'Sent once to each new hosted user.',
    build: (appUrl, opts) => buildWelcomeEmail({ appUrl, firstName: 'Priya' }, opts),
  },
  {
    id: 'alert-stoploss',
    label: 'Alert: stop-loss',
    group: 'Alerts',
    note: 'Tone: loss.',
    build: (appUrl, opts) =>
      buildAlertEmail(
        {
          appUrl,
          ...alertBase,
          alertUrl: `${appUrl}/alerts`,
          manageAlertUrl: `${appUrl}/alerts`,
          type: 'STOP-LOSS',
          direction: 'down',
          summary: 'Sample Industries fell to your stop-loss level during today’s session.',
          currentPrice: '₹1,248.60',
          changePct: '6.2%',
          triggerLabel: 'Stop-loss level',
          triggerLevel: '₹1,250.00',
          holdingDetail: 'lower today, on 40 shares',
        },
        opts
      ),
  },
  {
    id: 'alert-drawdown',
    label: 'Alert: drawdown',
    group: 'Alerts',
    note: 'Tone: warn.',
    build: (appUrl, opts) =>
      buildAlertEmail(
        {
          appUrl,
          ...alertBase,
          alertUrl: `${appUrl}/alerts`,
          manageAlertUrl: `${appUrl}/alerts`,
          type: 'DRAWDOWN',
          direction: 'down',
          summary: 'Sample Industries is down 12% over the last 20 sessions, past your drawdown limit.',
          currentPrice: '₹1,104.20',
          changePct: '12%',
          changePeriod: 'over 20 sessions',
          triggerLabel: 'Drawdown limit',
          triggerLevel: '10%',
          holdingDetail: 'lower over 20 sessions, on 40 shares',
        },
        opts
      ),
  },
  {
    id: 'alert-target',
    label: 'Alert: price target',
    group: 'Alerts',
    note: 'Tone: gain.',
    build: (appUrl, opts) =>
      buildAlertEmail(
        {
          appUrl,
          ...alertBase,
          alertUrl: `${appUrl}/alerts`,
          manageAlertUrl: `${appUrl}/alerts`,
          type: 'PRICE TARGET',
          direction: 'up',
          summary: 'Sample Industries rose to your price target.',
          currentPrice: '₹1,512.00',
          changePct: '3.1%',
          triggerLabel: 'Price target',
          triggerLevel: '₹1,500.00',
          holdingDetail: 'higher today, on 40 shares',
        },
        opts
      ),
  },
  {
    id: 'digest',
    label: 'Market digest',
    group: 'Updates',
    note: 'Daily or weekly. Not sent yet: needs scheduling and opt-in.',
    build: (appUrl, opts) =>
      buildDigestEmail(
        {
          appUrl,
          period: 'Daily',
          dateLabel: 'Tue, 10 Nov',
          firstName: 'Priya',
          nifty50: gain('25,044.65', 'up 0.06%'),
          sensex: gain('81,106.65', 'up 0.10%'),
          niftybank: gain('59,741.25', 'up 1.11%'),
          vix: { value: '17.42', change: 'down 0.29%', dir: 'neutral' },
          mitraSummary: 'Sample summary: banks led the session while IT lagged. Sample text only.',
          gainers: [
            { ticker: 'ALPHA', name: 'Alpha Ltd', price: '₹812.40', changeText: 'up 4.2%' },
            { ticker: 'BETA', name: 'Beta Ltd', price: '₹1,320.00', changeText: 'up 3.1%' },
            { ticker: 'GAMMA', name: 'Gamma Ltd', price: '₹455.10', changeText: 'up 2.4%' },
          ],
          losers: [
            { ticker: 'DELTA', name: 'Delta Ltd', price: '₹210.30', changeText: 'down 3.8%' },
            { ticker: 'EPSILON', name: 'Epsilon Ltd', price: '₹98.75', changeText: 'down 2.9%' },
            { ticker: 'ZETA', name: 'Zeta Ltd', price: '₹1,045.00', changeText: 'down 2.2%' },
          ],
          ipos: [{ name: 'Sample Holdings', dates: '12–14 Nov', priceBand: '₹180–190', ipoType: 'Mainboard' }],
          dataAsOf: '3:30 PM IST',
        },
        opts
      ),
  },
  {
    id: 'mitra-summary',
    label: 'Mitra activity summary',
    group: 'Updates',
    note: 'Weekly. Not sent yet: needs scheduling and opt-in.',
    build: (appUrl, opts) =>
      buildMitraSummaryEmail(
        {
          appUrl,
          periodLabel: '3–9 Nov',
          firstName: 'Priya',
          questionsCount: 12,
          alertsTriggered: 3,
          holdingsCount: 13,
          watchlistCount: 6,
          questions: [
            { text: 'How is my portfolio doing today?', askedAt: 'Mon', url: `${appUrl}/mitra` },
            { text: 'Compare two banks on margins', askedAt: 'Wed', url: `${appUrl}/mitra` },
            { text: 'What should I check before an IPO?', askedAt: 'Fri', url: `${appUrl}/mitra` },
          ],
        },
        opts
      ),
  },
  {
    id: 'whats-new',
    label: 'What’s new',
    group: 'Updates',
    note: 'Product update. Not sent yet: needs an audience and opt-in.',
    build: (appUrl, opts) =>
      buildWhatsNewEmail(
        {
          appUrl,
          month: 'November 2026',
          title: 'Sample update headline',
          heroImage: 'hero-whatsnew.png',
          heroImageAlt: 'Illustration of the new features',
          featureTitle: 'Sample headline feature',
          featureBody: 'One or two sentences about the headline feature. Sample text only.',
          featureUrl: `${appUrl}/mitra`,
          items: [
            { title: 'Smaller update one', body: 'A short description. Sample text.' },
            { title: 'Smaller update two', body: 'Another short description. Sample text.' },
          ],
          changelogUrl: 'https://github.com/AnkushGitRepo/marketmitra/commits/main',
        },
        opts
      ),
  },
  {
    id: 'promo',
    label: 'Promotional / announcement',
    group: 'Updates',
    note: 'Marketing. Not sent yet: needs an audience and opt-in.',
    build: (appUrl, opts) =>
      buildPromoEmail(
        {
          appUrl,
          eyebrow: 'Open source',
          headline: 'Sample announcement headline',
          body: 'One or two sentences with the message. Sample text only.',
          ctaLabel: 'Star us on GitHub',
          ctaUrl: 'https://github.com/AnkushGitRepo/marketmitra',
          note: 'Free and open source.',
          preheader: 'A short inbox preview line.',
          heroImageAlt: 'Open source illustration',
        },
        opts
      ),
  },
  {
    id: 'verify-email',
    label: 'Verify email',
    group: 'Account',
    note: 'Clerk sends this today; using this design needs Clerk custom emails.',
    build: (appUrl, opts) => buildVerifyEmail({ appUrl, email: 'priya@example.com', expiryMinutes: 15, verifyUrl: `${appUrl}/sign-in` }, opts),
  },
  {
    id: 'password-reset',
    label: 'Password reset',
    group: 'Account',
    note: 'Clerk sends this today; using this design needs Clerk custom emails.',
    build: (appUrl, opts) => buildPasswordResetEmail({ appUrl, email: 'priya@example.com', expiryMinutes: 15, resetUrl: `${appUrl}/sign-in` }, opts),
  },
];
