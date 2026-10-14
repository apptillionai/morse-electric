import type { CatalogFilters } from "./filters";
import type { Brand, Category, ProductDetail, ProductSummary } from "./types";

export interface ProductPage {
  items: ProductSummary[];
  total: number;
  page: number;
  pageCount: number;
}

export interface CatalogSource {
  /** True when serving placeholder products instead of Morse's live catalog. */
  readonly isDemo: boolean;
  listCategories(): Promise<Category[]>;
  listBrands(): Promise<Brand[]>;
  searchProducts(filters: CatalogFilters): Promise<ProductPage>;
  getProduct(slug: string): Promise<ProductDetail | null>;
  getProductBySku(sku: string): Promise<ProductSummary | null>;
  getFeatured(limit: number): Promise<ProductSummary[]>;
  listProductSlugs(): Promise<string[]>;
}
