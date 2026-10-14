import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogView } from "@/components/catalog/catalog-view";
import { getCatalog } from "@/lib/catalog";
import { canonicalShopHref, parseFilters, shopHref } from "@/lib/catalog/filters";

export const metadata: Metadata = {
  title: "Shop motors & parts",
  description:
    "Shop new and remanufactured electric motors, pumps, blowers, vacuum pumps, starters and alternators. Filter by horsepower, RPM, frame and enclosure.",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage(props: PageProps<"/shop">) {
  const searchParams = await props.searchParams;
  const categories = await getCatalog().listCategories();

  // The home page part finder submits ?category=…; categories live in the path.
  const requested = typeof searchParams.category === "string" ? searchParams.category : null;
  if (requested && categories.some((c) => c.slug === requested)) {
    redirect(shopHref(parseFilters(searchParams, requested)));
  }

  const filters = parseFilters(searchParams);
  const canonical = canonicalShopHref(searchParams, filters);
  if (canonical) redirect(canonical);

  return <CatalogView filters={filters} categories={categories} category={null} />;
}
