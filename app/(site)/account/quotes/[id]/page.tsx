import { notFound } from "next/navigation";
import { QuoteView } from "@/components/quotes/quote-view";
import { getSignedInUser, requireCustomer } from "@/lib/customers/account";
import { canPayOnline, quoteAccount, quoteSearch } from "@/lib/quotes/page";
import { loadQuote } from "@/lib/quotes/store";
import { getBusiness } from "@/lib/site-settings";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata = { title: "Quote" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A quote seen from the customer's account. RLS returns only their own sent quotes. */
export default async function AccountQuotePage(props: PageProps<"/account/quotes/[id]">) {
  const [{ id: userId }, { id }, sp] = await Promise.all([requireCustomer(), props.params, props.searchParams]);
  if (!UUID.test(id)) notFound();
  const quote = await loadQuote(await createSessionClient(), { id });
  if (!quote || quote.customer_id !== userId) notFound();
  const [user, business] = await Promise.all([getSignedInUser(), getBusiness()]);
  return (
    <QuoteView
      quote={quote}
      access={{ quoteId: quote.id }}
      search={quoteSearch(sp)}
      account={await quoteAccount(quote, user)}
      canPay={canPayOnline()}
      business={business}
      orderHref={quote.order ? `/account/orders/${quote.order.reference}` : null}
      back={{ href: "/account", label: "Requests & repairs" }}
    />
  );
}
