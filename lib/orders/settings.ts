import type { ShippingRate } from "./pricing";

/** Rows of weight bands on /admin/settings. */
export const RATE_ROWS = 6;

export const RATE_FIELDS = Array.from({ length: RATE_ROWS }, (_, i) => [`rate_lb_${i}`, `rate_price_${i}`] as const).flat();

export type RateParse = { ok: true; rates: { max_lb: number; cents: number }[] } | { ok: false; errors: Record<string, string> };

/**
 * Read the shipping bands from the settings form: each row is "up to N lb
 * costs $X". Blank rows are skipped; a half-filled or invalid row is an error.
 */
export function parseRateRows(values: Record<string, string>): RateParse {
  const errors: Record<string, string> = {};
  const rates: { max_lb: number; cents: number }[] = [];
  for (let i = 0; i < RATE_ROWS; i++) {
    const lbText = (values[`rate_lb_${i}`] ?? "").trim();
    const priceText = (values[`rate_price_${i}`] ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
    if (!lbText && !priceText) continue;
    const lb = Number(lbText);
    const price = Number(priceText);
    if (!lbText || !Number.isFinite(lb) || lb <= 0 || lb > 10000) errors[`rate_lb_${i}`] = "Enter a weight in pounds.";
    if (!priceText || !Number.isFinite(price) || price < 0 || price > 10000) errors[`rate_price_${i}`] = "Enter a price, e.g. 15 or 15.50.";
    if (!errors[`rate_lb_${i}`] && !errors[`rate_price_${i}`]) rates.push({ max_lb: lb, cents: Math.round(price * 100) });
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const sorted = rates.sort((a, b) => a.max_lb - b.max_lb);
  const duplicate = sorted.findIndex((r, i) => i > 0 && r.max_lb === sorted[i - 1].max_lb);
  if (duplicate !== -1) return { ok: false, errors: { rate_lb_0: "Two bands have the same weight." } };
  return { ok: true, rates: sorted };
}

/** The saved bands as form values (dollars, no symbol). */
export function rateRowValues(rates: ShippingRate[]): Record<string, string> {
  return Object.fromEntries(
    rates.slice(0, RATE_ROWS).flatMap((r, i) => [
      [`rate_lb_${i}`, String(r.maxLb)],
      [`rate_price_${i}`, (r.cents / 100).toFixed(2)],
    ]),
  );
}

/** Live shipping rate options on /admin/settings. */
export const LIVE_RATE_FIELDS = ["live_rates_enabled", "parcel_length", "parcel_width", "parcel_height", "handling_fee"] as const;
type LiveRateField = (typeof LIVE_RATE_FIELDS)[number];

export interface LiveRateColumns {
  live_rates_enabled: boolean;
  parcel_length_in: number;
  parcel_width_in: number;
  parcel_height_in: number;
  handling_cents: number;
}

export type LiveRateParse = { ok: true; columns: LiveRateColumns } | { ok: false; errors: Partial<Record<LiveRateField, string>> };

/** The switch, the default box (inches, one decimal) and the handling fee added to every live rate. */
export function parseLiveRateFields(values: Partial<Record<LiveRateField, string>>): LiveRateParse {
  const errors: Partial<Record<LiveRateField, string>> = {};
  const inches = (field: "parcel_length" | "parcel_width" | "parcel_height") => {
    const n = Number((values[field] ?? "").trim());
    if (!Number.isFinite(n) || n < 1 || n > 108) {
      errors[field] = "Enter inches from 1 to 108.";
      return 0;
    }
    return Math.round(n * 10) / 10;
  };
  const length = inches("parcel_length");
  const width = inches("parcel_width");
  const height = inches("parcel_height");
  const feeText = (values.handling_fee ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  const fee = feeText === "" ? 0 : Number(feeText);
  if (!Number.isFinite(fee) || fee < 0 || fee > 1000) errors.handling_fee = "Enter a fee from $0 to $1,000, e.g. 5 or 7.50.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    columns: {
      live_rates_enabled: values.live_rates_enabled === "on",
      parcel_length_in: length,
      parcel_width_in: width,
      parcel_height_in: height,
      handling_cents: Math.round(fee * 100),
    },
  };
}
