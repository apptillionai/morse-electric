import { parseMoney } from "@/lib/admin/product-fields";
import type { QuoteLineValues } from "@/lib/quotes/logic";

/**
 * The staff quote editor: a plain form with numbered line rows
 * (line_0_description, line_0_qty, …), so it works without JavaScript.
 * Rows left blank are skipped.
 */

export const MAX_QUOTE_LINES = 30;
/** Blank rows the editor offers after the existing lines. */
export const BLANK_QUOTE_ROWS = 3;
export const DEFAULT_VALID_DAYS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface QuoteFormValues {
  lines: QuoteLineValues[];
  /** Null: pickup only. */
  shippingCents: number | null;
  validDays: number;
  message: string | null;
}

export type QuoteFormResult =
  | { ok: true; values: QuoteFormValues }
  | { ok: false; errors: Record<string, string> };

/** The row numbers present in the form, in order. */
function rowIndexes(form: FormData): number[] {
  const seen = new Set<number>();
  for (const key of form.keys()) {
    const m = key.match(/^line_(\d{1,2})_/);
    if (m) seen.add(Number(m[1]));
  }
  return [...seen].sort((a, b) => a - b);
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export function parseQuoteForm(form: FormData): QuoteFormResult {
  const errors: Record<string, string> = {};
  const lines: QuoteLineValues[] = [];

  for (const i of rowIndexes(form)) {
    const f = (name: string) => text(form, `line_${i}_${name}`);
    const description = f("description");
    const [qty, price, core, sku] = [f("qty"), f("price"), f("core"), f("sku")];
    if (!description) {
      if (price || core || sku) errors[`line_${i}_description`] = "Describe this line, or clear it.";
      continue;
    }
    const row = `line_${i}`;
    if (description.length > 300) errors[`${row}_description`] = "Keep the description under 300 characters.";
    if (sku.length > 80) errors[`${row}_sku`] = "Part numbers are 80 characters at most.";

    const quantity = qty === "" ? 1 : Number(qty);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) errors[`${row}_qty`] = "Quantity is a whole number from 1 to 999.";

    const unit = parseMoney(price);
    if (unit.error) errors[`${row}_price`] = unit.error;
    else if (unit.value === null) errors[`${row}_price`] = "Enter a price (0 for no charge).";
    const coreCharge = parseMoney(core);
    if (coreCharge.error) errors[`${row}_core`] = coreCharge.error;

    const productId = f("product");
    lines.push({
      productId: UUID.test(productId) ? productId : null,
      sku: sku || null,
      description,
      quantity: Number.isInteger(quantity) ? quantity : 1,
      unitPriceCents: unit.value ?? 0,
      coreChargeCents: coreCharge.value ?? 0,
    });
  }
  if (lines.length > MAX_QUOTE_LINES) errors.lines = `A quote can have at most ${MAX_QUOTE_LINES} lines.`;

  const shipping = parseMoney(text(form, "shipping"));
  if (shipping.error) errors.shipping = shipping.error;

  const daysRaw = text(form, "valid_days");
  const validDays = daysRaw === "" ? DEFAULT_VALID_DAYS : Number(daysRaw);
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) errors.valid_days = "Valid for 1 to 365 days.";

  const message = text(form, "message");
  if (message.length > 2000) errors.message = "Keep the message under 2,000 characters.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { lines, shippingCents: shipping.value ?? null, validDays, message: message || null } };
}

/** "1234.50" for a price field, "" for none. */
export const moneyField = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2));
