import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuoteView } from "@/components/quotes/quote-view";
import { getSignedInUser } from "@/lib/customers/account";
import { canPayOnline, quoteAccount, quoteSearch } from "@/lib/quotes/page";
import { hashQuoteToken, loadQuote, QUOTE_TOKEN } from "@/lib/quotes/store";
import { getBusiness } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false } };

/** A quote opened from the emailed link. The token is the only key, so the page is never indexed or cached. */
export default async function QuoteLinkPage(props: PageProps<"/quotes/[token]">) {
  const [{ token }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!QUOTE_TOKEN.test(token) || !isSupabaseAdminConfigured()) notFound();
  const quote = await loadQuote(createAdminClient(), { tokenHash: hashQuoteToken(token) });
  if (!quote || quote.status === "draft") notFound();

  const [user, business] = await Promise.all([getSignedInUser().catch(() => null), getBusiness()]);
  const owner = Boolean(user?.customer && quote.customer_id === user.id);
  return (
    <QuoteView
      quote={quote}
      access={{ token }}
      search={quoteSearch(sp)}
      account={await quoteAccount(quote, user)}
      canPay={canPayOnline()}
      business={business}
      orderHref={owner && quote.order ? `/account/orders/${quote.order.reference}` : null}
    />
  );
}
