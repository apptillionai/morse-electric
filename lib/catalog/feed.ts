import { shippingRateFor, type ShippingRate } from "@/lib/orders/pricing";
import { MAX_PARCEL_LB } from "@/lib/orders/shipping";
import type { ProductCondition, ShipClass } from "./types";

/**
 * The Google Merchant Center product feed (free listings and Shopping ads),
 * as RSS 2.0 with the g: namespace. Pure, so what goes in and how it's
 * written are unit-tested.
 *
 * A product is listed only when Google would accept it and a customer could
 * buy it online at the listed price:
 *   - it has a price and no core charge (a core deposit on top would make the
 *     checkout price differ from the listed one);
 *   - it ships by parcel and has a weight inside a shipping band, so the feed
 *     can state the shipping price. With live carrier rates on (`rates` is
 *     null) the price depends on the address, so the feed leaves shipping to
 *     Merchant Center's carrier-calculated rates and only needs the weight to
 *     fit one parcel;
 *   - it has one of Morse's own photos (stand-in stock photos don't show the
 *     actual unit, which Google requires).
 */

export interface FeedProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  /** Shown when there's no description. */
  summary: string;
  condition: ProductCondition;
  priceCents: number | null;
  coreChargeCents: number | null;
  inStock: boolean;
  brand: string | null;
  mfrPartNumber: string | null;
  categoryName: string | null;
  shipClass: ShipClass;
  weightLb: number | null;
  /** Public URLs of Morse's own photos, in order (stand-ins excluded). */
  imageUrls: string[];
}

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  availability: "in_stock" | "out_of_stock";
  price: string;
  condition: "new" | "refurbished" | "used";
  brand: string | null;
  mpn: string | null;
  productType: string | null;
  /** Null with live rates: Merchant Center works shipping out from the weight. */
  shippingPrice: string | null;
  shippingWeight: string;
}

/** Google's condition values. Remanufactured and exchange units are "refurbished". */
export const GOOGLE_CONDITION: Record<ProductCondition, FeedItem["condition"]> = {
  new: "new",
  remanufactured: "refurbished",
  exchange: "refurbished",
  used_tested: "used",
};

const usd = (cents: number) => `${(cents / 100).toFixed(2)} USD`;

/** Why a product is left out of the feed, or null when it's listed. */
export function feedExclusion(p: FeedProduct, rates: ShippingRate[] | null): string | null {
  if (p.priceCents === null) return "no price";
  if ((p.coreChargeCents ?? 0) > 0) return "has a core charge";
  if (p.shipClass !== "parcel") return "doesn't ship by parcel";
  if (p.weightLb === null) return "no weight";
  if (rates === null ? p.weightLb > MAX_PARCEL_LB : shippingRateFor(p.weightLb, rates) === null) {
    return rates === null ? "too heavy for one parcel" : "too heavy for the shipping bands";
  }
  if (!p.imageUrls.length) return "no photo of its own";
  return null;
}

export function feedItems(products: FeedProduct[], rates: ShippingRate[] | null, siteUrl: string): FeedItem[] {
  return products.flatMap((p) => {
    if (feedExclusion(p, rates) !== null) return [];
    const [image, ...more] = p.imageUrls;
    return [
      {
        id: p.sku,
        title: p.name.slice(0, 150),
        description: (p.description ?? p.summary).slice(0, 5000),
        link: `${siteUrl}/products/${p.slug}`,
        imageLink: image,
        additionalImageLinks: more.slice(0, 10),
        availability: p.inStock ? "in_stock" : "out_of_stock",
        price: usd(p.priceCents!),
        condition: GOOGLE_CONDITION[p.condition],
        brand: p.brand,
        mpn: p.mfrPartNumber,
        productType: p.categoryName,
        shippingPrice: rates === null ? null : usd(shippingRateFor(p.weightLb!, rates)!),
        shippingWeight: `${p.weightLb} lb`,
      },
    ];
  });
}

const xml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!)
    // Characters XML 1.0 can't carry at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const tag = (name: string, value: string | null) => (value ? `<${name}>${xml(value)}</${name}>` : "");

export function renderFeed(items: FeedItem[], channel: { title: string; link: string; description: string }): string {
  const entries = items.map((i) =>
    [
      "<item>",
      tag("g:id", i.id),
      tag("title", i.title),
      tag("description", i.description),
      tag("link", i.link),
      tag("g:image_link", i.imageLink),
      ...i.additionalImageLinks.map((l) => tag("g:additional_image_link", l)),
      tag("g:availability", i.availability),
      tag("g:price", i.price),
      tag("g:condition", i.condition),
      tag("g:brand", i.brand),
      tag("g:mpn", i.mpn),
      // Without a brand and part number, Google needs to be told there's no identifier.
      i.brand && i.mpn ? "" : tag("g:identifier_exists", "no"),
      tag("g:product_type", i.productType),
      i.shippingPrice ? `<g:shipping><g:country>US</g:country><g:service>Ground</g:service>${tag("g:price", i.shippingPrice)}</g:shipping>` : "",
      tag("g:shipping_weight", i.shippingWeight),
      "</item>",
    ].join(""),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    tag("title", channel.title),
    tag("link", channel.link),
    tag("description", channel.description),
    ...entries,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}
