import {
  ENCLOSURES,
  POWER_SUPPLIES,
  PRODUCT_CONDITIONS,
  type Enclosure,
  type PowerSupply,
  type ProductCondition,
  type ProductSummary,
} from "./types";

/** Nominal speed bands as they appear on nameplates (synchronous / full-load). */
export const RPM_BANDS = {
  "3600": { label: "3600 / 3450", min: 3000, max: 3700 },
  "1800": { label: "1800 / 1750", min: 1500, max: 1900 },
  "1200": { label: "1200 / 1150", min: 1000, max: 1250 },
  "900": { label: "900 / 875", min: 700, max: 950 },
} as const;
export type RpmBand = keyof typeof RPM_BANDS;
const RPM_BAND_KEYS = Object.keys(RPM_BANDS) as RpmBand[];

export const SORTS = {
  featured: "Best match",
  "hp-asc": "Horsepower: low to high",
  "hp-desc": "Horsepower: high to low",
  name: "Name A–Z",
} as const;
export type Sort = keyof typeof SORTS;

export const PAGE_SIZE = 12;

export interface CatalogFilters {
  category: string | null;
  q: string | null;
  conditions: ProductCondition[];
  inStock: boolean;
  hpMin: number | null;
  hpMax: number | null;
  rpm: RpmBand[];
  enclosures: Enclosure[];
  power: PowerSupply | null;
  frame: string | null;
  brand: string | null;
  sort: Sort;
  page: number;
}

export type SearchParamsInput = Record<string, string | string[] | undefined>;

export const EMPTY_FILTERS: CatalogFilters = {
  category: null,
  q: null,
  conditions: [],
  inStock: false,
  hpMin: null,
  hpMax: null,
  rpm: [],
  enclosures: [],
  power: null,
  frame: null,
  brand: null,
  sort: "featured",
  page: 1,
};

function all(params: SearchParamsInput, key: string): string[] {
  const value = params[key];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

function first(params: SearchParamsInput, key: string): string | null {
  const value = all(params, key)[0];
  return value ? value.slice(0, 100) : null;
}

function oneOf<T extends string>(values: readonly T[], raw: string[]): T[] {
  return [...new Set(raw.filter((v): v is T => (values as readonly string[]).includes(v)))];
}

function positiveNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < 100_000 ? n : null;
}

/**
 * Parse URL search params into filters. Unknown or malformed values are dropped
 * rather than rejected, so hand-edited and stale links still render a listing.
 * `hp` is the part finder's exact-horsepower shorthand for hp_min = hp_max.
 */
export function parseFilters(params: SearchParamsInput, category: string | null = null): CatalogFilters {
  const exactHp = positiveNumber(first(params, "hp"));
  let hpMin = exactHp ?? positiveNumber(first(params, "hp_min"));
  let hpMax = exactHp ?? positiveNumber(first(params, "hp_max"));
  if (hpMin !== null && hpMax !== null && hpMin > hpMax) [hpMin, hpMax] = [hpMax, hpMin];

  const sortRaw = first(params, "sort");
  const page = Math.floor(positiveNumber(first(params, "page")) ?? 1);
  const power = oneOf(POWER_SUPPLIES, all(params, "power"))[0] ?? null;
  const frame = first(params, "frame");

  return {
    category,
    q: first(params, "q"),
    conditions: oneOf(PRODUCT_CONDITIONS, all(params, "condition")),
    inStock: first(params, "in_stock") === "1",
    hpMin,
    hpMax,
    rpm: oneOf(RPM_BAND_KEYS, all(params, "rpm")),
    enclosures: oneOf(ENCLOSURES, all(params, "enclosure")),
    power,
    // Frames are alphanumeric (184T, 56C, 326TS); anything else is noise.
    frame: frame ? frame.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null,
    brand: first(params, "brand"),
    sort: sortRaw && sortRaw in SORTS ? (sortRaw as Sort) : "featured",
    page: page >= 1 ? page : 1,
  };
}

/** Serialize filters back to search params (category lives in the path, not here). */
export function filtersToSearchParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  for (const c of filters.conditions) params.append("condition", c);
  if (filters.inStock) params.set("in_stock", "1");
  if (filters.hpMin !== null && filters.hpMin === filters.hpMax) {
    params.set("hp", String(filters.hpMin));
  } else {
    if (filters.hpMin !== null) params.set("hp_min", String(filters.hpMin));
    if (filters.hpMax !== null) params.set("hp_max", String(filters.hpMax));
  }
  for (const r of filters.rpm) params.append("rpm", r);
  for (const e of filters.enclosures) params.append("enclosure", e);
  if (filters.power) params.set("power", filters.power);
  if (filters.frame) params.set("frame", filters.frame);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function shopHref(filters: CatalogFilters, patch: Partial<CatalogFilters> = {}): string {
  const next = { ...filters, page: 1, ...patch };
  const path = next.category ? `/shop/${next.category}` : "/shop";
  const qs = filtersToSearchParams(next).toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * The filter sidebar is a plain GET form, so blank inputs arrive as `hp_min=`.
 * Returns the clean URL to redirect to when any param is empty, else null.
 */
export function canonicalShopHref(params: SearchParamsInput, filters: CatalogFilters): string | null {
  const hasBlank = Object.values(params).some((v) => (Array.isArray(v) ? v.some((x) => !x.trim()) : v !== undefined && !v.trim()));
  return hasBlank ? shopHref(filters, { page: filters.page }) : null;
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.q !== null ||
    filters.conditions.length > 0 ||
    filters.inStock ||
    filters.hpMin !== null ||
    filters.hpMax !== null ||
    filters.rpm.length > 0 ||
    filters.enclosures.length > 0 ||
    filters.power !== null ||
    filters.frame !== null ||
    filters.brand !== null
  );
}

/**
 * In-memory equivalent of the Supabase query in supabase-source.ts, used by the
 * demo catalog. Keep the two in step: same predicates, same sort order.
 */
export function filterProducts(products: ProductSummary[], filters: CatalogFilters): ProductSummary[] {
  const terms = searchTerms(filters.q);
  const bands = filters.rpm.map((r) => RPM_BANDS[r]);

  const matches = products.filter((p) => {
    if (filters.category && p.categorySlug !== filters.category) return false;
    if (filters.conditions.length && !filters.conditions.includes(p.condition)) return false;
    if (filters.inStock && !p.inStock) return false;
    if (filters.hpMin !== null && (p.hp === null || p.hp < filters.hpMin)) return false;
    if (filters.hpMax !== null && (p.hp === null || p.hp > filters.hpMax)) return false;
    if (bands.length && (p.rpm === null || !bands.some((b) => p.rpm! >= b.min && p.rpm! <= b.max))) return false;
    if (filters.enclosures.length && (p.enclosure === null || !filters.enclosures.includes(p.enclosure))) return false;
    if (filters.power && p.power !== filters.power) return false;
    if (filters.frame && p.frame?.toUpperCase() !== filters.frame) return false;
    if (filters.brand && p.brand?.slug !== filters.brand) return false;
    if (terms.length) {
      const haystack = [p.sku, p.mfrPartNumber ?? "", p.name, p.frame ?? ""].join(" ").toLowerCase();
      const keys = partKeys(p);
      if (!terms.every((t) => haystack.includes(t) || (partKey(t) !== "" && keys.includes(partKey(t))))) return false;
    }
    return true;
  });

  return sortProducts(matches, filters.sort);
}

/**
 * Split a free-text query into terms. Characters that are special in PostgREST
 * filter strings or LIKE patterns are dropped so the SQL source can embed terms
 * safely; both sources use this so they match the same products.
 */
export function searchTerms(q: string | null): string[] {
  if (!q) return [];
  return q
    .toLowerCase()
    .replace(/[,()%*_\\"'.:]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * A part number reduced to lowercase letters and digits, so "EM-3615T",
 * "em3615t" and "EM 3615T" compare equal. Mirrors private.set_part_keys().
 */
export const partKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every part number of a product as searchable keys, like products.part_keys. */
export function partKeys(p: Pick<ProductSummary, "sku" | "mfrPartNumber" | "crossReferences">): string {
  return [p.sku, p.mfrPartNumber ?? "", ...p.crossReferences]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "");
}

/**
 * The cross-reference a search matched, so a result can say "Replaces WEG
 * 00518ET3E184T". Null when the search matched the product's own numbers.
 */
export function matchedCrossReference(p: Pick<ProductSummary, "crossReferences">, q: string | null): string | null {
  const keys = searchTerms(q).map(partKey).filter((k) => k.length >= 3);
  if (!keys.length) return null;
  return p.crossReferences.find((ref) => keys.some((k) => partKey(ref).includes(k))) ?? null;
}

export function sortProducts(products: ProductSummary[], sort: Sort): ProductSummary[] {
  const byName = (a: ProductSummary, b: ProductSummary) => a.name.localeCompare(b.name);
  const hp = (p: ProductSummary) => p.hp ?? Number.POSITIVE_INFINITY;
  const sorted = [...products];
  switch (sort) {
    case "hp-asc":
      return sorted.sort((a, b) => hp(a) - hp(b) || byName(a, b));
    case "hp-desc":
      return sorted.sort((a, b) => (b.hp ?? -1) - (a.hp ?? -1) || byName(a, b));
    case "name":
      return sorted.sort(byName);
    case "featured":
      return sorted.sort(
        (a, b) => Number(b.featured) - Number(a.featured) || Number(b.inStock) - Number(a.inStock) || byName(a, b),
      );
  }
}

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    total: items.length,
    page: current,
    pageCount,
  };
}
