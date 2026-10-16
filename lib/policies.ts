/**
 * The customer policies linked from the footer and, in Phase 2, from the
 * cart and checkout. Wording lives in components/site/policy-content.tsx.
 *
 * `draft` pages carry a notice that the wording isn't final and are kept out
 * of search engines and the sitemap. Set it to false once Morse has approved
 * a page's wording and filled in every bracketed [XX] value.
 */
export const POLICIES = [
  {
    slug: "terms-of-sale",
    title: "Terms of sale",
    description: "Prices, payment, taxes, core charges and other terms for everything Morse Electric sells.",
    draft: true,
  },
  {
    slug: "returns",
    title: "Returns",
    description: "How to return a part to Morse Electric, what can be returned and how refunds work.",
    draft: true,
  },
  {
    slug: "shipping",
    title: "Shipping & pickup",
    description: "How Morse Electric ships parcels and freight, delivery times and local pickup.",
    draft: true,
  },
  {
    slug: "warranty",
    title: "Warranty",
    description: "Warranty on new, remanufactured, exchange and used units, and on Morse Electric repairs.",
    draft: true,
  },
  {
    slug: "privacy",
    title: "Privacy",
    description: "What Morse Electric collects through this website, why, and who it is shared with.",
    draft: true,
  },
] as const;

export type PolicySlug = (typeof POLICIES)[number]["slug"];

export function getPolicy(slug: string) {
  return POLICIES.find((p) => p.slug === slug) ?? null;
}
