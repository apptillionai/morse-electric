import type { ProductValues } from "./csv-import";
import {
  formatMoney,
  formatSpecs,
  parseBool,
  parseCondition,
  parseEnclosure,
  parseMoney,
  parseNumber,
  parsePower,
  parseShipClass,
  parseSpecs,
  parseStatus,
  slugify,
  type Parsed,
} from "./product-fields";

export const PRODUCT_FORM_FIELDS = [
  "sku", "name", "slug", "category", "brand", "mfr_part_number", "condition", "status", "featured", "price",
  "core_charge", "qty", "hp", "rpm", "frame", "enclosure", "power", "voltage", "ship_class", "weight_lb",
  "family_key", "description", "specs",
] as const;
export type ProductFormField = (typeof PRODUCT_FORM_FIELDS)[number];

export type ProductFormResult =
  | { ok: true; sku: string; values: ProductValues }
  | { ok: false; fieldErrors: Partial<Record<ProductFormField, string>> };

function required(raw: string, label: string, max: number): Parsed<string> {
  const s = raw.trim();
  if (!s) return { error: `${label} is required.` };
  return s.length > max ? { error: `${label} must be ${max} characters or fewer.` } : { value: s };
}

function optional(raw: string, max: number): Parsed<string | null> {
  const s = raw.trim();
  if (!s) return { value: null };
  return s.length > max ? { error: `Must be ${max} characters or fewer.` } : { value: s };
}

/** Validate the admin product form into the same ProductValues the CSV import produces. */
export function parseProductForm(form: Record<ProductFormField, string>, categorySlugs: string[]): ProductFormResult {
  const errors: Partial<Record<ProductFormField, string>> = {};
  const take = <T,>(field: ProductFormField, result: Parsed<T>): T => {
    if (result.error !== undefined) errors[field] = result.error;
    return result.value as T;
  };

  const sku = take("sku", required(form.sku, "SKU", 80));
  const name = take("name", required(form.name, "Name", 200));
  const category = take("category", required(form.category, "Category", 80));
  if (category && !categorySlugs.includes(category)) errors.category = "Choose a category.";
  const slugInput = form.slug.trim();
  const slug = slugify(slugInput || name || "");
  if (!slug && !errors.name) errors.slug = "Enter a URL slug.";

  const values: ProductValues = {
    name,
    slug,
    category,
    brand: take("brand", optional(form.brand, 80)),
    mfr_part_number: take("mfr_part_number", optional(form.mfr_part_number, 80)),
    family_key: (() => {
      const v = take("family_key", optional(form.family_key, 80));
      return v ? slugify(v) : null;
    })(),
    description: take("description", optional(form.description, 4000)),
    condition: take("condition", parseCondition(form.condition)),
    price_cents: take("price", parseMoney(form.price)),
    core_charge_cents: take("core_charge", parseMoney(form.core_charge)),
    ship_class: take("ship_class", parseShipClass(form.ship_class)),
    weight_lb: take("weight_lb", parseNumber(form.weight_lb, "Weight")),
    hp: take("hp", parseNumber(form.hp, "HP")),
    rpm: take("rpm", parseNumber(form.rpm, "RPM", { integer: true })),
    frame: take("frame", optional(form.frame.toUpperCase(), 20)),
    enclosure: take("enclosure", parseEnclosure(form.enclosure)),
    power: take("power", parsePower(form.power)),
    voltage: take("voltage", optional(form.voltage, 60)),
    specs: take("specs", parseSpecs(form.specs)),
    featured: take("featured", parseBool(form.featured, "Featured")),
    status: take("status", parseStatus(form.status)),
    qty: take("qty", parseNumber(form.qty, "Quantity", { integer: true })),
  };

  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true, sku, values };
}

/** The form's starting values for an existing product (the inverse of parseProductForm). */
export function productToForm(sku: string, v: ProductValues): Record<ProductFormField, string> {
  const n = (x: number | null) => (x === null ? "" : String(x));
  return {
    sku,
    name: v.name,
    slug: v.slug,
    category: v.category,
    brand: v.brand ?? "",
    mfr_part_number: v.mfr_part_number ?? "",
    condition: v.condition,
    status: v.status,
    featured: v.featured ? "on" : "",
    price: formatMoney(v.price_cents),
    core_charge: formatMoney(v.core_charge_cents),
    qty: n(v.qty),
    hp: n(v.hp),
    rpm: n(v.rpm),
    frame: v.frame ?? "",
    enclosure: v.enclosure ?? "",
    power: v.power ?? "",
    voltage: v.voltage ?? "",
    ship_class: v.ship_class,
    weight_lb: n(v.weight_lb),
    family_key: v.family_key ?? "",
    description: v.description ?? "",
    specs: formatSpecs(v.specs),
  };
}

/** Blank form for a new product. */
export const EMPTY_PRODUCT_FORM = Object.fromEntries(PRODUCT_FORM_FIELDS.map((f) => [f, ""])) as Record<ProductFormField, string>;
