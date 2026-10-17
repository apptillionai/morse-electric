import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { storagePublicUrl } from "@/lib/supabase/env";
import { formatHp } from "@/lib/utils";
import type { FeedProduct } from "./feed";
import { parseCredit } from "./photo-credit";
import type { ProductCondition, ShipClass } from "./types";

interface FeedRow {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  condition: ProductCondition;
  price_cents: number | null;
  core_charge_cents: number | null;
  in_stock: boolean;
  mfr_part_number: string | null;
  ship_class: ShipClass;
  weight_lb: number | string | null;
  hp: number | string | null;
  rpm: number | null;
  frame: string | null;
  voltage: string | null;
  brand: { name: string } | null;
  category: { name: string } | null;
  images: { storage_path: string; sort_order: number; credit: unknown }[] | null;
}

const SELECT =
  "id, sku, slug, name, description, condition, price_cents, core_charge_cents, in_stock, mfr_part_number, ship_class, weight_lb, hp, rpm, frame, voltage, brand:brands(name), category:categories(name), images:product_images(storage_path, sort_order, credit)";

/** Every active product with a price, shaped for the feed (which decides what's listed). */
export async function loadFeedProducts(): Promise<FeedProduct[]> {
  const supabase = createPublicClient();
  const products: FeedProduct[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 10_000; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select(SELECT)
      .eq("status", "active")
      .not("price_cents", "is", null)
      .order("sku")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Feed products: ${error.message}`);
    for (const row of data as unknown as FeedRow[]) {
      const hp = row.hp === null ? null : Number(row.hp);
      products.push({
        id: row.id,
        sku: row.sku,
        slug: row.slug,
        name: row.name,
        description: row.description,
        summary: [hp !== null ? `${formatHp(hp)} HP` : null, row.rpm ? `${row.rpm} RPM` : null, row.frame, row.voltage, row.name]
          .filter(Boolean)
          .join(", "),
        condition: row.condition,
        priceCents: row.price_cents,
        coreChargeCents: row.core_charge_cents,
        inStock: row.in_stock,
        brand: row.brand?.name ?? null,
        mfrPartNumber: row.mfr_part_number,
        categoryName: row.category?.name ?? null,
        shipClass: row.ship_class,
        weightLb: row.weight_lb === null ? null : Number(row.weight_lb),
        imageUrls: [...(row.images ?? [])]
          .filter((i) => parseCredit(i.credit) === null)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((i) => storagePublicUrl("product-images", i.storage_path)),
      });
    }
    if (data.length < pageSize) break;
  }
  return products;
}
