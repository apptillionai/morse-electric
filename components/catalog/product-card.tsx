import Link from "next/link";
import type { ProductSummary } from "@/lib/catalog/types";
import { ConditionBadge, PriceLabel, ProductPhoto, StockStatus, specLine } from "./product-bits";

export function ProductCard({ product }: { product: ProductSummary }) {
  const href = `/products/${product.slug}`;
  return (
    <article className="relative flex flex-col overflow-hidden rounded-md border border-edge bg-surface">
      <div className="relative">
        <ProductPhoto src={product.imageUrl} alt="" className="h-44" />
        <span className="absolute top-3 left-3">
          <ConditionBadge product={product} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="font-mono text-xs text-fg-muted">{product.sku}</span>
        <h3 className="text-base leading-snug font-semibold">
          {/* Stretched link: the whole card is clickable, one tab stop. */}
          <Link href={href} className="text-fg no-underline after:absolute after:inset-0 hover:text-accent-ink">
            {product.name}
          </Link>
        </h3>
        <span className="font-mono text-[13px] leading-normal text-fg-muted">{specLine(product)}</span>
        <StockStatus inStock={product.inStock} />
        <div className="mt-auto flex items-end justify-between gap-2.5 pt-2">
          <PriceLabel cents={product.priceCents} />
          <span className="text-sm font-semibold text-accent-ink">View →</span>
        </div>
      </div>
    </article>
  );
}
