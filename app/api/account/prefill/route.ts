import { getSignedInUser } from "@/lib/customers/account";

/** Contact details for prefilling the quote and service forms, when a customer is signed in. */
export async function GET() {
  const user = await getSignedInUser();
  const c = user?.customer;
  if (!c) return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  return Response.json(
    { name: c.name, company: c.company ?? "", email: c.email, phone: c.phone ?? "" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
