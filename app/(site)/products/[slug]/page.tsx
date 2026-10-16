import { Truck, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoCatalogBanner } from "@/components/catalog/demo-banner";
import { PhotoCredits, PriceLabel, ProductPhoto, StockStatus, specLine } from "@/components/catalog/product-bits";
import { PhoneLink } from "@/components/site/site-header";
import { addToCartAction } from "@/app/actions/cart";
import { Button, ButtonLink } from "@/components/ui/button";
import { getCatalog } from "@/lib/catalog";
import {
  CONDITION_LABELS,
  ENCLOSURE_LABELS,
  POWER_LABELS,
  type ProductDetail,
} from "@/lib/catalog/types";
import { onlinePurchaseBlock } from "@/lib/orders/pricing";
import { storeIsOpen } from "@/lib/orders/store";
import { SITE } from "@/lib/site";
import { getBusiness } from "@/lib/site-settings";
import { cn, formatHp, formatPrice } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getCatalog().getProduct(slug);
  if (!product) return {};
  return {
    title: `${product.name} (${CONDITION_LABELS[product.condition]})`,
    description: product.description ?? `${product.name}. ${specLine(product)}. Part # ${product.sku}.`,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      url: `/products/${product.slug}`,
      title: product.name,
      description: specLine(product),
      // Child openGraph replaces the parent's, so fall back to the site share image explicitly.
      images: product.images[0]
        ? [{ url: product.images[0].url, alt: product.images[0].alt || product.name }]
        : [{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE.name }],
    },
  };
}

function specRows(p: ProductDetail): [string, string][] {
  const rows: [string, string | null][] = [
    ["Horsepower", p.hp !== null ? `${formatHp(p.hp)} HP` : null],
    ["Speed", p.rpm !== null ? `${p.rpm} RPM` : null],
    ["Frame", p.frame],
    ["Enclosure", p.enclosure ? ENCLOSURE_LABELS[p.enclosure] : null],
    ["Power", p.power ? POWER_LABELS[p.power] : null],
    ["Voltage", p.voltage],
    ["Condition", CONDITION_LABELS[p.condition]],
    ["Weight", p.weightLb !== null ? `${p.weightLb} lb` : null],
  ];
  return [
    ...rows.filter((r): r is [string, string] => r[1] !== null),
    ...p.specs.map((s): [string, string] => [s.label, s.value]),
  ];
}

const FULFILLMENT: Record<ProductDetail["shipClass"], string> = {
  parcel: "Ships by ground parcel, or pick up at our shop.",
  ltl: "Ships by LTL freight (we quote it for you), or pick up at our shop.",
  pickup_only: "Available for pickup at our shop.",
};

function productJsonLd(p: ProductDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    mpn: p.mfrPartNumber ?? undefined,
    description: p.description ?? specLine(p),
    url: `${SITE.url}/products/${p.slug}`,
    image: p.images.map((i) => i.url),
    brand: p.brand ? { "@type": "Brand", name: p.brand.name } : undefined,
    itemCondition:
      p.condition === "new" ? "https://schema.org/NewCondition"
      : p.condition === "used_tested" ? "https://schema.org/UsedCondition"
      : "https://schema.org/RefurbishedCondition",
    offers:
      p.priceCents !== null
        ? {
            "@type": "Offer",
            price: (p.priceCents / 100).toFixed(2),
            priceCurrency: "USD",
            availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/BackOrder",
            url: `${SITE.url}/products/${p.slug}`,
          }
        : undefined,
  };
}

export default async function ProductPage(props: PageProps<"/products/[slug]">) {
  const { slug } = await props.params;
  const catalog = getCatalog();
  const product = await catalog.getProduct(slug);
  if (!product) notFound();
  const category = (await catalog.listCategories()).find((c) => c.slug === product.categorySlug);
  const quoteHref = `/quote?sku=${encodeURIComponent(product.sku)}`;
  const core = formatPrice(product.coreChargeCents);
  const business = await getBusiness();
  // Buyable online: the store is open, and the item is priced, in stock, and
  // ships by parcel or is collected (everything else stays quote-only).
  const buyable =
    !catalog.isDemo &&
    product.inStock &&
    (await storeIsOpen()) &&
    onlinePurchaseBlock({ ...product, active: true }) === null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)).replace(/</g, "\\u003c") }}
      />
      <DemoCatalogBanner show={catalog.isDemo} />
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 pt-7 pb-20">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-fg-muted">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/shop">Shop</Link>
          {category && (
            <>
              <span aria-hidden="true">/</span>
              <Link href={`/shop/${category.slug}`}>{category.name}</Link>
            </>
          )}
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="font-medium text-fg">{product.sku}</span>
        </nav>

        <div className="flex flex-wrap items-start gap-12">
          {/* Gallery */}
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-3">
            <ProductPhoto
              src={product.images[0]?.url ?? null}
              alt={product.images[0]?.alt || product.name}
              className="aspect-[4/3] rounded-md"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-3">
                {product.images.slice(1, 5).map((image) => (
                  <ProductPhoto key={image.url} src={image.url} alt={image.alt} className="aspect-square rounded" sizes="15vw" />
                ))}
              </div>
            )}
            <PhotoCredits credits={product.images.slice(0, 5).flatMap((i) => (i.credit ? [i.credit] : []))} />
          </div>

          {/* Buy box */}
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[13px] text-fg-muted">
                Part # {product.sku}
                {product.mfrPartNumber && <> · Mfr # {product.mfrPartNumber}</>}
              </span>
              <h1 className="display text-[44px]">{product.name}</h1>
              <span className="font-mono text-sm text-fg-muted">{specLine(product)}</span>
            </div>

            {product.variants.length > 1 && (
              <nav aria-label="Condition" className="flex flex-col gap-2.5">
                <span className="font-semibold">Condition</span>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
                  {product.variants.map((v) => {
                    const current = v.slug === product.slug;
                    return (
                      <Link
                        key={v.slug}
                        href={`/products/${v.slug}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex min-h-16 flex-col gap-0.5 rounded bg-surface p-2.5 text-fg no-underline hover:text-fg",
                          current ? "border-2 border-bold" : "border border-edge-strong hover:border-bold",
                        )}
                      >
                        <strong className="text-sm">{CONDITION_LABELS[v.condition]}</strong>
                        <span className="text-[13px] text-fg-muted">
                          {formatPrice(v.priceCents) ?? "Price on request"} · {v.inStock ? "In stock" : "Special order"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            )}

            <div className="flex flex-col gap-1">
              <PriceLabel cents={product.priceCents} className={product.priceCents !== null ? "text-5xl" : "text-2xl"} />
              {core && (
                <span className="text-sm text-fg-muted">
                  Plus {core} refundable core charge, credited when your old unit comes back.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5 rounded-md border border-edge bg-surface px-4 py-3.5">
              <StockStatus inStock={product.inStock} className="text-[15px]" />
              <span className="flex items-start gap-2 text-sm text-fg-muted">
                <Truck size={16} className="mt-0.5 flex-none" aria-hidden="true" />
                {FULFILLMENT[product.shipClass]}
              </span>
            </div>

            {buyable ? (
              <div className="flex flex-col gap-3">
                <form action={addToCartAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="productId" value={product.id} />
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Qty
                    <input
                      type="number"
                      name="quantity"
                      min={1}
                      max={99}
                      defaultValue={1}
                      className="h-14 w-20 rounded border border-edge-strong bg-surface px-3 text-base font-normal"
                    />
                  </label>
                  <Button type="submit" size="lg" className="flex-[1_1_200px]">
                    Add to cart
                  </Button>
                </form>
                <p className="text-sm text-fg-muted">
                  Need several, or account pricing? <Link href={quoteHref}>Request a quote</Link>
                  {business.phoneHref && (
                    <>
                      {" "}or call <a href={business.phoneHref}>{business.phone}</a>
                    </>
                  )}
                  .
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={quoteHref} size="lg" className="flex-[1_1_200px]">
                  {product.priceCents === null ? "Request price & availability" : "Request a quote"}
                </ButtonLink>
                {business.phoneHref && (
                  <ButtonLink href={business.phoneHref} variant="outline" size="lg">
                    Call {business.phone}
                  </ButtonLink>
                )}
              </div>
            )}
            <p className="text-sm text-fg-muted">
              Volume or account pricing? Mention it in your request, or call <PhoneLink />.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 rounded-md bg-inverse p-4 text-on-inverse">
              <Wrench size={26} className="text-on-inverse-accent" aria-hidden="true" />
              <span className="flex-[1_1_240px] text-sm leading-normal text-on-inverse-muted">
                <strong className="text-on-inverse">Have the old unit?</strong> We’ll quote a repair next to this price so
                you can compare.
              </span>
              <Link href="/service#request" className="font-semibold text-on-inverse hover:text-on-inverse-muted">
                Compare repair →
              </Link>
            </div>
          </div>
        </div>

        {product.description && (
          <section className="max-w-3xl">
            <h2 className="display mb-3 text-3xl">Overview</h2>
            <p className="leading-relaxed text-fg-muted">{product.description}</p>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-md border border-edge bg-surface p-7">
            <h2 className="display mb-4 text-3xl">Specifications</h2>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-12">
              {specRows(product).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-edge-soft py-3">
                  <dt className="text-fg-muted">{label}</dt>
                  <dd className="text-right font-mono text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-7">
            <h2 className="display text-3xl">Documents</h2>
            {product.documents.length ? (
              <ul className="flex flex-col gap-3">
                {product.documents.map((d) => (
                  <li key={d.url}>
                    <a href={d.url} className="font-semibold">{d.label}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted">Spec sheets and drawings are available on request.</p>
            )}
            <h2 className="display mt-2 text-3xl">Warranty</h2>
            <p className="text-sm leading-relaxed text-fg-muted">
              New units carry the manufacturer’s warranty. Remanufactured and exchange units carry Morse’s [XX]-month
              shop warranty. <Link href="/policies/warranty">Warranty details</Link>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
