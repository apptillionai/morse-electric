"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/customers/account";
import { siteOrigin } from "@/lib/customers/origin";
import { sendQuoteResponseEmail } from "@/lib/quotes/email";
import { payQuote } from "@/lib/quotes/pay";
import { hashQuoteToken, loadQuote, QUOTE_TOKEN, type Quote } from "@/lib/quotes/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

// The customer's quote page posts here. A quote is reached either with the
// emailed link's token or, signed in, by id (RLS only returns their own).
// Every change goes through the service role and a database function that
// acts only from the status it expects.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveQuote(formData: FormData): Promise<{ quote: Quote; path: string } | null> {
  const token = String(formData.get("token") ?? "");
  if (QUOTE_TOKEN.test(token)) {
    const quote = await loadQuote(createAdminClient(), { tokenHash: hashQuoteToken(token) });
    return quote ? { quote, path: `/quotes/${token}` } : null;
  }
  const id = String(formData.get("quote_id") ?? "");
  if (!UUID.test(id)) return null;
  const user = await getSignedInUser();
  if (!user?.customer) return null;
  const quote = await loadQuote(await createSessionClient(), { id });
  return quote && quote.customer_id === user.id ? { quote, path: `/account/quotes/${id}` } : null;
}

/** Approve a repair quote, or decline any quote. */
export async function respondToQuoteAction(formData: FormData): Promise<void> {
  const found = await resolveQuote(formData);
  if (!found) redirect("/");
  const approve = formData.get("response") === "approve";
  const reason = String(formData.get("reason") ?? "").slice(0, 1000);
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("respond_to_quote", { p_quote_id: found.quote.id, p_approve: approve, p_reason: reason || null });
  if (error) {
    console.error("[quotes] respond:", error.message);
    redirect(`${found.path}?error=unavailable`);
  }
  if (data === true) {
    const updated = await loadQuote(supabase, { id: found.quote.id });
    if (updated) after(() => sendQuoteResponseEmail(updated, approve));
  }
  redirect(`${found.path}?${data === true ? `done=${approve ? "approved" : "declined"}` : "error=closed"}`);
}

/** Pay a quote by card / ACH (Stripe Checkout) or, for Net-30 customers, on account. */
export async function payQuoteAction(formData: FormData): Promise<void> {
  const found = await resolveQuote(formData);
  if (!found) redirect("/");
  const fulfillment = formData.get("fulfillment") === "ship" ? "ship" : "pickup";
  const onAccount = formData.get("payment") === "account";
  const user = await getSignedInUser().catch(() => null);
  const result = await payQuote({
    quote: found.quote,
    fulfillment,
    onAccount,
    user,
    origin: await siteOrigin(),
    returnPath: found.path,
  });
  if (!result.ok) redirect(`${found.path}?error=${result.error}&fulfillment=${fulfillment}${onAccount ? "&payment=account" : ""}`);
  redirect(result.url);
}
