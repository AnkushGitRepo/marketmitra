// `propose_holding_change` (#337, ADR 0080): Mitra proposes adding, updating or removing a holding, and the user confirms it on a
// card. The model never writes: the card calls the same holdings API as the Portfolio page. Pure helpers, so they test without mocks.

import { z } from 'zod';

export const HOLDING_PROPOSAL_TOOL = 'propose_holding_change';
export const HOLDING_ACTIONS = ['add', 'update', 'remove'] as const;
export type HoldingAction = (typeof HOLDING_ACTIONS)[number];

const SYMBOL_RE = /^[A-Z0-9&.-]{1,20}$/;

export const holdingProposalSchema = z
  .object({
    action: z.enum(HOLDING_ACTIONS),
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((s) => s.toUpperCase())
      .refine((s) => SYMBOL_RE.test(s), 'Use the NSE trading symbol, such as TCS.'),
    /** The new total number of shares (not the change). Required to add or update. */
    quantity: z.number().positive().optional(),
    /** The new average buy price per share in ₹. Required to add or update. */
    avgPrice: z.number().positive().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.action === 'remove') return;
    if (p.quantity === undefined) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'quantity is required to add or update a holding' });
    if (p.avgPrice === undefined) ctx.addIssue({ code: 'custom', path: ['avgPrice'], message: 'avgPrice is required to add or update a holding' });
  });

export type HoldingProposal = z.infer<typeof holdingProposalSchema>;

export interface HoldingRow {
  readonly id: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly avgPrice: number;
}

export type HoldingProposalOutput =
  | {
      readonly status: 'awaiting_confirmation';
      readonly action: HoldingAction;
      readonly symbol: string;
      /** The existing holding this changes; null when adding. */
      readonly holdingId: string | null;
      readonly current: { readonly quantity: number; readonly avgPrice: number } | null;
    }
  | { readonly status: 'rejected'; readonly reason: string };

/** Checks a proposal against the user's holdings. Nothing is written; the result tells the card (and the model) what is being confirmed. */
export function checkProposal(proposal: HoldingProposal, holdings: readonly HoldingRow[]): HoldingProposalOutput {
  const held = holdings.find((h) => h.symbol.toUpperCase() === proposal.symbol) ?? null;
  if (proposal.action === 'add' && held) {
    return { status: 'rejected', reason: `${proposal.symbol} is already in the portfolio (${held.quantity} shares at ₹${held.avgPrice}). Propose an update with the new totals instead.` };
  }
  if (proposal.action !== 'add' && !held) {
    return { status: 'rejected', reason: `${proposal.symbol} is not in the portfolio, so there is nothing to ${proposal.action}.` };
  }
  return {
    status: 'awaiting_confirmation',
    action: proposal.action,
    symbol: proposal.symbol,
    holdingId: held?.id ?? null,
    current: held ? { quantity: held.quantity, avgPrice: held.avgPrice } : null,
  };
}

/** The proposal and its check result as stored on a tool part, or null while it streams, is malformed or was rejected. */
export function parseProposalPart(part: { readonly input?: unknown; readonly output?: unknown }): { proposal: HoldingProposal; output: Extract<HoldingProposalOutput, { status: 'awaiting_confirmation' }> } | null {
  const proposal = holdingProposalSchema.safeParse(part.input);
  const out = part.output as Partial<HoldingProposalOutput> | undefined;
  if (!proposal.success || out?.status !== 'awaiting_confirmation') return null;
  return { proposal: proposal.data, output: out as Extract<HoldingProposalOutput, { status: 'awaiting_confirmation' }> };
}

export interface HoldingRequest {
  readonly method: 'POST' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly body: { symbol?: string; quantity: number; avgPrice: number } | null;
}

/** The holdings API call a confirmed card makes, using the quantity and price as the user left them. */
export function requestFor(output: Extract<HoldingProposalOutput, { status: 'awaiting_confirmation' }>, quantity: number, avgPrice: number): HoldingRequest {
  if (output.action === 'add') return { method: 'POST', url: '/api/holdings', body: { symbol: output.symbol, quantity, avgPrice } };
  const url = `/api/holdings/${encodeURIComponent(output.holdingId ?? '')}`;
  return output.action === 'update' ? { method: 'PATCH', url, body: { quantity, avgPrice } } : { method: 'DELETE', url, body: null };
}

/** True when both numbers are usable as typed: positive and finite. */
export function validEntry(quantity: number, avgPrice: number): boolean {
  return Number.isFinite(quantity) && quantity > 0 && Number.isFinite(avgPrice) && avgPrice > 0;
}

const VERB: Record<HoldingAction, { done: string; cancelled: string }> = {
  add: { done: 'Added', cancelled: 'adding' },
  update: { done: 'Updated', cancelled: 'updating' },
  remove: { done: 'Removed', cancelled: 'removing' },
};

/** The message the card sends when answered, so the conversation (and the model) knows what happened. */
export function outcomeText(action: HoldingAction, symbol: string, outcome: 'confirmed' | 'cancelled', quantity?: number, avgPrice?: number): string {
  if (outcome === 'cancelled') return `Cancelled: I did not confirm ${VERB[action].cancelled} ${symbol}. Nothing was changed.`;
  if (action === 'remove') return `Confirmed: ${symbol} was removed from my portfolio.`;
  return `Confirmed: ${VERB[action].done.toLowerCase()} ${symbol} as ${quantity} shares at an average of ₹${avgPrice}.`;
}

type PartLike = { readonly type: string };

/** True when a reply carries a holding card that is waiting for the user. */
export function hasProposal(parts: readonly PartLike[]): boolean {
  return parts.some((p) => p.type === `tool-${HOLDING_PROPOSAL_TOOL}`);
}
