import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { CART_COOKIE } from "@/lib/orders/cart";
import { CHECKOUT_COOKIE } from "@/lib/orders/store";

/**
 * Stripe sends the customer here after paying: empty the cart (unless they
 * paid a quote, which never used it), then show the order.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  if (request.nextUrl.searchParams.get("from") !== "quote") {
    const jar = await cookies();
    jar.delete(CART_COOKIE);
    jar.delete(CHECKOUT_COOKIE);
  }
  redirect(/^cs_[A-Za-z0-9_]{10,250}$/.test(sessionId) ? `/checkout/success?session_id=${sessionId}` : "/cart");
}
