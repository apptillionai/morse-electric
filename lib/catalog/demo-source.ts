import { EMPTY_FILTERS, filterProducts, paginate, type CatalogFilters } from "./filters";
import { SEED_CATEGORIES, SEED_PRODUCTS, type SeedProduct } from "./seed";
import type { CatalogSource, ProductPage } from "./source";
import type { ProductDetail, ProductSummary } from "./types";

function toDetail(p: SeedProduct): ProductDetail {
  return {
    id: p.sku,
    sku: p.sku,
    mfrPartNumber: p.mfrPartNumber,
    slug: p.slug,
    name: p.name,
    categorySlug: p.category,
    brand: null,
    condition: p.condition,
    priceCents: p.priceCents,
    coreChargeCents: p.coreChargeCents,
    inStock: p.qtyOnHand > 0,
    featured: p.featured,
    hp: p.hp,
    rpm: p.rpm,
    frame: p.frame,
    enclosure: p.enclosure,
    power: p.power,
    voltage: p.voltage,
    imageUrl: null,
    familyKey: p.familyKey,
    description: p.description,
    shipClass: p.shipClass,
    weightLb: p.weightLb,
    specs: p.specs,
    images: [],
    documents: [],
    variants: [],
  };
}

const DETAILS = SEED_PRODUCTS.map(toDetail);
for (const detail of DETAILS) {
  detail.variants = detail.familyKey
    ? DETAILS.filter((d) => d.familyKey === detail.familyKey).map(({ slug, condition, priceCents, inStock }) => ({
        slug,
        condition,
        priceCents,
        inStock,
      }))
    : [];
}

function summary(detail: ProductDetail): ProductSummary {
  return {
    id: detail.id,
    sku: detail.sku,
    mfrPartNumber: detail.mfrPartNumber,
    slug: detail.slug,
    name: detail.name,
    categorySlug: detail.categorySlug,
    brand: detail.brand,
    condition: detail.condition,
    priceCents: detail.priceCents,
    coreChargeCents: detail.coreChargeCents,
    inStock: detail.inStock,
    featured: detail.featured,
    hp: detail.hp,
    rpm: detail.rpm,
    frame: detail.frame,
    enclosure: detail.enclosure,
    power: detail.power,
    voltage: detail.voltage,
    imageUrl: detail.imageUrl,
  };
}

const SUMMARIES = DETAILS.map(summary);

/** Placeholder catalog served when Supabase is not configured. */
export const demoCatalog: CatalogSource = {
  isDemo: true,
  async listCategories() {
    return SEED_CATEGORIES;
  },
  async listBrands() {
    return [];
  },
  async searchProducts(filters: CatalogFilters): Promise<ProductPage> {
    return paginate(filterProducts(SUMMARIES, filters), filters.page);
  },
  async getProduct(slug: string) {
    return DETAILS.find((d) => d.slug === slug) ?? null;
  },
  async getProductBySku(sku: string) {
    return SUMMARIES.find((p) => p.sku === sku) ?? null;
  },
  async getFeatured(limit: number) {
    return filterProducts(SUMMARIES, { ...EMPTY_FILTERS, inStock: true })
      .filter((p) => p.featured)
      .slice(0, limit);
  },
  async listProductSlugs() {
    return SUMMARIES.map((p) => p.slug);
  },
};
