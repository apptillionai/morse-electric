import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/server";
import { REQUEST_PATH_HEADER } from "@/lib/admin/paths";
import { safeAccountPath } from "./links";

export interface CustomerProfile {
  user_id: string;
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal: string | null;
  bill_same_as_ship: boolean;
  bill_line1: string | null;
  bill_line2: string | null;
  bill_city: string | null;
  bill_state: string | null;
  bill_postal: string | null;
  tax_exempt: boolean;
  tax_cert_path: string | null;
  tax_cert_uploaded_at: string | null;
  /** Set by checkout; never shown to the customer. */
  stripe_customer_id: string | null;
  /** Set by staff: "net30" customers can charge orders to their account. */
  terms: "prepay" | "net30";
  credit_limit_cents: number;
  /** Set by staff: the customer's price tier, or null for list prices. */
  price_tier_id: string | null;
  created_at: string;
}

export interface SignedInUser {
  id: string;
  email: string;
  /** Their customer profile, or null for staff and anyone else without one. */
  customer: CustomerProfile | null;
}

/** Whoever is signed in on the public site, with their customer profile. Cached per request. */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  if (!id) return null;
  // RLS returns only the caller's own row (or every row for staff, hence the filter).
  const { data: customer } = await supabase.from("customers").select("*").eq("user_id", id).maybeSingle();
  return { id, email: String(data.claims.email ?? ""), customer: (customer as CustomerProfile | null) ?? null };
});

/** The signed-in customer, or a redirect to the customer sign-in page. */
export async function requireCustomer(): Promise<{ id: string; customer: CustomerProfile }> {
  const user = await getSignedInUser();
  if (!user?.customer) {
    const path = safeAccountPath((await headers()).get(REQUEST_PATH_HEADER));
    redirect(path === "/account" ? "/account/login" : `/account/login?next=${encodeURIComponent(path)}`);
  }
  return { id: user.id, customer: user.customer };
}
