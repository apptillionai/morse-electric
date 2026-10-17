import type { PricedCart } from "./pricing";

/**
 * Live shipping rates: the delivery address, packing the cart into parcels,
 * and turning a carrier rate service's answer into the choices the cart
 * offers. Pure (unit-tested); the Shippo call is in shippo.ts.
 */

/** UPS and FedEx won't take a parcel heavier than this. */
export const MAX_PARCEL_LB = 150;
/** Most choices the cart shows. */
export const MAX_SHIPPING_OPTIONS = 8;

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

/** A full US address: the ship-from, and Net-30 orders' account address. */
export interface ShipAddress {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal: string;
}

/**
 * Where rates are quoted to. The cart only asks for a ZIP code: Stripe
 * Checkout collects the full address (and works out tax from it), and the
 * order keeps the quoted ZIP so staff are warned if the customer changed it.
 */
export type Destination = Partial<ShipAddress> & { postal: string };

/** "01608", "01608-1234" or " 01608 " → "01608"; null when it isn't a US ZIP code. */
export function parseZip(raw: unknown): string | null {
  const m = typeof raw === "string" ? raw.trim().match(/^(\d{5})(?:-?\d{4})?$/) : null;
  return m ? m[1] : null;
}

/** True when an address Stripe collected is in a different ZIP code from the one shipping was quoted for. */
export function shippedElsewhere(quotedZip: string | null, shipPostal: string | null): boolean {
  if (!quotedZip || !shipPostal) return false;
  return parseZip(shipPostal) !== quotedZip;
}

/** The box parcels are shipped in, from Admin → Settings. */
export interface ParcelBox {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

export interface Parcel extends ParcelBox {
  weightLb: number;
}

/**
 * Pack the cart into parcels of at most MAX_PARCEL_LB, never splitting a
 * unit, heaviest first into the first parcel with room. Null when a single
 * unit is over the limit or something has no weight (it can't go by parcel).
 */
export function packParcels(items: { weightLb: number | null; quantity: number }[], box: ParcelBox): Parcel[] | null {
  const units: number[] = [];
  for (const item of items) {
    if (item.weightLb === null || item.weightLb > MAX_PARCEL_LB) return null;
    for (let i = 0; i < Math.min(item.quantity, 999); i++) units.push(Math.max(0.1, item.weightLb));
  }
  if (!units.length) return [];
  const loads: number[] = [];
  for (const w of units.sort((a, b) => b - a)) {
    const i = loads.findIndex((load) => load + w <= MAX_PARCEL_LB);
    if (i === -1) loads.push(w);
    else loads[i] += w;
  }
  return loads.map((load) => ({ ...box, weightLb: Math.ceil(load * 10) / 10 }));
}

/**
 * Why the cart can't go by parcel at all, whatever the address: something is
 * pickup only, has no weight on file, or is too heavy for one parcel.
 */
export function parcelBlock(cart: Pick<PricedCart, "lines">): string | null {
  if (cart.lines.some((l) => l.product.shipClass === "pickup_only")) return "Something in your cart is pickup only.";
  if (cart.lines.some((l) => l.product.weightLb === null)) {
    return "We need to weigh something in your cart before we can quote shipping.";
  }
  if (cart.lines.some((l) => (l.product.weightLb ?? 0) > MAX_PARCEL_LB)) {
    return `Something in your cart is over ${MAX_PARCEL_LB} lb, too heavy for parcel carriers. Call us for a freight quote.`;
  }
  return null;
}

/** A rate as the rate service returns it (Shippo's shape, only the fields used). */
export interface CarrierRate {
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name: string; token: string };
  estimated_days?: number | null;
}

/** One way to ship the order, as the cart offers it. */
export interface ShippingOption {
  /** "ups:ups_ground": what the cart posts back; checkout re-quotes and matches it. */
  code: string;
  /** "UPS Ground" */
  label: string;
  /** Business days in transit, when the carrier says. */
  days: number | null;
  /** The rate plus the handling fee. */
  cents: number;
}

/**
 * The rates worth offering: priced in dollars, one per service (the cheapest
 * if a service repeats), cheapest first, at most MAX_SHIPPING_OPTIONS, each
 * with the handling fee added.
 */
export function shippingOptions(rates: CarrierRate[], handlingCents: number): ShippingOption[] {
  const byCode = new Map<string, ShippingOption>();
  for (const r of rates) {
    const dollars = Number(r.amount);
    const token = r.servicelevel?.token;
    if (r.currency !== "USD" || !Number.isFinite(dollars) || dollars <= 0 || !token || !r.provider) continue;
    const code = `${r.provider.toLowerCase().replace(/[^a-z0-9]+/g, "_")}:${token}`.slice(0, 120);
    const service = r.servicelevel.name?.trim() ?? token;
    const option: ShippingOption = {
      code,
      // Shippo's service names usually leave the carrier out ("Ground"), sometimes not ("USPS Priority Mail").
      label: (service.toLowerCase().startsWith(r.provider.toLowerCase()) ? service : `${r.provider} ${service}`).slice(0, 120),
      days: typeof r.estimated_days === "number" && r.estimated_days > 0 ? r.estimated_days : null,
      cents: Math.round(dollars * 100) + Math.max(0, handlingCents),
    };
    const seen = byCode.get(code);
    if (!seen || option.cents < seen.cents) byCode.set(code, option);
  }
  return [...byCode.values()]
    .sort((a, b) => a.cents - b.cents || (a.days ?? 99) - (b.days ?? 99))
    .slice(0, MAX_SHIPPING_OPTIONS);
}

/** "3 business days", "1 business day", or null. */
export const transitText = (days: number | null) =>
  days === null ? null : `${days} business day${days === 1 ? "" : "s"}`;

/** What the cart posts as `fulfillment`: "pickup", "ship" (weight bands) or "ship:<code>" (a live rate). */
export type FulfillmentChoice = { fulfillment: "pickup" } | { fulfillment: "ship"; code: string | null };

/** Anything unreadable is "ship" with no service, which checkout refuses in live mode rather than guessing. */
export function parseFulfillmentChoice(value: unknown): FulfillmentChoice {
  if (value === "pickup") return { fulfillment: "pickup" };
  const m = typeof value === "string" ? value.match(/^ship:([a-z0-9_]+:[A-Za-z0-9_.-]+)$/) : null;
  return { fulfillment: "ship", code: m && m[1].length <= 120 ? m[1] : null };
}
