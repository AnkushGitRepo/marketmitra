import { renderTemplate, type TemplateName } from './render';
import { extractTitle, htmlToText } from './text';
import {
  ARROW,
  INDEX_COLOR,
  TONE_COLORS,
  alertTone,
  type AlertEmailType,
  type Direction,
  type IndexDir,
} from './tones';

// One typed builder per email. Each returns { subject, html, text }: the subject is the rendered <title>,
// the text is derived from the HTML, so the three can never disagree.

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export const DEFAULT_APP_URL = 'https://marketmitra-v2.vercel.app';

/** Only http(s) origins are accepted, so a bad env value can never produce a javascript: or data: link. */
export function normaliseAppUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s"'<>]+$/i.test(trimmed) ? trimmed : DEFAULT_APP_URL;
}

export function greetingName(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean || 'there';
}

export interface EmailContext {
  /** Public base URL of the app. */
  readonly appUrl: string;
  /** Per-recipient one-click unsubscribe link; falls back to the preferences page. */
  readonly unsubscribeUrl?: string;
  /** Postal/contact line for the footer; defaults to the app host. */
  readonly contactLine?: string;
}

/** Variables every template uses (asset base, footer links). */
export function commonVars(ctx: EmailContext): Record<string, string> {
  const base = normaliseAppUrl(ctx.appUrl);
  const preferences = `${base}/settings#notifications`;
  return {
    asset_base_url: `${base}/email`,
    preferences_url: preferences,
    unsubscribe_url: ctx.unsubscribeUrl || preferences,
    privacy_url: `${base}/privacy`,
    contact_line: ctx.contactLine?.trim() || `MarketMitra · ${new URL(base).host}`,
  };
}

function build(template: TemplateName, vars: Record<string, unknown>, opts: { strict?: boolean } = {}): RenderedEmail {
  const html = renderTemplate(template, vars, opts);
  return { subject: extractTitle(html), html, text: htmlToText(html) };
}

// ---- Welcome -------------------------------------------------------------------------------------------------

export interface WelcomeEmailInput extends EmailContext {
  readonly firstName?: string | null;
}

export function buildWelcomeEmail(input: WelcomeEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  const base = normaliseAppUrl(input.appUrl);
  return build(
    'welcome',
    {
      ...commonVars(input),
      first_name: greetingName(input.firstName),
      dashboard_url: `${base}/dashboard`,
      holdings_url: `${base}/portfolio`,
      alerts_url: `${base}/alerts`,
      mitra_url: `${base}/mitra`,
    },
    opts
  );
}

// ---- Alert ---------------------------------------------------------------------------------------------------

export interface AlertEmailInput extends EmailContext {
  readonly type: AlertEmailType;
  readonly direction: Direction;
  readonly stockName: string;
  readonly ticker: string;
  readonly exchange: 'NSE' | 'BSE';
  /** e.g. "2:41 PM IST" */
  readonly triggeredAt: string;
  /** One sentence describing what happened. */
  readonly summary: string;
  /** Formatted, e.g. "₹1,248.60" */
  readonly currentPrice: string;
  /** e.g. "at 2:41 PM" */
  readonly priceLabel: string;
  /** Formatted, without sign, e.g. "6.2%" */
  readonly changePct: string;
  /** e.g. "today" */
  readonly changePeriod: string;
  /** e.g. "Stop-loss level" */
  readonly triggerLabel: string;
  readonly triggerLevel: string;
  /** e.g. "₹3,104" */
  readonly holdingImpact: string;
  /** Words including direction, e.g. "lower today, on 40 shares" */
  readonly holdingDetail: string;
  readonly alertUrl: string;
  readonly manageAlertUrl: string;
}

export function buildAlertEmail(input: AlertEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  const tone = alertTone(input.type, input.direction);
  const colors = TONE_COLORS[tone];
  return build(
    'alert',
    {
      ...commonVars(input),
      alert_type: input.type,
      alert_tone: tone,
      tone_bg: colors.bg,
      tone_border: colors.border,
      tone_fg: colors.fg,
      direction_arrow: ARROW[input.direction],
      direction_word: input.direction,
      stock_name: input.stockName,
      ticker: input.ticker,
      exchange: input.exchange,
      triggered_at: input.triggeredAt,
      alert_summary: input.summary,
      current_price: input.currentPrice,
      price_label: input.priceLabel,
      change_pct: input.changePct,
      change_period: input.changePeriod,
      trigger_label: input.triggerLabel,
      trigger_level: input.triggerLevel,
      holding_impact: input.holdingImpact,
      holding_detail: input.holdingDetail,
      alert_url: input.alertUrl,
      manage_alert_url: input.manageAlertUrl,
    },
    opts
  );
}

// ---- Digest --------------------------------------------------------------------------------------------------

export interface IndexFigure {
  /** Formatted level, e.g. "81,106.65" */
  readonly value: string;
  /** In words, e.g. "up 0.42%" */
  readonly change: string;
  readonly dir: IndexDir;
}

export interface DigestStock {
  readonly ticker: string;
  readonly name: string;
  readonly price: string;
  readonly changeText: string;
}

export interface DigestIpo {
  readonly name: string;
  readonly dates: string;
  readonly priceBand: string;
  readonly ipoType: string;
}

export interface DigestEmailInput extends EmailContext {
  readonly period: 'Daily' | 'Weekly';
  /** e.g. "Tue, 10 Nov" */
  readonly dateLabel: string;
  readonly firstName?: string | null;
  readonly nifty50: IndexFigure;
  readonly sensex: IndexFigure;
  readonly niftybank: IndexFigure;
  readonly vix: IndexFigure;
  readonly mitraSummary: string;
  readonly gainers: readonly DigestStock[];
  readonly losers: readonly DigestStock[];
  readonly ipos?: readonly DigestIpo[];
  /** e.g. "3:30 PM IST" */
  readonly dataAsOf: string;
}

const indexVars = (prefix: string, f: IndexFigure): Record<string, string> => ({
  [`${prefix}_value`]: f.value,
  [`${prefix}_change`]: f.change,
  [`${prefix}_arrow`]: f.dir === 'loss' ? ARROW.down : f.dir === 'gain' ? ARROW.up : '–',
  [`${prefix}_color`]: INDEX_COLOR[f.dir],
  [`${prefix}_dir`]: f.dir,
});

const stockVars = (s: DigestStock) => ({ ticker: s.ticker, name: s.name, price: s.price, change_text: s.changeText });

export function buildDigestEmail(input: DigestEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  const base = normaliseAppUrl(input.appUrl);
  return build(
    'digest',
    {
      ...commonVars(input),
      digest_period: input.period,
      digest_date: input.dateLabel,
      first_name: greetingName(input.firstName),
      ...indexVars('nifty50', input.nifty50),
      ...indexVars('sensex', input.sensex),
      ...indexVars('niftybank', input.niftybank),
      ...indexVars('vix', input.vix),
      mitra_summary: input.mitraSummary,
      mitra_url: `${base}/mitra`,
      gainers: input.gainers.map(stockVars),
      losers: input.losers.map(stockVars),
      ipos: (input.ipos ?? []).map((i) => ({ name: i.name, dates: i.dates, price_band: i.priceBand, ipo_type: i.ipoType })),
      dashboard_url: `${base}/dashboard`,
      data_as_of: input.dataAsOf,
    },
    opts
  );
}

// ---- What's new ----------------------------------------------------------------------------------------------

export interface WhatsNewEmailInput extends EmailContext {
  /** e.g. "November 2026" */
  readonly month: string;
  readonly title: string;
  /** Path under /email/, e.g. "hero-whatsnew.png", or a full https URL. */
  readonly heroImage: string;
  readonly heroImageAlt: string;
  readonly featureTitle: string;
  readonly featureBody: string;
  readonly featureUrl: string;
  readonly items: readonly { readonly title: string; readonly body: string }[];
  readonly changelogUrl: string;
}

export function buildWhatsNewEmail(input: WhatsNewEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  const common = commonVars(input);
  return build(
    'whats-new',
    {
      ...common,
      update_month: input.month,
      update_title: input.title,
      hero_image_url: heroUrl(common.asset_base_url, input.heroImage),
      hero_image_alt: input.heroImageAlt,
      feature_title: input.featureTitle,
      feature_body: input.featureBody,
      feature_url: input.featureUrl,
      items: input.items.map((i) => ({ title: i.title, body: i.body })),
      changelog_url: input.changelogUrl,
    },
    opts
  );
}

// ---- Promo ---------------------------------------------------------------------------------------------------

/** Path under /email/ (e.g. "hero-opensource.png") or an explicit https URL. */
function heroUrl(assetBase: string, image: string): string {
  return /^https:\/\//i.test(image) ? image : `${assetBase}/${image.replace(/^\/+/, '')}`;
}

export interface PromoEmailInput extends EmailContext {
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
  readonly note?: string;
  readonly preheader: string;
  /** Defaults to the shipped open-source hero. */
  readonly heroImage?: string;
  readonly heroImageAlt: string;
}

export function buildPromoEmail(input: PromoEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  const common = commonVars(input);
  return build(
    'promo',
    {
      ...common,
      hero_image_url: heroUrl(common.asset_base_url, input.heroImage ?? 'hero-opensource.png'),
      promo_eyebrow: input.eyebrow,
      promo_headline: input.headline,
      promo_body: input.body,
      cta_label: input.ctaLabel,
      cta_url: input.ctaUrl,
      promo_note: input.note ?? '',
      promo_preheader: input.preheader,
      hero_image_alt: input.heroImageAlt,
    },
    opts
  );
}

// ---- Account emails (Clerk sends these today; see ADR 0040) --------------------------------------------------

export interface VerifyEmailInput extends EmailContext {
  readonly email: string;
  readonly expiryMinutes: number;
  readonly verifyUrl: string;
}

export function buildVerifyEmail(input: VerifyEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  return build('verify-email', { ...commonVars(input), email: input.email, expiry_minutes: input.expiryMinutes, verify_url: input.verifyUrl }, opts);
}

export interface PasswordResetEmailInput extends EmailContext {
  readonly email: string;
  readonly expiryMinutes: number;
  readonly resetUrl: string;
}

export function buildPasswordResetEmail(input: PasswordResetEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  return build('password-reset', { ...commonVars(input), email: input.email, expiry_minutes: input.expiryMinutes, reset_url: input.resetUrl }, opts);
}

// ---- Mitra summary -------------------------------------------------------------------------------------------

export interface MitraSummaryEmailInput extends EmailContext {
  /** e.g. "3–9 Nov" */
  readonly periodLabel: string;
  readonly firstName?: string | null;
  readonly questionsCount: number;
  readonly alertsTriggered: number;
  readonly holdingsCount: number;
  readonly watchlistCount: number;
  /** The last few questions. */
  readonly questions: readonly { readonly text: string; readonly askedAt: string; readonly url: string }[];
}

export function buildMitraSummaryEmail(input: MitraSummaryEmailInput, opts?: { strict?: boolean }): RenderedEmail {
  const base = normaliseAppUrl(input.appUrl);
  return build(
    'mitra-summary',
    {
      ...commonVars(input),
      period_label: input.periodLabel,
      first_name: greetingName(input.firstName),
      questions_count: input.questionsCount,
      alerts_triggered: input.alertsTriggered,
      holdings_count: input.holdingsCount,
      watchlist_count: input.watchlistCount,
      questions: input.questions.map((q) => ({ text: q.text, asked_at: q.askedAt, url: q.url })),
      mitra_url: `${base}/mitra`,
    },
    opts
  );
}
