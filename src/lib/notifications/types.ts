// Generic notification subsystem (ADR 0014 §2). Alerts are the first
// producer; Phase 7 (IPO/GMP) and Phase 8 (AI insights) reuse this by
// passing a different `kind`.

export type NotificationKind = 'alert' | 'ipo' | 'insight' | 'system';

export type DeliveryChannel = 'in_app' | 'email' | 'webhook' | 'slack' | 'telegram' | 'whatsapp';

export interface NotificationPayload {
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app deep link, e.g. `/dashboard/stock/RELIANCE`. */
  href?: string | null;
  /** Free-form context kept for rendering/debugging (alert id, symbol…). */
  meta?: Record<string, unknown>;
}

export interface Notification extends NotificationPayload {
  id: string;
  userId: string;
  href: string | null;
  meta: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

export interface ChannelResult {
  channel: DeliveryChannel;
  status: 'sent' | 'skipped' | 'error';
  detail?: string;
}
