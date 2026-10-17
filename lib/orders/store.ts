import "server-only";

import { cookies } from "next/headers";
import Stripe from "stripe";
import { getSiteSettings } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { CART_COOKIE, parseCart, serializeCart, type CartLine } from "./cart";
import { parsePriceBreaks, tierOf, type BuyableProduct, type CustomerPricing } from "./pricing";

/** Server-side Stripe client, or null when STRIPE_SECRET_KEY isn't set. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/**
 * Online ordering is open only when staff have switched it on in
 * /admin/settings and the server can take payments and store orders.
 */
export async function storeIsOpen(): Promise<boolean> {
  if (!process.env.STRIPE_SECRET_KEY || !isSupabaseAdminConfigured()) return false;
  return (await getSiteSettings()).storeEnabled;
}

// ---------------------------------------------------------------------------
// Cart cookie (reading works anywhere on the server; writing only in server
// actions and route handlers).
// ---------------------------------------------------------------------------

export async function readCart(): Promise<CartLine[]> {
  return parseCart((await cookies()).get(CART_COOKIE)?.value);
}

export async function writeCart(lines: CartLine[]): Promise<void> {
  const jar = await cookies();
  if (!lines.length) {
    jar.delete(CART_COOKIE);
    return;
  }
  // Readable by the page (the header shows a count); it holds only ids and quantities.
  jar.set(CART_COOKIE, serializeCart(lines), {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** The checkout this browser started, so it can be resumed or cancelled. httpOnly. */
export const CHECKOUT_COOKIE = "morse_checkout";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  sku: string;
  slug: string;
  name: string;
  condition: BuyableProduct["condition"];
  status: string;
  price_cents: number | null;
  core_charge_cents: number | null;
  ship_class: BuyableProduct["shipClass"];
  weight_lb: number | string | null;
  price_breaks: unknown;
  inventory: { qty_on_hand: number; qty_reserved: number } | { qty_on_hand: number; qty_reserved: number }[] | null;
}

/**
 * Products with the quantity really available (on hand minus reserved),
 * which the public API doesn't expose. Read with the service role.
 */
export async function loadBuyableProducts(ids: string[]): Promise<Map<string, BuyableProduct>> {
  if (!ids.length) return new Map();
  const { data, error } = await createAdminClient()
    .from("products")
    .select("id, sku, slug, name, condition, status, price_cents, price_breaks, core_charge_cents, ship_class, weight_lb, inventory(qty_on_hand, qty_reserved)")
    .in("id", ids);
  if (error) throw new Error(`Cart products: ${error.message}`);
  return new Map(
    (data as ProductRow[]).map((row) => {
      const inv = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
      return [
        row.id,
        {
          id: row.id,
          sku: row.sku,
          slug: row.slug,
          name: row.name,
          condition: row.condition,
          active: row.status === "active",
          priceCents: row.price_cents,
          coreChargeCents: row.core_charge_cents,
          shipClass: row.ship_class,
          weightLb: row.weight_lb === null ? null : Number(row.weight_lb),
          priceBreaks: parsePriceBreaks(row.price_breaks),
          available: inv ? Math.max(0, inv.qty_on_hand - inv.qty_reserved) : 0,
        },
      ];
    }),
  );
}

/**
 * A customer's price tier, or null when they pay list prices. Read with the
 * service role, so checkout prices from the database and never from anything
 * the browser sent.
 */
export async function customerPricing(customerId: string | null | undefined): Promise<CustomerPricing | null> {
  if (!customerId) return null;
  const { data, error } = await createAdminClient()
    .from("customers")
    .select("price_tier:price_tiers(name, discount_percent)")
    .eq("user_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`Customer pricing: ${error.message}`);
  return tierOf(data?.price_tier);
}

