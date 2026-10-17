import "server-only";

import type { CarrierRate, Destination, Parcel, ShipAddress } from "./shipping";

/**
 * Shippo's rate API: one call returns UPS, FedEx and USPS rates for a
 * shipment. Rating is free; labels (bought later, by staff) are paid.
 * https://docs.goshippo.com/docs/shipments/shipmentsandrates/
 */

const SHIPPO_SHIPMENTS = "https://api.goshippo.com/shipments/";
const TIMEOUT_MS = 8000;
/** A quote stays good this long, so the price a customer saw is the price checkout charges. */
export const QUOTE_TTL_MS = 10 * 60 * 1000;

export interface RateRequest {
  from: ShipAddress;
  /** A ZIP code is enough for a quote; the rest is sent when known. */
  to: Destination;
  parcels: Parcel[];
}

export type RateResult = { ok: true; rates: CarrierRate[] } | { ok: false; error: string; unavailable: boolean };

const shippoAddress = (a: Destination) => ({
  ...(a.name ? { name: a.name } : {}),
  ...(a.line1 ? { street1: a.line1 } : {}),
  ...(a.line2 ? { street2: a.line2 } : {}),
  ...(a.city ? { city: a.city } : {}),
  ...(a.state ? { state: a.state } : {}),
  zip: a.postal,
  country: "US",
});

/** The body Shippo's POST /shipments/ takes. */
export function shippoShipmentBody(req: RateRequest) {
  return {
    address_from: shippoAddress(req.from),
    address_to: shippoAddress(req.to),
    parcels: req.parcels.map((p) => ({
      length: String(p.lengthIn),
      width: String(p.widthIn),
      height: String(p.heightIn),
      distance_unit: "in",
      weight: String(p.weightLb),
      mass_unit: "lb",
    })),
    async: false,
  };
}

/**
 * Ask Shippo for rates. `unavailable` means Shippo couldn't be reached or
 * refused the request (the cart falls back to the weight bands); otherwise
 * it answered but had no rate, usually because of the address.
 */
export async function fetchShippoRates(req: RateRequest, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<RateResult> {
  let response: Response;
  try {
    response = await fetchImpl(SHIPPO_SHIPMENTS, {
      method: "POST",
      headers: { Authorization: `ShippoToken ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(shippoShipmentBody(req)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    return { ok: false, unavailable: true, error: error instanceof Error ? error.message : String(error) };
  }
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, unavailable: true, error: `Shippo ${response.status}: ${text}` };
  }
  const body = (await response.json().catch(() => null)) as { rates?: CarrierRate[]; messages?: { text?: string }[] } | null;
  const rates = Array.isArray(body?.rates) ? body.rates : [];
  if (!rates.length) {
    const why = (body?.messages ?? []).map((m) => m.text).filter(Boolean).join(" ").slice(0, 300);
    return { ok: false, unavailable: false, error: why || "No rates for this address." };
  }
  return { ok: true, rates };
}

const quotes = new Map<string, { at: number; result: RateResult }>();

/** fetchShippoRates, remembering answers for QUOTE_TTL_MS (per server instance). Failures aren't remembered. */
export async function quoteRates(req: RateRequest, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<RateResult> {
  const key = JSON.stringify(shippoShipmentBody(req));
  const now = Date.now();
  const hit = quotes.get(key);
  if (hit && now - hit.at < QUOTE_TTL_MS) return hit.result;
  const result = await fetchShippoRates(req, apiKey, fetchImpl);
  if (result.ok) {
    if (quotes.size >= 500) quotes.delete(quotes.keys().next().value!);
    quotes.set(key, { at: now, result });
  }
  return result;
}
