import { Check, Clock } from "lucide-react";
import Image from "next/image";
import { CONDITION_LABELS, ENCLOSURE_LABELS, type ProductSummary } from "@/lib/catalog/types";
import { cn, formatHp, formatPrice } from "@/lib/utils";

export function StockStatus({ inStock, className }: { inStock: boolean; className?: string }) {
  return inStock ? (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok", className)}>
      <Check size={14} strokeWidth={3} aria-hidden="true" />
      In stock
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold text-warn", className)}>
      <Clock size={14} strokeWidth={2.5} aria-hidden="true" />
      Special order
    </span>
  );
}

export function ConditionBadge({ product }: { product: Pick<ProductSummary, "condition"> }) {
  return (
    <span className="rounded-sm bg-bold px-2 py-1 text-xs font-semibold text-on-bold">
      {CONDITION_LABELS[product.condition]}
    </span>
  );
}

export function PriceLabel({ cents, className }: { cents: number | null; className?: string }) {
  const price = formatPrice(cents);
  return price ? (
    <span className={cn("font-display text-[28px] font-bold normal-case", className)}>{price}</span>
  ) : (
    <span className={cn("text-[15px] font-semibold text-fg", className)}>Price on request</span>
  );
}

/** One-line nameplate summary: "5 HP · 1750 RPM · 184T · TEFC · 208-230/460V". */
export function specLine(p: ProductSummary): string {
  return [
    p.hp !== null ? `${formatHp(p.hp)} HP` : null,
    p.rpm !== null ? `${p.rpm} RPM` : null,
    p.frame,
    p.enclosure ? ENCLOSURE_LABELS[p.enclosure] : null,
    p.voltage,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ProductPhoto({
  src,
  alt,
  label = "Photo coming soon",
  className,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
}: {
  src: string | null;
  alt: string;
  label?: string;
  className?: string;
  sizes?: string;
}) {
  if (src) {
    return (
      <div className={cn("relative overflow-hidden bg-surface", className)}>
        <Image src={src} alt={alt} fill sizes={sizes} className="object-contain" />
      </div>
    );
  }
  return (
    <div className={cn("photo-placeholder flex items-center justify-center text-[13px] text-fg-muted", className)}>
      {label}
    </div>
  );
}
