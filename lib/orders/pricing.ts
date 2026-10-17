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
  /** Quantity prices, ascending by quantity (products.price_breaks). */
  priceBreaks: PriceBreak[];
  /** On hand minus reserved. */
  available: number;
}

/** "5 or more at $650 each". */
export interface PriceBreak {
  minQty: number;
  priceCents: number;
}

/** A customer's price tier: a discount off list prices that staff give them. */
export interface CustomerPricing {
  tierName: string;
  /** 0–50, up to two decimals. */
  discountPercent: number;
}

/** Why a unit costs what it does: the list price, a quantity price or the customer's tier. */
export type PriceBasis = "list" | "volume" | "tier";

export interface UnitPrice {
  unitCents: number;
  listCents: number;
  basis: PriceBasis;
}

/** Quantity prices as stored (products.price_breaks), cleaned and sorted. Bad entries are ignored. */
export function parsePriceBreaks(value: unknown): PriceBreak[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((b) => {
      const minQty = Number((b as { min_qty?: unknown })?.min_qty);
      const priceCents = Number((b as { price_cents?: unknown })?.price_cents);
      return Number.isInteger(minQty) && minQty >= 2 && Number.isInteger(priceCents) && priceCents > 0
        ? [{ minQty, priceCents }]
        : [];
    })
    .sort((a, b) => a.minQty - b.minQty);
}

/** A price_tiers embed (to-one, but typed as either) as CustomerPricing. */
export function tierOf(embed: unknown): CustomerPricing | null {
  const tier = (Array.isArray(embed) ? embed[0] : embed) as { name: string; discount_percent: number | string } | null | undefined;
  return tier ? { tierName: tier.name, discountPercent: Number(tier.discount_percent) } : null;
}

/** The list price less a tier discount, to the nearest cent. */
export function tierPriceCents(listCents: number, discountPercent: number): number {
  const basisPoints = Math.round(Math.min(100, Math.max(0, discountPercent)) * 100);
  return Math.round((listCents * (10000 - basisPoints)) / 10000);
}

/**
 * What one unit costs at this quantity: the lowest of the list price, the
 * quantity price the order reaches and the customer's tier price. Discounts
 * never stack. Null when the product is priced on request.
 */
export function unitPriceFor(
  product: { priceCents: number | null; priceBreaks: PriceBreak[] },
  quantity: number,
  pricing: CustomerPricing | null,
): UnitPrice | null {
  const listCents = product.priceCents;
  if (listCents === null) return null;
  let best: UnitPrice = { unitCents: listCents, listCents, basis: "list" };
  const reached = product.priceBreaks.filter((b) => quantity >= b.minQty).at(-1);
  if (reached && reached.priceCents < best.unitCents) best = { unitCents: reached.priceCents, listCents, basis: "volume" };
  if (pricing && pricing.discountPercent > 0) {
    const tier = tierPriceCents(listCents, pricing.discountPercent);
    if (tier < best.unitCents) best = { unitCents: tier, listCents, basis: "tier" };
  }
  return best;
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
export function onlinePurchaseBlock(p: Omit<BuyableProduct, "available" | "priceBreaks"> & { available?: number }): string | null {
  if (!p.active) return "no longer listed";
  if (p.priceCents === null || p.priceCents <= 0) return "priced on request";
  // An exchange unit is priced on the customer returning their old one.
  if (p.condition === "exchange" && !((p.coreChargeCents ?? 0) > 0)) return "needs a core charge set";
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

/** A few words on why a unit costs less than list, for the cart and receipts. Null at list price. */
export function priceNote(
  unit: UnitPrice,
  product: { priceBreaks: PriceBreak[] },
  quantity: number,
  pricing: CustomerPricing | null,
): string | null {
  if (unit.basis === "tier" && pricing) return `${pricing.tierName} price (${formatPercent(pricing.discountPercent)} off)`;
  if (unit.basis === "volume") {
    const reached = product.priceBreaks.filter((b) => quantity >= b.minQty).at(-1);
    return reached ? `Price for ${reached.minQty} or more` : null;
  }
  return null;
}

/** The next quantity price that would beat what the customer pays now, if any. */
export function nextPriceBreak(product: { priceBreaks: PriceBreak[] }, quantity: number, unit: UnitPrice): PriceBreak | null {
  return product.priceBreaks.find((b) => b.minQty > quantity && b.priceCents < unit.unitCents) ?? null;
}

/** 10 → "10%", 12.5 → "12.5%". */
export const formatPercent = (n: number) => `${Number(n.toFixed(2))}%`;

export interface PricedLine {
  product: BuyableProduct;
  quantity: number;
  /** What each unit costs this customer at this quantity. */
  unit: UnitPrice;
  lineCents: number;
  /** Refundable core charge for the line (charge × quantity), 0 when none. */
  coreCents: number;
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
  /** Items only. */
  subtotalCents: number;
  /** Refundable core charges, charged on top of the subtotal. */
  coreCents: number;
  /** Null when any item has no weight on file. */
  weightLb: number | null;
  shipping:
    | { available: true; cents: number }
    | { available: false; reason: string };
}

/**
 * Price a cart against the current catalog, at the customer's prices when
 * they have a tier (null for guests and list-price customers). Pure: no I/O.
 */
export function priceCart(
  cart: CartLine[],
  products: Map<string, BuyableProduct>,
  rates: ShippingRate[],
  pricing: CustomerPricing | null = null,
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
    // onlinePurchaseBlock has already ruled out a missing price.
    const unit = unitPriceFor(product, quantity, pricing)!;
    lines.push({
      product,
      quantity,
      unit,
      lineCents: unit.unitCents * quantity,
      coreCents: Math.max(0, product.coreChargeCents ?? 0) * quantity,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const coreCents = lines.reduce((sum, l) => sum + l.coreCents, 0);
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
    coreCents,
    weightLb,
    shipping,
  };
}

/** Shipping for the chosen method, or null when that method isn't possible. */
export function shippingCents(cart: PricedCart, fulfillment: Fulfillment): number | null {
  if (fulfillment === "pickup") return 0;
  return cart.shipping.available ? cart.shipping.cents : null;
}
