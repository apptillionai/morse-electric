import {
  canonicalShopHref,
  EMPTY_FILTERS,
  filterProducts,
  filtersToSearchParams,
  matchedCrossReference,
  paginate,
  partKeys,
  parseFilters,
  searchTerms,
  shopHref,
  type CatalogFilters,
} from "@/lib/catalog/filters";
import { demoCatalog } from "@/lib/catalog/demo-source";
import type { ProductSummary } from "@/lib/catalog/types";

function product(overrides: Partial<ProductSummary>): ProductSummary {
  return {
    id: overrides.sku ?? "id",
    sku: "SKU",
    mfrPartNumber: null,
    crossReferences: [],
    slug: "slug",
    name: "Motor",
    categorySlug: "electric-motors",
    brand: null,
    condition: "new",
    priceCents: null,
    coreChargeCents: null,
    inStock: true,
    featured: false,
    hp: null,
    rpm: null,
    frame: null,
    enclosure: null,
    power: null,
    voltage: null,
    imageUrl: null,
    ...overrides,
  };
}

const filters = (patch: Partial<CatalogFilters>): CatalogFilters => ({ ...EMPTY_FILTERS, ...patch });

describe("parseFilters", () => {
  it("parses every supported param", () => {
    const parsed = parseFilters(
      {
        q: "184T",
        condition: ["new", "remanufactured"],
        in_stock: "1",
        hp_min: "2",
        hp_max: "10",
        rpm: "1800",
        enclosure: "tefc",
        power: "ac_3ph",
        frame: "184t",
        brand: "acme",
        sort: "hp-desc",
        page: "2",
      },
      "electric-motors",
    );
    expect(parsed).toEqual({
      category: "electric-motors",
      q: "184T",
      conditions: ["new", "remanufactured"],
      inStock: true,
      hpMin: 2,
      hpMax: 10,
      rpm: ["1800"],
      enclosures: ["tefc"],
      power: "ac_3ph",
      frame: "184T",
      brand: "acme",
      sort: "hp-desc",
      page: 2,
    });
  });

  it("drops unknown and malformed values instead of failing", () => {
    const parsed = parseFilters({
      condition: ["new", "bogus"],
      rpm: "7200",
      enclosure: "<script>",
      power: "nuclear",
      hp_min: "-3",
      hp_max: "abc",
      sort: "price",
      page: "0",
      frame: "18'4T;",
    });
    expect(parsed.conditions).toEqual(["new"]);
    expect(parsed.rpm).toEqual([]);
    expect(parsed.enclosures).toEqual([]);
    expect(parsed.power).toBeNull();
    expect(parsed.hpMin).toBeNull();
    expect(parsed.hpMax).toBeNull();
    expect(parsed.sort).toBe("featured");
    expect(parsed.page).toBe(1);
    expect(parsed.frame).toBe("184T");
  });

  it("treats the part finder's hp as an exact match and swaps an inverted range", () => {
    expect(parseFilters({ hp: "5" })).toMatchObject({ hpMin: 5, hpMax: 5 });
    expect(parseFilters({ hp_min: "10", hp_max: "2" })).toMatchObject({ hpMin: 2, hpMax: 10 });
  });

  it("accepts comma-separated multi-values", () => {
    expect(parseFilters({ condition: "new,exchange" }).conditions).toEqual(["new", "exchange"]);
  });
});

describe("filtersToSearchParams / shopHref", () => {
  it("round-trips through parseFilters", () => {
    const original = filters({
      category: "pumps",
      q: "well",
      conditions: ["remanufactured"],
      inStock: true,
      hpMin: 1,
      hpMax: 3,
      rpm: ["3600"],
      enclosures: ["odp"],
      power: "ac_1ph",
      frame: "56C",
      sort: "name",
      page: 3,
    });
    const params = Object.fromEntries(
      [...filtersToSearchParams(original).keys()].map((k) => [k, filtersToSearchParams(original).getAll(k)]),
    );
    expect(parseFilters(params, "pumps")).toEqual(original);
  });

  it("puts the category in the path and resets to page 1 on change", () => {
    const current = filters({ category: "pumps", inStock: true, page: 4 });
    expect(shopHref(current, { category: "blowers" })).toBe("/shop/blowers?in_stock=1");
    expect(shopHref(filters({}))).toBe("/shop");
    expect(shopHref(current, { page: 2 })).toBe("/shop/pumps?in_stock=1&page=2");
  });

  it("redirects only when the GET form left blank params", () => {
    const params = { hp_min: "", enclosure: "xp", power: "" };
    expect(canonicalShopHref(params, parseFilters(params, "electric-motors"))).toBe("/shop/electric-motors?enclosure=xp");
    const clean = { enclosure: "xp", page: "2" };
    expect(canonicalShopHref(clean, parseFilters(clean))).toBeNull();
    const blankWithPage = { page: "2", frame: "" };
    expect(canonicalShopHref(blankWithPage, parseFilters(blankWithPage))).toBe("/shop?page=2");
  });

  it("writes an exact horsepower as hp=", () => {
    expect(filtersToSearchParams(filters({ hpMin: 5, hpMax: 5 })).toString()).toBe("hp=5");
  });
});

describe("filterProducts", () => {
  const items = [
    product({ sku: "A", name: "Alpha motor", hp: 5, rpm: 1750, frame: "184T", enclosure: "tefc", power: "ac_3ph", featured: true }),
    product({ sku: "B", name: "Bravo motor", hp: 2, rpm: 3450, frame: "145T", enclosure: "odp", power: "ac_1ph", inStock: false }),
    product({ sku: "C", name: "Charlie pump", categorySlug: "pumps", hp: 1, rpm: 3450, condition: "remanufactured" }),
    product({ sku: "D", name: "Delta starter", categorySlug: "starters-controls", power: "dc" }),
  ];
  const skus = (f: Partial<CatalogFilters>) => filterProducts(items, filters(f)).map((p) => p.sku);

  it("filters by category, condition and stock", () => {
    expect(skus({ category: "pumps" })).toEqual(["C"]);
    expect(skus({ conditions: ["remanufactured"] })).toEqual(["C"]);
    expect(skus({ inStock: true })).not.toContain("B");
  });

  it("excludes products without horsepower from horsepower filters", () => {
    expect(skus({ hpMin: 2 })).toEqual(["A", "B"]);
    expect(skus({ hpMax: 1 })).toEqual(["C"]);
  });

  it("matches nameplate speed bands", () => {
    expect(skus({ rpm: ["1800"] })).toEqual(["A"]);
    expect(skus({ rpm: ["3600"] }).sort()).toEqual(["B", "C"]);
    expect(skus({ rpm: ["1800", "3600"] }).sort()).toEqual(["A", "B", "C"]);
  });

  it("filters by enclosure, power and frame", () => {
    expect(skus({ enclosures: ["odp"] })).toEqual(["B"]);
    expect(skus({ power: "dc" })).toEqual(["D"]);
    expect(skus({ frame: "184T" })).toEqual(["A"]);
  });

  it("requires every search term to match", () => {
    expect(skus({ q: "motor 184t" })).toEqual(["A"]);
    expect(skus({ q: "pump" })).toEqual(["C"]);
    expect(skus({ q: "nothing" })).toEqual([]);
  });

  it("finds part numbers however they're punctuated, including cross-references", () => {
    const parts = [
      product({ sku: "EM-5HP", mfrPartNumber: "EM3615T", crossReferences: ["WEG 00518ET3E184T", "Marathon U206"] }),
      product({ sku: "OTHER", name: "Other motor" }),
    ];
    const found = (q: string) => filterProducts(parts, filters({ q })).map((p) => p.sku);
    expect(found("EM-3615T")).toEqual(["EM-5HP"]);
    expect(found("em 3615t")).toEqual(["EM-5HP"]);
    expect(found("00518et3e184t")).toEqual(["EM-5HP"]);
    expect(found("U-206")).toEqual(["EM-5HP"]);
    expect(found("em5hp")).toEqual(["EM-5HP"]);
    expect(found("u-999")).toEqual([]);
  });

  it("sorts featured and in-stock first by default", () => {
    expect(skus({})[0]).toBe("A");
    expect(skus({}).at(-1)).toBe("B");
    expect(skus({ sort: "hp-asc" })).toEqual(["C", "B", "A", "D"]);
    expect(skus({ sort: "hp-desc" })).toEqual(["A", "B", "C", "D"]);
  });
});

describe("searchTerms", () => {
  it("strips characters that are special to PostgREST filters and LIKE", () => {
    expect(searchTerms("184T,(or)% 5*_hp")).toEqual(["184t", "or", "5", "hp"]);
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms(null)).toEqual([]);
  });
});

describe("part keys", () => {
  const p = product({ sku: "EM-5HP", mfrPartNumber: "EM3615T", crossReferences: ["WEG 00518ET3E184T", "Leeson 121.017"] });

  it("keeps only lowercase letters, digits and spaces, like the database trigger", () => {
    expect(partKeys(p)).toBe("em5hp em3615t weg 00518et3e184t leeson 121017");
  });

  it("names the cross-reference a search matched", () => {
    expect(matchedCrossReference(p, "121-017")).toBe("Leeson 121.017");
    expect(matchedCrossReference(p, "EM3615T")).toBeNull();
    expect(matchedCrossReference(p, "ab")).toBeNull();
    expect(matchedCrossReference(p, null)).toBeNull();
  });
});

describe("paginate", () => {
  it("clamps out-of-range pages", () => {
    const result = paginate([1, 2, 3, 4, 5], 9, 2);
    expect(result).toEqual({ items: [5], total: 5, page: 3, pageCount: 3 });
  });
});

describe("demoCatalog", () => {
  it("links condition variants of the same unit", async () => {
    const detail = await demoCatalog.getProduct("5-hp-general-purpose-motor-184t-new");
    expect(detail?.variants.map((v) => v.condition)).toEqual(["new", "remanufactured", "exchange"]);
  });

  it("only features in-stock products", async () => {
    const featured = await demoCatalog.getFeatured(10);
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((p) => p.inStock && p.featured)).toBe(true);
  });

  it("has unique slugs", async () => {
    const slugs = await demoCatalog.listProductSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("seed data", () => {
  it("satisfies the database constraints", async () => {
    const { SEED_CATEGORIES, SEED_PRODUCTS } = await import("@/lib/catalog/seed");
    const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    const categories = new Set(SEED_CATEGORIES.map((c) => c.slug));
    expect(SEED_CATEGORIES.every((c) => slug.test(c.slug))).toBe(true);
    expect(SEED_PRODUCTS.every((p) => slug.test(p.slug))).toBe(true);
    expect(SEED_PRODUCTS.every((p) => categories.has(p.category))).toBe(true);
    expect(new Set(SEED_PRODUCTS.map((p) => p.sku)).size).toBe(SEED_PRODUCTS.length);
    expect(new Set(SEED_PRODUCTS.map((p) => p.slug)).size).toBe(SEED_PRODUCTS.length);
  });
});
