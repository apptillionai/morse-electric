import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerProfile } from "@/lib/customers/account";
import type { InviteInput } from "@/lib/customers/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PriceTier } from "./price-tiers";
import type { QuoteRequest, ServiceRequest } from "./requests";

/**
 * Customer accounts from the staff side. Reads and profile writes use the
 * staff member's session (RLS). Creating, re-linking and deleting the auth
 * user needs the service role, so those few calls use the admin client.
 */

export interface CustomerListItem {
  user_id: string;
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  tax_exempt: boolean;
  tax_cert_path: string | null;
  created_at: string;
}

export async function listCustomers(supabase: SupabaseClient, q: string | null) {
  let request = supabase
    .from("customers")
    .select("user_id, email, name, company, phone, tax_exempt, tax_cert_path, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const term = q?.replace(/[,()%*_\\"'.:]/g, " ").trim();
  if (term) {
    for (const t of term.split(/\s+/).slice(0, 4)) {
      request = request.or(`name.ilike.*${t}*,company.ilike.*${t}*,email.ilike.*${t}*`);
    }
  }
  const { data, error } = await request;
  if (error) throw new Error(`Customers: ${error.message}`);
  return data as CustomerListItem[];
}

export interface CustomerSignInInfo {
  lastSignInAt: string | null;
  hasSignedIn: boolean;
}

export async function getCustomerDetail(supabase: SupabaseClient, id: string) {
  const [customer, quotes, service, balance] = await Promise.all([
    supabase.from("customers").select("*").eq("user_id", id).maybeSingle(),
    supabase.from("quote_requests").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("service_requests").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("orders").select("total_cents").eq("customer_id", id).eq("invoice_status", "open"),
  ]);
  if (customer.error) throw new Error(`Customer: ${customer.error.message}`);
  if (quotes.error) throw new Error(`Quote requests: ${quotes.error.message}`);
  if (service.error) throw new Error(`Service requests: ${service.error.message}`);
  if (balance.error) throw new Error(`Open invoices: ${balance.error.message}`);
  if (!customer.data) return null;
  return {
    customer: customer.data as CustomerProfile,
    /** Net-30 orders with an unpaid invoice. */
    openBalanceCents: balance.data.reduce((sum, o) => sum + (o.total_cents as number), 0),
    quotes: quotes.data as QuoteRequest[],
    service: service.data as ServiceRequest[],
  };
}

/** When the customer last signed in (needs the service role; null if it isn't configured). */
export async function getSignInInfo(id: string): Promise<CustomerSignInInfo | null> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(id);
    if (error || !data.user) return null;
    return { lastSignInAt: data.user.last_sign_in_at ?? null, hasSignedIn: Boolean(data.user.last_sign_in_at) };
  } catch {
    return null;
  }
}

export type InviteResult = { ok: true; id: string; tokenHash: string; linked: number } | { ok: false; error: string; field?: "email" };

/**
 * Create the auth user and customer profile, and return a one-time invite
 * token. Past requests sent from the same email address are linked to the new
 * account, so the customer sees their history straight away.
 */
export async function inviteCustomer(supabase: SupabaseClient, staffId: string, input: InviteInput): Promise<InviteResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { data: { name: input.name } },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || /already been registered/i.test(error?.message ?? "")) {
      const { data: existing } = await supabase.from("customers").select("user_id").eq("email", input.email).maybeSingle();
      return existing
        ? { ok: false, field: "email", error: "There’s already a customer account for this email. Open it to send a new sign-in link." }
        : { ok: false, field: "email", error: "This email belongs to a staff login. Use a different address for the customer account." };
    }
    return { ok: false, error: `Couldn’t create the login: ${error?.message ?? "unknown error"}` };
  }

  const userId = data.user.id;
  const { error: insertError } = await supabase.from("customers").insert({
    user_id: userId,
    email: input.email,
    name: input.name,
    company: input.company,
    phone: input.phone,
    invited_by: staffId,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: `Couldn’t save the customer: ${insertError.message}` };
  }

  return { ok: true, id: userId, tokenHash: data.properties.hashed_token, linked: await linkRequestsByEmail(supabase, userId, input.email) };
}

/**
 * Attach unclaimed requests sent from this email address to the customer.
 * Request and invite emails are both stored lowercased, so an exact match is
 * right (ilike would treat "_" in an address as a wildcard).
 */
export async function linkRequestsByEmail(supabase: SupabaseClient, customerId: string, email: string): Promise<number> {
  const results = await Promise.all(
    (["quote_requests", "service_requests"] as const).map((table) =>
      supabase.from(table).update({ customer_id: customerId }, { count: "exact" }).eq("email", email.toLowerCase()).is("customer_id", null),
    ),
  );
  return results.reduce((n, r) => n + (r.count ?? 0), 0);
}

/** A fresh one-time sign-in token for an existing customer (also used when an invite expired). */
export async function newSignInToken(email: string): Promise<{ tokenHash: string } | { error: string }> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email });
  if (error) return { error: error.message };
  return { tokenHash: data.properties.hashed_token };
}

/** Delete the login and profile. Their requests stay, unlinked. */
export async function removeCustomer(supabase: SupabaseClient, id: string): Promise<void> {
  const { data } = await supabase.from("customers").select("tax_cert_path").eq("user_id", id).maybeSingle();
  if (data?.tax_cert_path) await supabase.storage.from("customer-documents").remove([data.tax_cert_path]);
  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) throw new Error(`Removing the login failed: ${error.message}`);
}

export interface AccountRequest {
  id: string;
  reference: string;
  status: "new" | "invited" | "dismissed";
  name: string;
  company: string;
  email: string;
  phone: string | null;
  wants_terms: boolean;
  details: string | null;
  customer_id: string | null;
  created_at: string;
}

/** "Request a business account" submissions still waiting for staff. */
export async function listAccountRequests(supabase: SupabaseClient): Promise<AccountRequest[]> {
  const { data, error } = await supabase
    .from("account_requests")
    .select("*")
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Account requests: ${error.message}`);
  return data as AccountRequest[];
}

export async function getAccountRequest(supabase: SupabaseClient, id: string): Promise<AccountRequest | null> {
  const { data, error } = await supabase.from("account_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Account request: ${error.message}`);
  return data as AccountRequest | null;
}

/** Every price tier, with how many customers are on each. */
export async function listPriceTiers(supabase: SupabaseClient): Promise<PriceTier[]> {
  const { data, error } = await supabase.from("price_tiers").select("id, name, discount_percent, customers(count)").order("discount_percent");
  if (error) throw new Error(`Price tiers: ${error.message}`);
  return (data as { id: string; name: string; discount_percent: number | string; customers: { count: number }[] }[]).map((t) => ({
    id: t.id,
    name: t.name,
    discount_percent: Number(t.discount_percent),
    customers: t.customers[0]?.count ?? 0,
  }));
}
