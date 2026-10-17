/**
 * Quote rules shared by the admin, the customer's quote page and payment.
 * Pure (no database or Stripe), so they're unit-tested.
 */

import type { ChargeLine } from "@/lib/orders/checkout";

export const QUOTE_OFFER_STATUSES = ["draft", "sent", "approved", "declined", "withdrawn", "paid"] as const;
export type QuoteOfferStatus = (typeof QUOTE_OFFER_STATUSES)[number];

/** Staff-facing labels. */
export const QUOTE_OFFER_LABELS: Record<QuoteOfferStatus, string> = {
  draft: "Draft (not sent)",
  sent: "Sent, waiting for the customer",
  approved: "Approved by the customer",
  declined: "Declined",
  withdrawn: "Withdrawn",
  paid: "Paid",
};

export type QuoteKind = "parts" | "repair";

export interface QuoteLineValues {
  productId: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  /** Per unit, in cents. */
  unitPriceCents: number;
  /** Refundable core charge per unit, in cents (0 for none). */
  coreChargeCents: number;
}

export interface QuoteTotals {
  itemsCents: number;
  coreCents: number;
  /** 0 for pickup. */
  shippingCents: number;
  totalCents: number;
}

/** What a quote comes to for the chosen delivery. Tax is added at payment. */
export function quoteTotals(lines: QuoteLineValues[], shippingCents: number | null, fulfillment: "ship" | "pickup"): QuoteTotals {
  const itemsCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const coreCents = lines.reduce((sum, l) => sum + l.coreChargeCents * l.quantity, 0);
  const shipping = fulfillment === "ship" ? (shippingCents ?? 0) : 0;
  return { itemsCents, coreCents, shippingCents: shipping, totalCents: itemsCents + coreCents + shipping };
}

/** Today's date in the shop's time zone, YYYY-MM-DD (quotes are valid through their date). */
export function shopToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const isExpired = (validUntil: string, now: Date = new Date()) => validUntil < shopToday(now);

/** Repair jobs can be paid for once they're finished. */
export const REPAIR_PAYABLE_STATUSES = ["ready", "delivered", "closed"] as const;

export interface QuoteState {
  kind: QuoteKind;
  status: QuoteOfferStatus;
  validUntil: string;
  /** The service job's status, for repair quotes. */
  jobStatus?: string | null;
  lineCount: number;
}

export type CustomerStep =
  /** Repair quote waiting for a yes or no. */
  | { step: "approve" }
  /** Ready to pay (a parts quote, or an approved repair that's finished). */
  | { step: "pay" }
  /** Approved; the repair isn't finished yet. */
  | { step: "in_progress" }
  | { step: "closed"; reason: "expired" | "declined" | "withdrawn" | "paid" | "draft" | "empty" };

/** What the customer can do with a quote right now. */
export function customerStep(q: QuoteState, now: Date = new Date()): CustomerStep {
  switch (q.status) {
    case "draft":
      return { step: "closed", reason: "draft" };
    case "declined":
    case "withdrawn":
    case "paid":
      return { step: "closed", reason: q.status };
    case "sent":
      if (q.lineCount === 0) return { step: "closed", reason: "empty" };
      if (isExpired(q.validUntil, now)) return { step: "closed", reason: "expired" };
      return q.kind === "repair" ? { step: "approve" } : { step: "pay" };
    case "approved":
      // An approved repair keeps its price after the quote's date passes.
      return (REPAIR_PAYABLE_STATUSES as readonly string[]).includes(q.jobStatus ?? "") ? { step: "pay" } : { step: "in_progress" };
  }
}

/** Ways the customer can receive it. Without a shipping price, it's pickup only. */
export const deliveryOptions = (shippingCents: number | null): ("ship" | "pickup")[] =>
  shippingCents === null ? ["pickup"] : ["ship", "pickup"];

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The quote's lines, each followed by its core charge when it has one. */
export function quoteChargeLines(lines: QuoteLineValues[], returnDays: number): ChargeLine[] {
  return lines.flatMap((l) => [
    {
      name: l.description,
      ...(l.sku ? { description: `Part # ${l.sku}` } : {}),
      unitAmount: l.unitPriceCents,
      quantity: l.quantity,
      core: false,
      sku: l.sku,
    },
    ...(l.coreChargeCents > 0
      ? [
          {
            name: `Core charge (refundable): ${l.description}`,
            description: `Refunded when your old unit comes back within ${returnDays} days and passes inspection.`,
            unitAmount: l.coreChargeCents,
            quantity: l.quantity,
            core: true,
            sku: l.sku,
          },
        ]
      : []),
  ]);
}
