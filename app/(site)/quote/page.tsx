import type { Metadata } from "next";
import { QuoteForm } from "@/components/forms/quote-form";
import { PhoneLink } from "@/components/site/site-header";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Request a quote",
  description: "Get pricing and availability on motors, pumps, blowers, vacuum pumps, starters and alternators.",
  alternates: { canonical: "/quote" },
};

export default async function QuotePage(props: PageProps<"/quote">) {
  const { sku } = await props.searchParams;
  const product = typeof sku === "string" && sku.length <= 80 ? await getCatalog().getProductBySku(sku) : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-wrap gap-10 px-6 pt-12 pb-20">
      <div className="flex flex-[1_1_320px] flex-col gap-4">
        <span className="eyebrow">Pricing &amp; availability</span>
        <h1 className="display text-5xl">Request a quote</h1>
        <p className="leading-relaxed text-fg-muted">
          Send a part number, or the nameplate details from the unit you’re replacing: make, HP, RPM, frame, voltage
          and enclosure. We’ll reply with stock, price and lead time.
        </p>
        <p className="leading-relaxed text-fg-muted">
          Need it today? Call <PhoneLink className="font-semibold" />.
        </p>
      </div>
      <div className="flex-[2_1_520px] rounded-md border border-edge bg-surface p-8">
        <QuoteForm product={product ? { sku: product.sku, name: product.name } : null} />
      </div>
    </div>
  );
}
