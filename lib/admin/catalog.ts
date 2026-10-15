import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Enclosure, PowerSupply, ProductCondition, ShipClass } from "@/lib/catalog/types";
import type { CatalogRefs, ExistingProduct, ImportPlan, ProductValues } from "./csv-import";
import { slugify, type ProductStatus } from "./product-fields";

/**
 * Admin-side catalog reads and writes. Always called with the staff member's
 * session client, so row-level security enforces access on every query.
 */

interface ProductRow {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  mfr_part_number: string | null;
  family_key: string | null;
  condition: ProductCondition;
  price_cents: number | null;
  core_charge_cents: number | null;
  ship_class: ShipClass;
  weight_lb: number | string | null;
  hp: number | string | null;
  rpm: number | null;
  frame: string | null;
  enclosure: Enclosure | null;
  power: PowerSupply | null;
  voltage: string | null;
  specs: unknown;
  featured: boolean;
  status: ProductStatus;
  in_stock: boolean;
  updated_at: string;
  category: { slug: string; name: string } | null;
  brand: { name: string } | null;
  inventory: { qty_on_hand: number } | { qty_on_hand: number }[] | null;
}

const PRODUCT_SELECT =
  "id, sku, slug, name, description, mfr_part_number, family_key, condition, price_cents, core_charge_cents, ship_class, weight_lb, hp, rpm, frame, enclosure, power, voltage, specs, featured, status, in_stock, updated_at, category:categories(slug, name), brand:brands(name), inventory(qty_on_hand)";

const num = (v: number | string | null) => (v === null ? null : Number(v));

function qtyOf(row: ProductRow): number | null {
  const inv = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
  return inv ? inv.qty_on_hand : null;
}

function toValues(row: ProductRow): ProductValues {
  return {
    name: row.name,
    slug: row.slug,
    category: row.category?.slug ?? "",
    brand: row.brand?.name ?? null,
    mfr_part_number: row.mfr_part_number,
    family_key: row.family_key,
    description: row.description,
    condition: row.condition,
    price_cents: row.price_cents,
    core_charge_cents: row.core_charge_cents,
    ship_class: row.ship_class,
    weight_lb: num(row.weight_lb),
    hp: num(row.hp),
    rpm: row.rpm,
    frame: row.frame,
    enclosure: row.enclosure,
    power: row.power,
    voltage: row.voltage,
    specs: Array.isArray(row.specs) ? row.specs : [],
    featured: row.featured,
    status: row.status,
    qty: qtyOf(row),
  };
}

export interface AdminProduct extends ExistingProduct {
  inStock: boolean;
  updatedAt: string;
  categoryName: string;
}

function toAdminProduct(row: ProductRow): AdminProduct {
  return {
    id: row.id,
    sku: row.sku,
    values: toValues(row),
    inStock: row.in_stock,
    updatedAt: row.updated_at,
    categoryName: row.category?.name ?? "",
  };
}

export async function loadRefs(supabase: SupabaseClient): Promise<CatalogRefs> {
  const [categories, brands] = await Promise.all([
    supabase.from("categories").select("id, slug, name").order("sort_order"),
    supabase.from("brands").select("id, slug, name").order("name"),
  ]);
  if (categories.error) throw new Error(`Categories: ${categories.error.message}`);
  if (brands.error) throw new Error(`Brands: ${brands.error.message}`);
  return { categories: categories.data, brands: brands.data };
}

/** Every product (any status), for the importer and the CSV export. */
export async function loadAllProducts(supabase: SupabaseClient): Promise<AdminProduct[]> {
  const all: AdminProduct[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).order("sku").range(from, from + pageSize - 1);
    if (error) throw new Error(`Products: ${error.message}`);
    all.push(...(data as unknown as ProductRow[]).map(toAdminProduct));
    if (data.length < pageSize) return all;
  }
}

export interface ProductListQuery {
  q: string | null;
  status: ProductStatus | "all";
  stock: "all" | "in" | "out";
  page: number;
}

export const ADMIN_PAGE_SIZE = 50;

export async function listProducts(supabase: SupabaseClient, query: ProductListQuery) {
  let request = supabase.from("products").select(PRODUCT_SELECT, { count: "exact" });
  if (query.status !== "all") request = request.eq("status", query.status);
  if (query.stock === "in") request = request.eq("in_stock", true);
  if (query.stock === "out") request = request.eq("in_stock", false);
  const term = query.q?.replace(/[,()%*_\\"'.:]/g, " ").trim();
  if (term) {
    for (const t of term.split(/\s+/).slice(0, 4)) {
      request = request.or(`sku.ilike.*${t}*,name.ilike.*${t}*,mfr_part_number.ilike.*${t}*`);
    }
  }
  const from = (query.page - 1) * ADMIN_PAGE_SIZE;
  const { data, count, error } = await request.order("updated_at", { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error) throw new Error(`Products: ${error.message}`);
  return { items: (data as unknown as ProductRow[]).map(toAdminProduct), total: count ?? 0 };
}

export interface AdminProductImage {
  id: string;
  storagePath: string;
  alt: string;
  /** A credited stand-in photo (`npm run seed:photos`) rather than one staff uploaded. */
  stock: boolean;
}

export async function getProduct(supabase: SupabaseClient, id: string) {
  const [product, images] = await Promise.all([
    supabase.from("products").select(PRODUCT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("product_images").select("id, storage_path, alt, credit").eq("product_id", id).order("sort_order"),
  ]);
  if (product.error) throw new Error(`Product: ${product.error.message}`);
  if (images.error) throw new Error(`Images: ${images.error.message}`);
  if (!product.data) return null;
  return {
    product: toAdminProduct(product.data as unknown as ProductRow),
    images: images.data.map((i): AdminProductImage => ({ id: i.id, storagePath: i.storage_path, alt: i.alt, stock: i.credit !== null })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type DbProduct = Record<string, unknown>;

/** Convert ProductValues fields to product table columns (category/brand → ids). */
function toDbColumns(values: Partial<ProductValues>, refs: CatalogRefs): DbProduct {
  const row: DbProduct = {};
  for (const [field, value] of Object.entries(values) as [keyof ProductValues, unknown][]) {
    if (field === "qty") continue;
    if (field === "category") {
      const cat = refs.categories.find((c) => c.slug === value);
      if (!cat) throw new Error(`Unknown category ${String(value)}`);
      row.category_id = cat.id;
    } else if (field === "brand") {
      if (value === null || value === "") row.brand_id = null;
      else {
        const name = String(value).toLowerCase();
        const brand = refs.brands.find((b) => b.name.toLowerCase() === name || b.slug === slugify(String(value)));
        if (!brand) throw new Error(`Unknown brand ${String(value)}`);
        row.brand_id = brand.id;
      }
    } else {
      row[field] = value;
    }
  }
  return row;
}

async function ensureBrands(supabase: SupabaseClient, names: string[], refs: CatalogRefs): Promise<CatalogRefs> {
  const missing = names.filter(
    (n) => n && !refs.brands.some((b) => b.name.toLowerCase() === n.toLowerCase() || b.slug === slugify(n)),
  );
  if (!missing.length) return refs;
  const { data, error } = await supabase
    .from("brands")
    .upsert(
      [...new Map(missing.map((n) => [slugify(n), { slug: slugify(n), name: n }])).values()],
      { onConflict: "slug" },
    )
    .select("id, slug, name");
  if (error) throw new Error(`Creating brands: ${error.message}`);
  return { ...refs, brands: [...refs.brands, ...data] };
}

async function setStock(supabase: SupabaseClient, entries: { product_id: string; qty_on_hand: number }[]) {
  for (let i = 0; i < entries.length; i += 500) {
    const { error } = await supabase.from("inventory").upsert(entries.slice(i, i + 500), { onConflict: "product_id" });
    if (error) throw new Error(`Stock: ${error.message}`);
  }
}

/** Create or update one product from the admin form. Returns its id. */
export async function saveProduct(
  supabase: SupabaseClient,
  id: string | null,
  sku: string,
  values: ProductValues,
): Promise<{ id: string } | { error: string; field?: string }> {
  let refs = await loadRefs(supabase);
  refs = await ensureBrands(supabase, values.brand ? [values.brand] : [], refs);
  const columns = { ...toDbColumns(values, refs), sku };

  const result = id
    ? await supabase.from("products").update(columns).eq("id", id).select("id").single()
    : await supabase.from("products").insert(columns).select("id").single();
  if (result.error) {
    if (result.error.code === "23505") {
      const field = result.error.message.includes("slug") ? "slug" : "sku";
      return { error: `Another product already uses this ${field === "slug" ? "URL slug" : "SKU"}.`, field };
    }
    return { error: result.error.message };
  }
  if (values.qty !== null) await setStock(supabase, [{ product_id: result.data.id, qty_on_hand: values.qty }]);
  return { id: result.data.id };
}

export interface ImportResult {
  created: number;
  updated: number;
  brandsCreated: number;
  stockRows: number;
}

/**
 * Apply a validated plan. Not one transaction (PostgREST has none across
 * calls), so it runs in the order that is safest to retry: brands, new
 * products, updates, then stock. Re-running the same file is idempotent.
 */
export async function applyImportPlan(supabase: SupabaseClient, plan: ImportPlan, initialRefs: CatalogRefs): Promise<ImportResult> {
  const refs = await ensureBrands(supabase, plan.newBrands, initialRefs);
  const stock: { product_id: string; qty_on_hand: number }[] = [];

  for (let i = 0; i < plan.creates.length; i += 500) {
    const batch = plan.creates.slice(i, i + 500);
    const { data, error } = await supabase
      .from("products")
      .insert(batch.map((c) => ({ ...toDbColumns(c.values, refs), sku: c.sku })))
      .select("id, sku");
    if (error) throw new Error(`Creating products (rows ${batch[0].line}–${batch.at(-1)!.line}): ${error.message}`);
    const ids = new Map(data.map((d) => [d.sku, d.id]));
    for (const c of batch) {
      if (c.values.qty !== null) stock.push({ product_id: ids.get(c.sku)!, qty_on_hand: c.values.qty });
    }
  }

  // Updates touch different columns per row, so they go one row at a time, a few in parallel.
  const queue = [...plan.updates];
  const failures: string[] = [];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        const { qty, ...rest } = u.changes;
        if (qty !== undefined && qty !== null) stock.push({ product_id: u.id, qty_on_hand: qty });
        if (!Object.keys(rest).length) continue;
        const { error } = await supabase.from("products").update(toDbColumns(rest, refs)).eq("id", u.id);
        if (error) failures.push(`line ${u.line} (${u.sku}): ${error.message}`);
      }
    }),
  );
  if (failures.length) throw new Error(`Some updates failed: ${failures.slice(0, 5).join("; ")}`);

  await setStock(supabase, stock);
  return { created: plan.creates.length, updated: plan.updates.length, brandsCreated: plan.newBrands.length, stockRows: stock.length };
}
