import { getSignedInUser } from "@/lib/customers/account";
import { tierOf } from "@/lib/orders/pricing";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * The signed-in customer's price tier, so static product pages can show
 * their price. 204 for guests and customers on list prices.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getSignedInUser();
  const tierId = user?.customer?.price_tier_id;
  if (!tierId) return new Response(null, { status: 204, headers });
  // RLS lets a customer read only their own tier.
  const { data } = await (await createSessionClient())
    .from("price_tiers")
    .select("name, discount_percent")
    .eq("id", tierId)
    .maybeSingle();
  const pricing = tierOf(data);
  return pricing ? Response.json(pricing, { headers }) : new Response(null, { status: 204, headers });
}
