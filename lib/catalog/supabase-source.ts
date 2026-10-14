import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { storagePublicUrl } from "@/lib/supabase/env";
import { PAGE_SIZE, RPM_BANDS, searchTerms, type CatalogFilters, type Sort } from "./filters";
import type { CatalogSource, ProductPage } from "./source";
import type {
  Brand,
  Category,
  Enclosure,
  PowerSupply,
  ProductCondition,
  ProductDetail,
  ProductSummary,
  ShipClass,
  SpecLine,
} from "./types";

// Rows as returned by PostgREST for the selects below. Regenerate against the
// live schema with `supabase gen types` once the project exists.
interface SummaryRow {
  id: string;
  sku: string;
  mfr_part_number: string | null;
  slug: string;
  name: string;
  condition: ProductCondition;
  price_cents: number | null;
  core_charge_cents: number | null;
  in_stock: boolean;
  featured: boolean;
  hp: number | string | null;
  rpm: number | null;
  frame: string | null;
  enclosure: Enclosure | null;
  power: PowerSupply | null;
  voltage: string | null;
  category: { slug: string } | null;
  brand: { slug: string; name: string } | null;
  images: { storage_path: string; alt: string; sort_order: number }[] | null;
}

interface DetailRow extends SummaryRow {
  family_key: string | null;
  description: string | null;
  ship_class: ShipClass;
  weight_lb: number | string | null;
  specs: unknown;
  documents: { label: string; storage_path: string; sort_order: number }[] | null;
}

const SUMMARY_COLUMNS =
  "id, sku, mfr_part_number, slug, name, condition, price_cents, core_charge_cents, in_stock, featured, hp, rpm, frame, enclosure, power, voltage";

function summarySelect({ innerBrand }: { innerBrand: boolean }) {
  return `${SUMMARY_COLUMNS}, category:categories!inner(slug), brand:brands${innerBrand ? "!inner" : ""}(slug, name), images:product_images(storage_path, alt, sort_order)`;
}

const num = (value: number | string | null) => (value === null ? null : Number(value));

function toSummary(row: SummaryRow): ProductSummary {
  const image = [...(row.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: row.id,
    sku: row.sku,
    mfrPartNumber: row.mfr_part_number,
    slug: row.slug,
    name: row.name,
    categorySlug: row.category?.slug ?? "",
    brand: row.brand,
    condition: row.condition,
    priceCents: row.price_cents,
    coreChargeCents: row.core_charge_cents,
    inStock: row.in_stock,
    featured: row.featured,
    hp: num(row.hp),
    rpm: row.rpm,
    frame: row.frame,
    enclosure: row.enclosure,
    power: row.power,
    voltage: row.voltage,
    imageUrl: image ? storagePublicUrl("product-images", image.storage_path) : null,
  };
}

function toSpecs(value: unknown): SpecLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is SpecLine => typeof s?.label === "string" && typeof s?.value === "string",
  );
}

const ORDER: Record<Sort, [column: string, ascending: boolean][]> = {
  featured: [["featured", false], ["in_stock", false], ["name", true]],
  "hp-asc": [["hp", true], ["name", true]],
  "hp-desc": [["hp", false], ["name", true]],
  name: [["name", true]],
};

async function runSearch(filters: CatalogFilters, page: number) {
  const supabase = createPublicClient();
  let query = supabase
    .from("products")
    .select(summarySelect({ innerBrand: Boolean(filters.brand) }), { count: "exact" })
    .eq("status", "active");

  if (filters.category) query = query.eq("categories.slug", filters.category);
  if (filters.brand) query = query.eq("brands.slug", filters.brand);
  if (filters.conditions.length) query = query.in("condition", filters.conditions);
  if (filters.inStock) query = query.eq("in_stock", true);
  if (filters.hpMin !== null) query = query.gte("hp", filters.hpMin);
  if (filters.hpMax !== null) query = query.lte("hp", filters.hpMax);
  if (filters.rpm.length) {
    query = query.or(
      filters.rpm.map((r) => `and(rpm.gte.${RPM_BANDS[r].min},rpm.lte.${RPM_BANDS[r].max})`).join(","),
    );
  }
  if (filters.enclosures.length) query = query.in("enclosure", filters.enclosures);
  if (filters.power) query = query.eq("power", filters.power);
  if (filters.frame) query = query.ilike("frame", filters.frame);
  // Every term must appear somewhere; terms are pre-sanitized by searchTerms().
  for (const term of searchTerms(filters.q)) {
    query = query.or(
      ["sku", "mfr_part_number", "name", "frame"].map((c) => `${c}.ilike.*${term}*`).join(","),
    );
  }

  for (const [column, ascending] of ORDER[filters.sort]) {
    query = query.order(column, { ascending, nullsFirst: false });
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Catalog search failed: ${error.message}`);
  return { rows: (data ?? []) as unknown as SummaryRow[], total: count ?? 0 };
}

export const supabaseCatalog: CatalogSource = {
  isDemo: false,

  async listCategories(): Promise<Category[]> {
    const { data, error } = await createPublicClient()
      .from("categories")
      .select("slug, name, description, sort_order")
      .order("sort_order");
    if (error) throw new Error(`Category load failed: ${error.message}`);
    return (data ?? []).map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      sortOrder: c.sort_order,
    }));
  },

  async listBrands(): Promise<Brand[]> {
    const { data, error } = await createPublicClient().from("brands").select("slug, name").order("name");
    if (error) throw new Error(`Brand load failed: ${error.message}`);
    return data ?? [];
  },

  async searchProducts(filters: CatalogFilters): Promise<ProductPage> {
    let { rows, total } = await runSearch(filters, filters.page);
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    let page = filters.page;
    if (page > pageCount) {
      page = pageCount;
      ({ rows, total } = await runSearch(filters, page));
    }
    return { items: rows.map(toSummary), total, page, pageCount };
  },

  async getProduct(slug: string): Promise<ProductDetail | null> {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `${summarySelect({ innerBrand: false })}, family_key, description, ship_class, weight_lb, specs, documents:product_documents(label, storage_path, sort_order)`,
      )
      .eq("status", "active")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(`Product load failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as DetailRow;

    let variants: ProductDetail["variants"] = [];
    if (row.family_key) {
      const { data: siblings, error: siblingError } = await supabase
        .from("products")
        .select("slug, condition, price_cents, in_stock")
        .eq("status", "active")
        .eq("family_key", row.family_key)
        .order("condition");
      if (siblingError) throw new Error(`Variant load failed: ${siblingError.message}`);
      variants = (siblings ?? []).map((s) => ({
        slug: s.slug,
        condition: s.condition,
        priceCents: s.price_cents,
        inStock: s.in_stock,
      }));
    }

    return {
      ...toSummary(row),
      familyKey: row.family_key,
      description: row.description,
      shipClass: row.ship_class,
      weightLb: num(row.weight_lb),
      specs: toSpecs(row.specs),
      images: [...(row.images ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ url: storagePublicUrl("product-images", i.storage_path), alt: i.alt })),
      documents: [...(row.documents ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((d) => ({ label: d.label, url: storagePublicUrl("product-documents", d.storage_path) })),
      variants,
    };
  },

  async getProductBySku(sku: string) {
    const { data, error } = await createPublicClient()
      .from("products")
      .select(summarySelect({ innerBrand: false }))
      .eq("status", "active")
      .eq("sku", sku)
      .maybeSingle();
    if (error) throw new Error(`Product load failed: ${error.message}`);
    return data ? toSummary(data as unknown as SummaryRow) : null;
  },

  async getFeatured(limit: number) {
    const { data, error } = await createPublicClient()
      .from("products")
      .select(summarySelect({ innerBrand: false }))
      .eq("status", "active")
      .eq("featured", true)
      .eq("in_stock", true)
      .order("name")
      .limit(limit);
    if (error) throw new Error(`Featured load failed: ${error.message}`);
    return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
  },

  async listProductSlugs() {
    const { data, error } = await createPublicClient()
      .from("products")
      .select("slug")
      .eq("status", "active");
    if (error) throw new Error(`Slug load failed: ${error.message}`);
    return (data ?? []).map((p) => p.slug);
  },
};
