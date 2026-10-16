import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isProductId } from "@/lib/orders/cart";
import { abandonCheckout } from "@/lib/orders/checkout";
import { CHECKOUT_COOKIE } from "@/lib/orders/store";

/**
 * "Back" from Stripe's checkout page: release the stock that checkout held,
 * keep the cart. Only the browser that started the checkout holds its cookie.
 */
export async function GET() {
  const jar = await cookies();
  const orderId = jar.get(CHECKOUT_COOKIE)?.value;
  if (orderId && isProductId(orderId)) await abandonCheckout(orderId);
  jar.delete(CHECKOUT_COOKIE);
  redirect("/cart");
}
