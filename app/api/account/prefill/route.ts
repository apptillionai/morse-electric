import { getSignedInUser } from "@/lib/customers/account";
import { unitPrefill, type Equipment } from "@/lib/customers/equipment";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Contact details for prefilling the quote and service forms, when a customer
 * is signed in, plus their equipment list for the service form's unit picker.
 */
export async function GET() {
  const user = await getSignedInUser();
  const c = user?.customer;
  if (!c) return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  // RLS returns only the customer's own units.
  const { data: units } = await (await createSessionClient())
    .from("equipment")
    .select("*")
    .eq("customer_id", c.user_id)
    .order("label")
    .limit(200);
  return Response.json(
    {
      name: c.name,
      company: c.company ?? "",
      email: c.email,
      phone: c.phone ?? "",
      units: ((units ?? []) as Equipment[]).map((u) => unitPrefill({ ...u, hp: u.hp === null ? null : Number(u.hp) })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
