import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CatalogView } from "@/components/catalog/catalog-view";
import { getCatalog } from "@/lib/catalog";
import { canonicalShopHref, parseFilters } from "@/lib/catalog/filters";

export async function generateMetadata(props: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category: slug } = await props.params;
  const category = (await getCatalog().listCategories()).find((c) => c.slug === slug);
  if (!category) return {};
  return {
    title: `${category.name} for sale`,
    description: category.description ?? undefined,
    alternates: { canonical: `/shop/${category.slug}` },
  };
}

export default async function CategoryPage(props: PageProps<"/shop/[category]">) {
  const [{ category: slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const categories = await getCatalog().listCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const filters = parseFilters(searchParams, category.slug);
  const canonical = canonicalShopHref(searchParams, filters);
  if (canonical) redirect(canonical);

  return <CatalogView filters={filters} categories={categories} category={category} />;
}
