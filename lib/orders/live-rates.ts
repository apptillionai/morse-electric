import "server-only";

import { SITE } from "@/lib/site";
import { getSiteSettings } from "@/lib/site-settings";
import type { PricedCart } from "./pricing";
import { quoteRates } from "./shippo";
import {
  packParcels,
  parcelBlock,
  shippingOptions,
  type Destination,
  type ParcelBox,
  type ShipAddress,
  type ShippingOption,
} from "./shipping";

/**
 * Whether the cart quotes live carrier rates, and the quote itself. Live
 * rates are on when staff switch them on in /admin/settings, SHIPPO_API_KEY
 * is set and the business address (the ship-from) is complete. Otherwise
 * the weight bands price shipping, as before.
 */

export interface LiveRatesConfig {
  apiKey: string;
  from: ShipAddress;
  box: ParcelBox;
  handlingCents: number;
}

export async function liveRatesConfig(): Promise<LiveRatesConfig | null> {
  const apiKey = process.env.SHIPPO_API_KEY;
  if (!apiKey) return null;
  const settings = await getSiteSettings();
  const b = settings.business;
  if (!settings.liveRatesEnabled || !b.street || !b.city || !b.state || !b.postalCode) return null;
  return {
    apiKey,
    from: { name: SITE.name, line1: b.street, line2: null, city: b.city, state: b.state, postal: b.postalCode },
    box: settings.parcelBox,
    handlingCents: settings.handlingCents,
  };
}

/** The code the cart uses for the weight-band price when Shippo can't be reached. */
export const FALLBACK_CODE = "flat:ground";

export type ShippingQuote =
  /** The cart can't go by parcel (or no carrier could quote the address); pickup only. */
  | { kind: "blocked"; reason: string }
  /** Live rates are on but there's no ZIP code yet. */
  | { kind: "address" }
  | { kind: "options"; options: ShippingOption[]; notice: string | null };

/**
 * Live shipping choices for a cart and address. When Shippo can't be reached,
 * the weight-band price is offered instead (if the bands cover the order), so
 * checkout never stops because a rate service is down.
 */
export async function quoteShipping(
  cart: PricedCart,
  to: Destination | null,
  config: LiveRatesConfig,
  quote: typeof quoteRates = quoteRates,
): Promise<ShippingQuote> {
  const block = parcelBlock(cart);
  if (block) return { kind: "blocked", reason: block };
  if (!to) return { kind: "address" };
  const parcels = packParcels(
    cart.lines.map((l) => ({ weightLb: l.product.weightLb, quantity: l.quantity })),
    config.box,
  );
  if (!parcels?.length) return { kind: "blocked", reason: "We can’t ship this order by parcel. Call us for a freight quote." };

  const result = await quote({ from: config.from, to, parcels }, config.apiKey);
  if (result.ok) {
    const options = shippingOptions(result.rates, config.handlingCents);
    if (options.length) return { kind: "options", options, notice: null };
  } else if (!result.unavailable) {
    console.error("[shipping] no rates:", result.error);
    return {
      kind: "blocked",
      reason: "No carrier could quote that ZIP code. Check it, or choose pickup and call us to arrange delivery.",
    };
  } else {
    console.error("[shipping] Shippo unavailable:", result.error);
  }
  return cart.shipping.available
    ? {
        kind: "options",
        options: [{ code: FALLBACK_CODE, label: "Ground shipping (UPS or FedEx)", days: null, cents: cart.shipping.cents }],
        notice: "Live carrier rates aren’t available right now, so this is our standard ground rate.",
      }
    : { kind: "blocked", reason: "We can’t get shipping rates right now. Choose pickup, or call us to arrange delivery." };
}
