/**
 * Load the placeholder catalog (lib/catalog/seed.ts) into Supabase.
 *
 *   npm run seed:catalog            # upsert categories + products + inventory
 *
 * Idempotent: rows are upserted by slug/sku, so it is safe to re-run. Products
 * are inserted as `active`. Do not run against production once Morse's real
 * catalog is loaded.
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../lib/catalog/seed";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

  const supabase = createClient(url, secret, { auth: { persistSession: false } });

  const { data: categories, error: categoryError } = await supabase
    .from("categories")
    .upsert(
      SEED_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, description: c.description, sort_order: c.sortOrder })),
      { onConflict: "slug" },
    )
    .select("id, slug");
  if (categoryError) throw categoryError;
  const categoryId = new Map(categories.map((c) => [c.slug, c.id]));

  const { data: products, error: productError } = await supabase
    .from("products")
    .upsert(
      SEED_PRODUCTS.map((p) => {
        const category = categoryId.get(p.category);
        if (!category) throw new Error(`Unknown category ${p.category} for ${p.sku}`);
        return {
          sku: p.sku,
          mfr_part_number: p.mfrPartNumber,
          slug: p.slug,
          family_key: p.familyKey,
          name: p.name,
          description: p.description,
          category_id: category,
          condition: p.condition,
          price_cents: p.priceCents,
          core_charge_cents: p.coreChargeCents,
          ship_class: p.shipClass,
          weight_lb: p.weightLb,
          hp: p.hp,
          rpm: p.rpm,
          frame: p.frame,
          enclosure: p.enclosure,
          power: p.power,
          voltage: p.voltage,
          specs: p.specs,
          featured: p.featured,
          status: "active",
        };
      }),
      { onConflict: "sku" },
    )
    .select("id, sku");
  if (productError) throw productError;
  const productId = new Map(products.map((p) => [p.sku, p.id]));

  const { error: inventoryError } = await supabase.from("inventory").upsert(
    SEED_PRODUCTS.map((p) => ({ product_id: productId.get(p.sku), qty_on_hand: p.qtyOnHand })),
    { onConflict: "product_id" },
  );
  if (inventoryError) throw inventoryError;

  console.log(`Seeded ${categories.length} categories and ${products.length} products.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
