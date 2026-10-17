"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin/auth";
import { parseQuoteForm } from "@/lib/admin/quote-form";
import { siteOrigin } from "@/lib/customers/origin";
import { sendQuoteEmail } from "@/lib/quotes/email";
import { addDays, customerStep, shopToday } from "@/lib/quotes/logic";
import { hashQuoteToken, loadQuote, newQuoteToken, quoteLink, quoteState, type Quote } from "@/lib/quotes/store";
import { createSessionClient } from "@/lib/supabase/server";

// Staff price requests here, through their own session: RLS and the quotes
// guard trigger decide what they may change. Each action checks staff access
// itself. Approving, declining and paying are the customer's (app/actions/quotes.ts).

export interface QuoteActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: string;
  /** The customer's link, shown so staff can send it themselves if email is off. */
  link?: string;
  /** What was typed, to show again after a failed save. */
  values?: Record<string, string>;
  /** Bumped on every save, so the editor shows the latest values. */
  version?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestPath = (q: Pick<Quote, "quote_request_id" | "service_request_id">) =>
  q.service_request_id ? `/admin/service/${q.service_request_id}` : `/admin/quotes/${q.quote_request_id}`;

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
}

/** Start a draft quote for a quote request or service job, prefilled from it. */
export async function createQuoteAction(kind: "parts" | "repair", requestId: string): Promise<void> {
  await requireStaff();
  if (!UUID.test(requestId)) redirect("/admin");
  const supabase = await createSessionClient();
  const back = kind === "parts" ? `/admin/quotes/${requestId}` : `/admin/service/${requestId}`;

  const { data: request } = await supabase
    .from(kind === "parts" ? "quote_requests" : "service_requests")
    .select(kind === "parts" ? "name, email, customer_id, product_id, product_sku, quantity" : "name, email, customer_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) redirect(back);
  const r = request as unknown as {
    name: string;
    email: string;
    customer_id: string | null;
    product_id?: string | null;
    product_sku?: string | null;
    quantity?: number | null;
  };

  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      ...(kind === "parts" ? { quote_request_id: requestId } : { service_request_id: requestId }),
      customer_id: r.customer_id,
      name: r.name,
      email: r.email,
      valid_until: addDays(shopToday(), 30),
      // Replaced with a fresh link when the quote is sent.
      token_hash: hashQuoteToken(newQuoteToken()),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[quotes] create:", error.message);
    redirect(`${back}?quote_error=1#quote`);
  }

  // A part from the catalog with a price starts as the first line.
  if (r.product_id) {
    const { data: product } = await supabase.from("products").select("name, sku, price_cents, core_charge_cents").eq("id", r.product_id).maybeSingle();
    if (product?.price_cents !== null && product?.price_cents !== undefined) {
      await supabase.from("quote_lines").insert({
        quote_id: quote.id,
        product_id: r.product_id,
        sku: product.sku,
        description: product.name,
        quantity: Math.min(999, Math.max(1, r.quantity ?? 1)),
        unit_price_cents: product.price_cents,
        core_charge_cents: product.core_charge_cents ?? 0,
      });
    }
  }
  refresh();
  redirect(`${back}#quote`);
}

async function staffQuote(quoteId: string): Promise<{ supabase: Awaited<ReturnType<typeof createSessionClient>>; quote: Quote } | null> {
  if (!UUID.test(quoteId)) return null;
  const supabase = await createSessionClient();
  const quote = await loadQuote(supabase, { id: quoteId });
  return quote ? { supabase, quote } : null;
}

/** Give the quote a new link and email it to the customer. */
async function sendLink(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  quote: Quote,
  kind: "sent" | "payment",
  extra: Record<string, unknown> = {},
): Promise<{ error: string } | { emailed: boolean; link: string }> {
  const token = newQuoteToken();
  const { error } = await supabase.from("quotes").update({ token_hash: hashQuoteToken(token), ...extra }).eq("id", quote.id);
  if (error) return { error: error.message };
  const link = quoteLink(await siteOrigin(), token);
  const fresh = (await loadQuote(supabase, { id: quote.id })) ?? quote;
  const emailed = await sendQuoteEmail(fresh, link, kind);
  return { emailed, link };
}

/** Save a draft's lines and terms; with intent=send, also send it to the customer. */
export async function saveQuoteAction(quoteId: string, _prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  await requireStaff();
  const found = await staffQuote(quoteId);
  if (!found) return { error: "That quote no longer exists." };
  const { supabase, quote } = found;
  if (quote.status !== "draft") return { error: "Only a draft can be changed. Use “Edit” first." };

  const typed = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const failed = (error: string, fieldErrors?: Record<string, string>): QuoteActionState => ({ error, fieldErrors, values: typed, version: Date.now() });
  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) return failed("Check the highlighted fields.", parsed.errors);
  const { lines, shippingCents, validDays, message } = parsed.values;
  const send = formData.get("intent") === "send";
  if (send && !lines.length) return failed("Add at least one line before sending.");

  const { error } = await supabase
    .from("quotes")
    .update({ shipping_cents: shippingCents, valid_until: addDays(shopToday(), validDays), message })
    .eq("id", quote.id);
  if (error) return failed(error.message);
  const { error: deleteError } = await supabase.from("quote_lines").delete().eq("quote_id", quote.id);
  if (deleteError) return failed(deleteError.message);
  if (lines.length) {
    const { error: linesError } = await supabase.from("quote_lines").insert(
      lines.map((l, i) => ({
        quote_id: quote.id,
        product_id: l.productId,
        sku: l.sku,
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: l.unitPriceCents,
        core_charge_cents: l.coreChargeCents,
        sort_order: i,
      })),
    );
    if (linesError) return failed(linesError.message);
  }
  if (!send) {
    refresh();
    return { saved: "Draft saved. The customer can’t see it until you send it.", version: Date.now() };
  }

  const sent = await sendLink(supabase, quote, "sent", { status: "sent", sent_at: new Date().toISOString() });
  if ("error" in sent) return failed(sent.error);
  // The request moves to "quoted" (unless staff already moved it further).
  if (quote.quote_request_id) {
    await supabase.from("quote_requests").update({ status: "quoted" }).eq("id", quote.quote_request_id).eq("status", "new");
  } else if (quote.service_request_id) {
    await supabase.from("service_requests").update({ status: "quoted" }).eq("id", quote.service_request_id).in("status", ["received", "teardown"]);
  }
  refresh();
  // The page now shows the sent quote; say how it went there (with the link if the email failed).
  redirect(`${requestPath(quote)}?quote=${sent.emailed ? "sent" : `unsent&link=${encodeURIComponent(sent.link)}`}#quote`);
}

/** Take a sent quote back to draft to change it (its link stops working until it's sent again). */
export async function reopenQuoteAction(quoteId: string): Promise<QuoteActionState> {
  await requireStaff();
  const found = await staffQuote(quoteId);
  if (!found) return { error: "That quote no longer exists." };
  if (found.quote.status !== "sent") return { error: "Only a sent quote that hasn’t been answered can be edited." };
  const { error } = await found.supabase
    .from("quotes")
    .update({ status: "draft", token_hash: hashQuoteToken(newQuoteToken()) })
    .eq("id", quoteId);
  if (error) return { error: error.message };
  refresh();
  return { saved: "Back to draft. Change it, then send it again." };
}

/** Withdraw a sent or approved quote, so a new one can be written. */
export async function withdrawQuoteAction(quoteId: string): Promise<QuoteActionState> {
  await requireStaff();
  const found = await staffQuote(quoteId);
  if (!found) return { error: "That quote no longer exists." };
  if (!["draft", "sent", "approved"].includes(found.quote.status)) return { error: "This quote can’t be withdrawn." };
  const { error } = await found.supabase.from("quotes").update({ status: "withdrawn" }).eq("id", quoteId);
  if (error) return { error: error.message };
  refresh();
  return { saved: "Withdrawn. The customer’s link now says so." };
}

/** Email the customer a new link: the quote again, or (repair ready) the payment link. */
export async function resendQuoteAction(quoteId: string): Promise<QuoteActionState> {
  await requireStaff();
  const found = await staffQuote(quoteId);
  if (!found) return { error: "That quote no longer exists." };
  const { supabase, quote } = found;
  const step = customerStep(quoteState(quote)).step;
  if (step === "in_progress") return { error: "The customer already approved it. Send the payment link once the job is Ready." };
  if (step !== "approve" && step !== "pay") return { error: "There’s nothing for the customer to do on this quote." };
  const sent = await sendLink(supabase, quote, quote.status === "approved" ? "payment" : "sent");
  if ("error" in sent) return { error: sent.error };
  refresh();
  return {
    saved: sent.emailed ? `New link emailed to ${quote.email}. The old link no longer works.` : "New link made, but the email didn’t go out. Copy it below.",
    link: sent.link,
  };
}

/** Delete a draft that was never sent. */
export async function deleteDraftQuoteAction(quoteId: string): Promise<void> {
  await requireStaff();
  const found = await staffQuote(quoteId);
  if (!found) redirect("/admin");
  if (found.quote.status === "draft") await found.supabase.from("quotes").delete().eq("id", quoteId);
  refresh();
  redirect(`${requestPath(found.quote)}#quote`);
}
