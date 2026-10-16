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
