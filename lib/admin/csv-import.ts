import { parse } from "csv-parse/sync";
import type { Enclosure, PowerSupply, ProductCondition, ShipClass, SpecLine } from "@/lib/catalog/types";
import {
  formatCrossRefs,
  formatMoney,
  formatPriceBreaks,
  formatSpecs,
  parseBool,
  parseCondition,
  parseCrossRefs,
  parseEnclosure,
  parseMoney,
  parseNumber,
  parsePower,
  parsePriceBreakList,
  parseShipClass,
  parseSpecs,
  parseStatus,
  priceBreaksProblem,
  slugify,
  type Parsed,
  type ProductStatus,
  type StoredPriceBreak,
} from "./product-fields";

/**
 * CSV catalog import: parse → normalize each row → plan against the current
 * catalog. Pure functions, so the preview and the apply step see exactly the
 * same plan. Upserts are keyed on SKU. Columns missing from the file are left
 * untouched on existing products, so a price-and-stock sheet with only
 * sku,price,qty is a valid import.
 */

export const MAX_IMPORT_ROWS = 5000;

export const COLUMNS = {
  sku: ["sku", "part number", "part #", "part no", "item number", "item"],
  name: ["name", "product name", "title"],
  category: ["category", "product line", "type"],
  condition: ["condition"],
  price: ["price", "unit price", "sell price"],
  price_breaks: ["quantity prices", "quantity pricing", "volume pricing", "price breaks", "qty breaks"],
  core_charge: ["core charge", "core", "core deposit"],
  qty: ["qty", "quantity", "qty on hand", "on hand", "stock"],
  status: ["status"],
  featured: ["featured"],
  brand: ["brand", "manufacturer", "make"],
  mfr_part_number: ["mfr part number", "manufacturer part number", "mfr part #", "mpn"],
  cross_references: ["cross references", "cross reference", "cross refs", "cross ref", "replaces", "interchange"],
  hp: ["hp", "horsepower"],
  rpm: ["rpm", "speed"],
  frame: ["frame"],
  enclosure: ["enclosure"],
  power: ["power", "phase"],
  voltage: ["voltage", "volts"],
  ship_class: ["shipping", "ship class"],
  weight_lb: ["weight", "weight lb", "weight (lb)", "lbs"],
  description: ["description", "details"],
  specs: ["specs", "specifications"],
  family_key: ["family", "family key", "variant group"],
  slug: ["slug", "url slug"],
} as const;
export type Column = keyof typeof COLUMNS;

/** Column order for the template and the catalog export. */
export const EXPORT_COLUMNS: Column[] = [
  "sku", "name", "category", "condition", "price", "price_breaks", "core_charge", "qty", "status", "featured", "brand",
  "mfr_part_number", "cross_references", "hp", "rpm", "frame", "enclosure", "power", "voltage", "ship_class",
  "weight_lb", "description", "specs", "family_key", "slug",
];

const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
const ALIASES = new Map<string, Column>(
  (Object.entries(COLUMNS) as [Column, readonly string[]][]).flatMap(([col, names]) => names.map((n) => [headerKey(n), col])),
);

/** Product values as stored, with category and brand still referenced by text. */
export interface ProductValues {
  name: string;
  slug: string;
  category: string;
  brand: string | null;
  mfr_part_number: string | null;
  /** Other part numbers this replaces. */
  cross_references: string[];
  family_key: string | null;
  description: string | null;
  condition: ProductCondition;
  price_cents: number | null;
  /** Quantity prices, below the list price and each other. */
  price_breaks: StoredPriceBreak[];
  core_charge_cents: number | null;
  ship_class: ShipClass;
  weight_lb: number | null;
  hp: number | null;
  rpm: number | null;
  frame: string | null;
  enclosure: Enclosure | null;
  power: PowerSupply | null;
  voltage: string | null;
  specs: SpecLine[];
  featured: boolean;
  status: ProductStatus;
  qty: number | null;
}
export type FieldName = keyof ProductValues;

export interface ImportRow {
  line: number;
  sku: string;
  values: Partial<ProductValues>;
}

export interface RowError {
  line: number;
  sku: string | null;
  message: string;
}

export interface ParsedImport {
  columns: Column[];
  ignoredHeaders: string[];
  rows: ImportRow[];
  errors: RowError[];
}

const text = (max: number) => (raw: string): Parsed<string | null> => {
  const s = raw.trim();
  if (!s) return { value: null };
  return s.length > max ? { error: `is longer than ${max} characters` } : { value: s };
};

/** How each column becomes one or more ProductValues fields. */
const FIELD_PARSERS: Record<Exclude<Column, "sku">, [FieldName, (raw: string) => Parsed<unknown>]> = {
  name: ["name", text(200)],
  category: ["category", text(80)],
  condition: ["condition", parseCondition],
  price: ["price_cents", parseMoney],
  price_breaks: ["price_breaks", parsePriceBreakList],
  core_charge: ["core_charge_cents", parseMoney],
  qty: ["qty", (raw) => parseNumber(raw, "Quantity", { integer: true })],
  status: ["status", parseStatus],
  featured: ["featured", (raw) => parseBool(raw, "Featured")],
  brand: ["brand", text(80)],
  mfr_part_number: ["mfr_part_number", text(80)],
  cross_references: ["cross_references", parseCrossRefs],
  hp: ["hp", (raw) => parseNumber(raw, "HP")],
  rpm: ["rpm", (raw) => parseNumber(raw, "RPM", { integer: true })],
  frame: ["frame", (raw) => text(20)(raw.toUpperCase())],
  enclosure: ["enclosure", parseEnclosure],
  power: ["power", parsePower],
  voltage: ["voltage", text(60)],
  ship_class: ["ship_class", parseShipClass],
  weight_lb: ["weight_lb", (raw) => parseNumber(raw, "Weight")],
  description: ["description", text(4000)],
  specs: ["specs", parseSpecs],
  family_key: ["family_key", (raw) => text(80)(slugify(raw))],
  slug: ["slug", (raw) => {
    const s = raw.trim();
    if (!s) return { value: null };
    const slug = slugify(s);
    return slug ? { value: slug } : { error: `“${raw}” is not a usable URL slug` };
  }],
};

export function parseImport(csvText: string): ParsedImport {
  let records: string[][];
  try {
    records = parse(csvText.replace(/^﻿/, ""), { relax_column_count: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return { columns: [], ignoredHeaders: [], rows: [], errors: [{ line: 0, sku: null, message: `Could not read the CSV: ${e instanceof Error ? e.message : e}` }] };
  }
  const [header = [], ...body] = records;

  const columnIndex = new Map<Column, number>();
  const ignoredHeaders: string[] = [];
  header.forEach((h, i) => {
    const col = ALIASES.get(headerKey(h));
    if (col && !columnIndex.has(col)) columnIndex.set(col, i);
    else if (h) ignoredHeaders.push(h);
  });

  const errors: RowError[] = [];
  if (!columnIndex.has("sku")) {
    errors.push({ line: 1, sku: null, message: "The header row needs a SKU column (or Part #)." });
    return { columns: [...columnIndex.keys()], ignoredHeaders, rows: [], errors };
  }
  if (body.length > MAX_IMPORT_ROWS) {
    errors.push({ line: 0, sku: null, message: `Import at most ${MAX_IMPORT_ROWS} rows at a time (this file has ${body.length}).` });
    return { columns: [...columnIndex.keys()], ignoredHeaders, rows: [], errors };
  }

  const rows: ImportRow[] = [];
  body.forEach((record, i) => {
    const line = i + 2; // 1-based, after the header row
    const sku = (record[columnIndex.get("sku")!] ?? "").trim();
    if (!sku) {
      if (record.some((c) => c.trim())) errors.push({ line, sku: null, message: "Missing SKU." });
      return;
    }
    if (sku.length > 80) {
      errors.push({ line, sku, message: "SKU is longer than 80 characters." });
      return;
    }
    const values: Partial<ProductValues> = {};
    let ok = true;
    for (const [col, idx] of columnIndex) {
      if (col === "sku") continue;
      const [field, parser] = FIELD_PARSERS[col];
      const result = parser(record[idx] ?? "");
      if (result.error !== undefined) {
        errors.push({ line, sku, message: `${col.replace(/_/g, " ")}: ${result.error}` });
        ok = false;
      } else {
        (values as Record<string, unknown>)[field] = result.value;
      }
    }
    if (ok) rows.push({ line, sku, values });
  });

  return { columns: [...columnIndex.keys()], ignoredHeaders, rows, errors };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export interface ExistingProduct {
  id: string;
  sku: string;
  values: ProductValues;
}

export interface CatalogRefs {
  categories: { id: string; slug: string; name: string }[];
  brands: { id: string; slug: string; name: string }[];
}

export interface PlannedCreate {
  line: number;
  sku: string;
  values: ProductValues;
}

export interface PlannedUpdate {
  line: number;
  sku: string;
  id: string;
  changes: Partial<ProductValues>;
}

export interface ImportPlan {
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
  unchanged: number;
  newBrands: string[];
  errors: RowError[];
}

const DEFAULTS: Omit<ProductValues, "name" | "slug" | "category"> = {
  brand: null,
  mfr_part_number: null,
  cross_references: [],
  family_key: null,
  description: null,
  condition: "new",
  price_cents: null,
  price_breaks: [],
  core_charge_cents: null,
  ship_class: "parcel",
  weight_lb: null,
  hp: null,
  rpm: null,
  frame: null,
  enclosure: null,
  power: null,
  voltage: null,
  specs: [],
  featured: false,
  status: "active",
  qty: null,
};

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function planImport(parsed: ParsedImport, existing: ExistingProduct[], refs: CatalogRefs): ImportPlan {
  const errors: RowError[] = [...parsed.errors];
  const bySku = new Map(existing.map((p) => [p.sku.toLowerCase(), p]));
  const takenSlugs = new Set(existing.map((p) => p.values.slug));
  const findCategory = (ref: string) => {
    const k = ref.trim().toLowerCase();
    return refs.categories.find((c) => c.slug === k || c.name.toLowerCase() === k || c.slug === slugify(ref));
  };
  const knownBrands = new Set(refs.brands.flatMap((b) => [b.slug, b.name.toLowerCase()]));
  const newBrands = new Map<string, string>();
  const seen = new Map<string, number>();

  const creates: PlannedCreate[] = [];
  const updates: PlannedUpdate[] = [];
  let unchanged = 0;

  for (const row of parsed.rows) {
    const skuKey = row.sku.toLowerCase();
    if (seen.has(skuKey)) {
      errors.push({ line: row.line, sku: row.sku, message: `Duplicate SKU (also on line ${seen.get(skuKey)}).` });
      continue;
    }
    seen.set(skuKey, row.line);

    const v = { ...row.values };
    if (v.category !== undefined && v.category !== null) {
      const category = findCategory(v.category);
      if (!category) {
        errors.push({ line: row.line, sku: row.sku, message: `Unknown category “${v.category}”. Use one of: ${refs.categories.map((c) => c.name).join(", ")}.` });
        continue;
      }
      v.category = category.slug;
    }
    if (v.brand) {
      const b = v.brand.toLowerCase();
      if (!knownBrands.has(b) && !knownBrands.has(slugify(v.brand))) newBrands.set(slugify(v.brand), v.brand);
    }

    const current = bySku.get(skuKey);
    if (current) {
      if (v.category === null) {
        errors.push({ line: row.line, sku: row.sku, message: "Category can’t be blank for an existing product." });
        continue;
      }
      if (v.name === null) {
        errors.push({ line: row.line, sku: row.sku, message: "Name can’t be blank for an existing product." });
        continue;
      }
      if (v.slug === null) delete v.slug; // blank slug cell keeps the current URL
      const breaksProblem = priceBreaksProblem(v.price_breaks ?? current.values.price_breaks, v.price_cents === undefined ? current.values.price_cents : v.price_cents);
      if (breaksProblem) {
        errors.push({ line: row.line, sku: row.sku, message: breaksProblem });
        continue;
      }
      const changes: Partial<ProductValues> = {};
      for (const [field, value] of Object.entries(v) as [FieldName, unknown][]) {
        if (field === "brand" ? !same(String(value ?? "").toLowerCase(), String(current.values.brand ?? "").toLowerCase()) : !same(value, current.values[field])) {
          (changes as Record<string, unknown>)[field] = value;
        }
      }
      if (changes.slug) {
        if (takenSlugs.has(changes.slug)) {
          errors.push({ line: row.line, sku: row.sku, message: `Slug “${changes.slug}” is already used by another product.` });
          continue;
        }
        takenSlugs.add(changes.slug);
      }
      if (Object.keys(changes).length) updates.push({ line: row.line, sku: row.sku, id: current.id, changes });
      else unchanged++;
      continue;
    }

    // New product: name and category are required.
    if (!v.name) {
      errors.push({ line: row.line, sku: row.sku, message: "New products need a name." });
      continue;
    }
    if (!v.category) {
      errors.push({ line: row.line, sku: row.sku, message: "New products need a category." });
      continue;
    }
    const breaksProblem = priceBreaksProblem(v.price_breaks ?? [], v.price_cents ?? null);
    if (breaksProblem) {
      errors.push({ line: row.line, sku: row.sku, message: breaksProblem });
      continue;
    }
    const condition = v.condition ?? "new";
    let slug = v.slug || slugify(condition === "new" ? v.name : `${v.name} ${condition}`) || slugify(row.sku);
    if (takenSlugs.has(slug)) {
      if (v.slug) {
        errors.push({ line: row.line, sku: row.sku, message: `Slug “${slug}” is already used by another product.` });
        continue;
      }
      const base = slug;
      for (let n = 2; takenSlugs.has(slug); n++) slug = `${base}-${n}`;
    }
    takenSlugs.add(slug);
    creates.push({
      line: row.line,
      sku: row.sku,
      values: { ...DEFAULTS, ...v, name: v.name, category: v.category, slug, specs: v.specs ?? [] } as ProductValues,
    });
  }

  return { creates, updates, unchanged, newBrands: [...newBrands.values()], errors };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** One export row; the inverse of parseImport for every column. */
export function exportRow(sku: string, v: ProductValues): string[] {
  const n = (x: number | null) => (x === null ? "" : String(x));
  const cells: Record<Column, string> = {
    sku,
    name: v.name,
    category: v.category,
    condition: v.condition,
    price: formatMoney(v.price_cents),
    price_breaks: formatPriceBreaks(v.price_breaks, "; "),
    core_charge: formatMoney(v.core_charge_cents),
    qty: n(v.qty),
    status: v.status,
    featured: v.featured ? "yes" : "no",
    brand: v.brand ?? "",
    mfr_part_number: v.mfr_part_number ?? "",
    cross_references: formatCrossRefs(v.cross_references, "; "),
    hp: n(v.hp),
    rpm: n(v.rpm),
    frame: v.frame ?? "",
    enclosure: v.enclosure ?? "",
    power: v.power ?? "",
    voltage: v.voltage ?? "",
    ship_class: v.ship_class,
    weight_lb: n(v.weight_lb),
    description: v.description ?? "",
    specs: formatSpecs(v.specs, "; "),
    family_key: v.family_key ?? "",
    slug: v.slug,
  };
  return EXPORT_COLUMNS.map((c) => cells[c]);
}

export const EXPORT_HEADER = EXPORT_COLUMNS.map((c) => COLUMNS[c][0]);

const TEMPLATE_EXAMPLES: Partial<Record<Column, string>>[] = [
  {
    sku: "EM-5HP-184T-N", name: "5 HP General Purpose Motor, 184T", category: "electric-motors", condition: "new",
    price: "689.00", price_breaks: "5+ 650.00; 10+ 620.00", qty: "4", status: "active", brand: "Baldor", mfr_part_number: "EM3615T", cross_references: "WEG 00518ET3E184T; Marathon U206", hp: "5", rpm: "1750",
    frame: "184T", enclosure: "TEFC", power: "3 phase", voltage: "208-230/460", ship_class: "parcel", weight_lb: "86",
    description: "Premium efficiency, rolled steel frame.", specs: "Service factor: 1.15; Insulation: Class F",
    family_key: "em-5hp-184t",
  },
  {
    sku: "EM-5HP-184T-X", name: "5 HP General Purpose Motor, 184T", category: "electric-motors", condition: "exchange",
    price: "395.00", core_charge: "150.00", qty: "1", brand: "Baldor", hp: "5", rpm: "1750", frame: "184T",
    enclosure: "TEFC", power: "3 phase", family_key: "em-5hp-184t",
  },
];

/** A starter spreadsheet: every column the importer understands, plus two example rows. */
export function importTemplateCsv(): string {
  return toCsv([EXPORT_HEADER, ...TEMPLATE_EXAMPLES.map((row) => EXPORT_COLUMNS.map((c) => row[c] ?? ""))]);
}
