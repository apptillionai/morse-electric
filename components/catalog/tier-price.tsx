"use client";

import { useEffect, useState } from "react";
import { formatPercent, tierPriceCents, type CustomerPricing } from "@/lib/orders/pricing";
import { formatPrice } from "@/lib/utils";

/** Supabase's session cookie; without it nobody is signed in, so there's nothing to fetch. */
const SIGNED_IN = /(?:^|;\s*)sb-[^=]+-auth-token/;

/**
 * A signed-in customer's own price, under the list price. Fetched in the
 * browser so product pages stay static for everyone else.
 */
export function TierPrice({ listCents }: { listCents: number }) {
  const [pricing, setPricing] = useState<CustomerPricing | null>(null);

  useEffect(() => {
    if (!SIGNED_IN.test(document.cookie)) return;
    const controller = new AbortController();
    fetch("/api/account/pricing", { signal: controller.signal, credentials: "same-origin" })
      .then((r) => (r.status === 200 ? (r.json() as Promise<CustomerPricing>) : null))
      .then((data) => data && setPricing(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!pricing) return null;
  const cents = tierPriceCents(listCents, pricing.discountPercent);
  if (cents >= listCents) return null;
  return (
    <p className="text-[15px]">
      <strong>
        Your {pricing.tierName.toLowerCase()} price: {formatPrice(cents)}
      </strong>{" "}
      <span className="text-fg-muted">({formatPercent(pricing.discountPercent)} off list, applied in your cart)</span>
    </p>
  );
}
