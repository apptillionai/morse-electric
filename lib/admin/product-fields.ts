import type { Enclosure, PowerSupply, ProductCondition, ShipClass, SpecLine } from "@/lib/catalog/types";

/**
 * Lenient parsers shared by the product form and the CSV import, so staff can
 * type values the way they appear on nameplates and spreadsheets.
 * Each returns { value } or { error } with a message meant for staff.
 */

export type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const clean = (raw: string | null | undefined) => (raw ?? "").trim();
const key = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function slugify(raw: string): string {
  return raw
    // Nameplate fractions first: NFKD would turn ½ into "1⁄2".
    .replace(/½/g, "-5")
    .replace(/¼/g, "-25")
    .replace(/¾/g, "-75")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

/** "$1,234.50", "1234.5", "" → cents. Empty is null ("price on request"). */
export function parseMoney(raw: string): Parsed<number | null> {
  const s = clean(raw).replace(/^\$/, "").replace(/,/g, "");
  if (!s) return { value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `“${raw}” is not a price (use 1234.50)` };
  return { value: Math.round(Number(s) * 100) };
}

/** Optional non-negative number with up to `decimals` places, e.g. HP 7.5 or ½. */
export function parseNumber(raw: string, label: string, { integer = false } = {}): Parsed<number | null> {
  const s = clean(raw).replace(/,/g, "").replace(/^(\d*)\s*½$/, (_, w) => `${w || 0}.5`).replace(/^(\d*)\s*¼$/, (_, w) => `${w || 0}.25`).replace(/^(\d*)\s*¾$/, (_, w) => `${w || 0}.75`);
  if (!s) return { value: null };
  const fraction = s.match(/^(\d+)\/(\d+)$/);
  const n = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(s);
  if (!Number.isFinite(n) || n < 0) return { error: `${label} “${raw}” is not a number` };
  if (integer && !Number.isInteger(n)) return { error: `${label} “${raw}” must be a whole number` };
  return { value: integer ? n : Math.round(n * 1000) / 1000 };
}

const CONDITION_ALIASES: Record<string, ProductCondition> = {
  new: "new",
  remanufactured: "remanufactured",
  reman: "remanufactured",
  rebuilt: "remanufactured",
  refurbished: "remanufactured",
  usedtested: "used_tested",
  used: "used_tested",
  tested: "used_tested",
  exchange: "exchange",
  core: "exchange",
};

export function parseCondition(raw: string): Parsed<ProductCondition> {
  const s = clean(raw);
  if (!s) return { value: "new" };
  const v = CONDITION_ALIASES[key(s)];
  return v ? { value: v } : { error: `Condition “${raw}” should be New, Remanufactured, Used or Exchange` };
}

const ENCLOSURE_ALIASES: Record<string, Enclosure> = {
  tefc: "tefc",
  totallyenclosedfancooled: "tefc",
  odp: "odp",
  opendripproof: "odp",
  tenv: "tenv",
  totallyenclosednonventilated: "tenv",
  xp: "xp",
  explosionproof: "xp",
  xpfc: "xp",
  washdown: "washdown",
  wd: "washdown",
  other: "other",
};

export function parseEnclosure(raw: string): Parsed<Enclosure | null> {
  const s = clean(raw);
  if (!s) return { value: null };
  const v = ENCLOSURE_ALIASES[key(s)];
  return v ? { value: v } : { error: `Enclosure “${raw}” should be TEFC, ODP, TENV, XP, Washdown or Other` };
}

const POWER_ALIASES: Record<string, PowerSupply> = {
  "1": "ac_1ph",
  "1ph": "ac_1ph",
  "1phase": "ac_1ph",
  single: "ac_1ph",
  singlephase: "ac_1ph",
  ac1ph: "ac_1ph",
  "3": "ac_3ph",
  "3ph": "ac_3ph",
  "3phase": "ac_3ph",
  three: "ac_3ph",
  threephase: "ac_3ph",
  ac3ph: "ac_3ph",
  dc: "dc",
};

export function parsePower(raw: string): Parsed<PowerSupply | null> {
  const s = clean(raw);
  if (!s) return { value: null };
  const v = POWER_ALIASES[key(s).replace(/^ac/, "") || ""] ?? POWER_ALIASES[key(s)];
  return v ? { value: v } : { error: `Power “${raw}” should be 1-phase, 3-phase or DC` };
}

const SHIP_ALIASES: Record<string, ShipClass> = {
  parcel: "parcel",
  ups: "parcel",
  ground: "parcel",
  ltl: "ltl",
  freight: "ltl",
  pickup: "pickup_only",
  pickuponly: "pickup_only",
};

export function parseShipClass(raw: string): Parsed<ShipClass> {
  const s = clean(raw);
  if (!s) return { value: "parcel" };
  const v = SHIP_ALIASES[key(s)];
  return v ? { value: v } : { error: `Shipping “${raw}” should be Parcel, Freight or Pickup` };
}

export function parseStatus(raw: string): Parsed<ProductStatus> {
  const s = key(clean(raw));
  if (!s) return { value: "active" };
  if (s === "published" || s === "live") return { value: "active" };
  if (s === "hidden") return { value: "draft" };
  return (PRODUCT_STATUSES as readonly string[]).includes(s)
    ? { value: s as ProductStatus }
    : { error: `Status “${raw}” should be Active, Draft or Archived` };
}

export function parseBool(raw: string, label: string): Parsed<boolean> {
  const s = key(clean(raw));
  if (["", "0", "n", "no", "false", "off"].includes(s)) return { value: false };
  if (["1", "y", "yes", "true", "on", "x"].includes(s)) return { value: true };
  return { error: `${label} “${raw}” should be yes or no` };
}

/**
 * Spec lines as "Label: value". The form uses one per line; CSV cells use
 * "; " between them. Lines without a colon are rejected so typos surface.
 */
export function parseSpecs(raw: string): Parsed<SpecLine[]> {
  const parts = clean(raw)
    .split(/\r?\n|;/)
    .map((p) => p.trim())
    .filter(Boolean);
  const specs: SpecLine[] = [];
  for (const part of parts) {
    const i = part.indexOf(":");
    const label = i > 0 ? part.slice(0, i).trim() : "";
    const value = i > 0 ? part.slice(i + 1).trim() : "";
    if (!label || !value) return { error: `Spec “${part}” should look like “Label: value”` };
    specs.push({ label: label.slice(0, 80), value: value.slice(0, 200) });
  }
  return { value: specs.slice(0, 40) };
}

export function formatSpecs(specs: SpecLine[], separator = "\n"): string {
  return specs.map((s) => `${s.label}: ${s.value}`).join(separator);
}

export function formatMoney(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}
