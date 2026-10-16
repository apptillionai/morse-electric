import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/catalog";
import { POLICIES } from "@/lib/policies";
import { SITE } from "@/lib/site";

// Prerendered, then refreshed so stock and featured items stay current.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = getCatalog();
  const [categories, slugs] = await Promise.all([catalog.listCategories(), catalog.listProductSlugs()]);
  const url = (path: string) => `${SITE.url}${path}`;

  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/shop"), changeFrequency: "daily", priority: 0.9 },
    { url: url("/service"), changeFrequency: "monthly", priority: 0.8 },
    { url: url("/quote"), changeFrequency: "yearly", priority: 0.5 },
    { url: url("/contact"), changeFrequency: "yearly", priority: 0.5 },
    // Draft policies are noindex until Morse approves them.
    ...POLICIES.filter((p) => !p.draft).map((p) => ({ url: url(`/policies/${p.slug}`), changeFrequency: "yearly" as const, priority: 0.3 })),
    ...categories.map((c) => ({ url: url(`/shop/${c.slug}`), changeFrequency: "daily" as const, priority: 0.8 })),
    ...slugs.map((slug) => ({ url: url(`/products/${slug}`), changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
