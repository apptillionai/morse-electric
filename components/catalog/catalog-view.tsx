import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { getCatalog } from "@/lib/catalog";
import { SORTS, hasActiveFilters, matchedCrossReference, shopHref, type CatalogFilters, type Sort } from "@/lib/catalog/filters";
import type { Category } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { DemoCatalogBanner } from "./demo-banner";
import { FilterSidebar } from "./filter-sidebar";
import { ProductCard } from "./product-card";

const pill = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold no-underline";
const pillOn = "border-bold bg-bold text-on-bold hover:text-on-bold";
const pillOff = "border-edge-strong bg-surface text-fg hover:border-bold hover:text-fg";

export async function CatalogView({
  filters,
  categories,
  category,
}: {
  filters: CatalogFilters;
  categories: Category[];
  category: Category | null;
}) {
  const catalog = getCatalog();
  const [result, brands] = await Promise.all([catalog.searchProducts(filters), catalog.listBrands()]);
  const title = category?.name ?? (filters.q ? `Results for “${filters.q}”` : "All products");

  return (
    <>
      <DemoCatalogBanner show={catalog.isDemo} />
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-6 pt-7 pb-20">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-fg-muted">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          {category ? <Link href="/shop">Shop</Link> : <span>Shop</span>}
          {category && (
            <>
              <span aria-hidden="true">/</span>
              <span aria-current="page" className="font-medium text-fg">{category.name}</span>
            </>
          )}
        </nav>

        <div className="flex flex-col gap-2">
          <h1 className="display text-5xl sm:text-[56px]">{title}</h1>
          <p className="max-w-3xl text-fg-muted">
            {category?.description ??
              "New, remanufactured and tested-used units. Can’t find it? Send us the nameplate and we’ll match it."}
          </p>
        </div>

        <nav aria-label="Product categories" className="flex flex-wrap gap-2">
          <Link href={shopHref(filters, { category: null })} aria-current={!category ? "page" : undefined} className={cn(pill, !category ? pillOn : pillOff)}>
            All products
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={shopHref(filters, { category: c.slug })}
              aria-current={category?.slug === c.slug ? "page" : undefined}
              className={cn(pill, category?.slug === c.slug ? pillOn : pillOff)}
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col items-start gap-8 lg:flex-row">
          <FilterSidebar filters={filters} brands={brands} />

          <section aria-label="Results" className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-3.5">
              <p className="text-fg-muted" aria-live="polite">
                <strong className="text-fg">{result.total}</strong> {result.total === 1 ? "result" : "results"}
              </p>
              <nav aria-label="Sort" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">Sort:</span>
                {(Object.keys(SORTS) as Sort[]).map((s) => (
                  <Link
                    key={s}
                    href={shopHref(filters, { sort: s })}
                    aria-current={filters.sort === s ? "true" : undefined}
                    className={cn("py-2", filters.sort === s ? "font-semibold text-fg no-underline" : "")}
                  >
                    {SORTS[s]}
                  </Link>
                ))}
              </nav>
            </div>

            {result.items.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4.5">
                {result.items.map((p) => (
                  <ProductCard key={p.id} product={p} matched={matchedCrossReference(p, filters.q)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-4 rounded-md border border-dashed border-edge-strong bg-surface p-10">
                <p className="text-lg font-semibold">No matching products.</p>
                <p className="text-fg-muted">
                  {hasActiveFilters(filters)
                    ? "Try removing a filter, or send us the nameplate details and we’ll find a match."
                    : "Nothing listed here yet. Send us the nameplate details and we’ll find a match."}
                </p>
                <ButtonLink href="/quote" variant="dark">Request a quote</ButtonLink>
              </div>
            )}

            {result.pageCount > 1 && (
              <nav aria-label="Pagination" className="flex flex-wrap justify-center gap-2 pt-3">
                {Array.from({ length: result.pageCount }, (_, i) => i + 1).map((n) => (
                  <Link
                    key={n}
                    href={shopHref(filters, { page: n })}
                    aria-current={n === result.page ? "page" : undefined}
                    className={cn(
                      "flex size-11 items-center justify-center rounded font-semibold no-underline",
                      n === result.page ? "bg-bold text-on-bold hover:text-on-bold" : "border border-edge-strong text-fg hover:text-fg",
                    )}
                  >
                    {n}
                  </Link>
                ))}
              </nav>
            )}
          </section>
        </div>

        <NameplateCallout />
      </div>
    </>
  );
}

function NameplateCallout() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-7 rounded-md bg-inverse p-9 text-on-inverse">
      <div className="flex flex-[1_1_420px] flex-col gap-2.5">
        <h2 className="display text-4xl">Can’t find an exact match?</h2>
        <p className="leading-relaxed text-on-inverse-muted">
          Send us the nameplate details: make, HP, RPM, frame and voltage. A technician will cross-reference it and
          quote a replacement or a repair.
        </p>
      </div>
      <ButtonLink href="/quote" size="lg">Send nameplate details</ButtonLink>
    </section>
  );
}
