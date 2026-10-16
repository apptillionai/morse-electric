import type { ProductCondition, ShipClass } from "@/lib/catalog/types";
import type { CartLine } from "./cart";

/**
 * What a cart costs. Used by the cart page and by checkout, so the customer
 * is always charged what the cart page showed. Tax is added by Stripe at
 * checkout.
 */

/** A product as checkout sees it, with the real quantity available. */
export interface BuyableProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  condition: ProductCondition;
  active: boolean;
  priceCents: number | null;
  coreChargeCents: number | null;
  shipClass: ShipClass;
  weightLb: number | null;
  /** On hand minus reserved. */
  available: number;
}

/** Parcel rate for carts up to `maxLb` pounds, in ascending order. */
export interface ShippingRate {
  maxLb: number;
  cents: number;
}

export type Fulfillment = "ship" | "pickup";

/**
 * Why a product can't be bought online right now (it stays "request a
 * quote"), or null when it can. `available` is not checked here: an
 * out-of-stock item is a special order.
 */
export function onlinePurchaseBlock(p: Omit<BuyableProduct, "available"> & { available?: number }): string | null {
  if (!p.active) return "no longer listed";
  if (p.priceCents === null || p.priceCents <= 0) return "priced on request";
  // Core charges and their refunds arrive with step 2 of Phase 2.
  if (p.condition === "exchange" || (p.coreChargeCents ?? 0) > 0) return "carries a core charge";
  if (p.shipClass === "ltl") return "ships by freight";
  if (p.available !== undefined && p.available < 1) return "out of stock";
  return null;
}

/** Staff-entered rates from site_settings.shipping_rates, cleaned and sorted. Bad entries are ignored. */
export function parseShippingRates(value: unknown): ShippingRate[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((r) => {
      const maxLb = Number((r as { max_lb?: unknown })?.max_lb);
      const cents = Number((r as { cents?: unknown })?.cents);
      return Number.isFinite(maxLb) && maxLb > 0 && Number.isInteger(cents) && cents >= 0 ? [{ maxLb, cents }] : [];
    })
    .sort((a, b) => a.maxLb - b.maxLb);
}

/** The parcel rate for a total weight, or null when it's over the heaviest band. */
export function shippingRateFor(weightLb: number, rates: ShippingRate[]): number | null {
  return rates.find((r) => weightLb <= r.maxLb)?.cents ?? null;
}

export interface PricedLine {
  product: BuyableProduct;
  quantity: number;
  lineCents: number;
}

export interface CartAdjustment {
  name: string;
  /** What happened, e.g. "removed: out of stock" or "reduced to 2: only 2 in stock". */
  message: string;
}

export interface PricedCart {
  lines: PricedLine[];
  /** Lines that were dropped or reduced; the cart page explains them. */
  adjustments: CartAdjustment[];
  /** The cookie as it should now be, after adjustments. */
  cleaned: CartLine[];
  subtotalCents: number;
  /** Null when any item has no weight on file. */
  weightLb: number | null;
  shipping:
    | { available: true; cents: number }
    | { available: false; reason: string };
}

/** Price a cart against the current catalog. Pure: no I/O. */
export function priceCart(
  cart: CartLine[],
  products: Map<string, BuyableProduct>,
  rates: ShippingRate[],
): PricedCart {
  const lines: PricedLine[] = [];
  const adjustments: CartAdjustment[] = [];

  for (const line of cart) {
    const product = products.get(line.productId);
    if (!product) {
      adjustments.push({ name: "An item", message: "removed: it’s no longer in our catalog" });
      continue;
    }
    const block = onlinePurchaseBlock(product);
    if (block) {
      adjustments.push({ name: product.name, message: `removed: ${block}` });
      continue;
    }
    let quantity = line.quantity;
    if (quantity > product.available) {
      quantity = product.available;
      adjustments.push({ name: product.name, message: `reduced to ${quantity}: only ${quantity} in stock` });
    }
    lines.push({ product, quantity, lineCents: (product.priceCents ?? 0) * quantity });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const weightLb = lines.some((l) => l.product.weightLb === null)
    ? null
    : Math.round(lines.reduce((sum, l) => sum + (l.product.weightLb ?? 0) * l.quantity, 0) * 100) / 100;

  let shipping: PricedCart["shipping"];
  if (lines.some((l) => l.product.shipClass === "pickup_only")) {
    shipping = { available: false, reason: "Something in your cart is pickup only." };
  } else if (weightLb === null) {
    shipping = { available: false, reason: "We need to weigh something in your cart before we can quote shipping." };
  } else {
    const cents = shippingRateFor(weightLb, rates);
    shipping =
      cents === null
        ? { available: false, reason: "This order is too heavy for parcel shipping. Call us for a freight quote." }
        : { available: true, cents };
  }

  return {
    lines,
    adjustments,
    cleaned: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    subtotalCents,
    weightLb,
    shipping,
  };
}

/** Shipping for the chosen method, or null when that method isn't possible. */
export function shippingCents(cart: PricedCart, fulfillment: Fulfillment): number | null {
  if (fulfillment === "pickup") return 0;
  return cart.shipping.available ? cart.shipping.cents : null;
}
