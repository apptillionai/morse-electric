/**
 * Price tiers: named discounts off list prices ("Contractor", 10%) that staff
 * give customers. Pure form parsing here (unit-tested); reads and writes go
 * through the staff session, so RLS is the gate.
 */

export const MAX_TIER_DISCOUNT = 50;

export interface PriceTier {
  id: string;
  name: string;
  discount_percent: number;
  /** How many customers are on it. */
  customers: number;
}

export interface TierValues {
  name: string;
  discount_percent: number;
}

export type TierFormResult =
  | { ok: true; values: TierValues }
  | { ok: false; errors: Partial<Record<"name" | "discount", string>> };

/** "Contractor", "10" or "12.5%" → a tier. */
export function parseTierForm(form: { name: string; discount: string }): TierFormResult {
  const errors: Partial<Record<"name" | "discount", string>> = {};
  const name = form.name.trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Name the tier, e.g. Contractor.";
  else if (name.length > 60) errors.name = "Keep the name to 60 characters.";
  const raw = form.discount.trim().replace(/%$/, "").trim();
  const discount = /^\d{1,2}(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
  if (!(discount > 0 && discount <= MAX_TIER_DISCOUNT)) {
    errors.discount = `Enter a discount from 0.01% to ${MAX_TIER_DISCOUNT}%, e.g. 10 or 12.5.`;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values: { name, discount_percent: discount } };
}
