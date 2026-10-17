import "server-only";

import type { SignedInUser } from "@/lib/customers/account";
import { getStripe } from "@/lib/orders/store";
import type { QuoteViewProps } from "@/components/quotes/quote-view";
import { createSessionClient } from "@/lib/supabase/server";
import type { Quote } from "./store";

type Search = Record<string, string | string[] | undefined>;

const pick = (sp: Search, key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : undefined);

/** The query-string notices the quote page understands. */
export const quoteSearch = (sp: Search): QuoteViewProps["search"] => ({
  done: pick(sp, "done"),
  error: pick(sp, "error"),
  cancelled: pick(sp, "cancelled"),
  fulfillment: pick(sp, "fulfillment"),
  payment: pick(sp, "payment"),
});

/**
 * Net-30 details for the quote page: only when the signed-in customer owns
 * the quote and has terms. Their open balance comes through their own session.
 */
export async function quoteAccount(quote: Quote, user: SignedInUser | null): Promise<QuoteViewProps["account"]> {
  const c = user?.customer;
  if (!c || !quote.customer_id || quote.customer_id !== user.id || c.terms !== "net30") return null;
  const { data } = await (await createSessionClient()).rpc("my_open_balance_cents");
  return {
    availableCents: Math.max(0, c.credit_limit_cents - ((data as number | null) ?? 0)),
    limitCents: c.credit_limit_cents,
    shipTo: c.ship_line1 ? [c.ship_line1, c.ship_city].filter(Boolean).join(", ") : null,
  };
}

export const canPayOnline = () => getStripe() !== null;
