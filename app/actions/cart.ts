"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSignedInUser, requireCustomer } from "@/lib/customers/account";
import { siteOrigin } from "@/lib/customers/origin";
import { addToCart, isProductId, MAX_LINE_QUANTITY, setCartQuantity } from "@/lib/orders/cart";
import { abandonCheckout, createCheckout } from "@/lib/orders/checkout";
import { createNet30Order } from "@/lib/orders/net30";
import { onlinePurchaseBlock } from "@/lib/orders/pricing";
import { CHECKOUT_COOKIE, loadBuyableProducts, readCart, storeIsOpen, writeCart } from "@/lib/orders/store";
import { getOrder } from "@/lib/orders/types";
import { createSessionClient } from "@/lib/supabase/server";

// Plain form posts that end in a redirect, so the cart works without JavaScript.

function quantityFrom(formData: FormData, fallback: number): number {
  const n = Number(formData.get("quantity"));
  return Number.isFinite(n) ? Math.min(MAX_LINE_QUANTITY, Math.trunc(n)) : fallback;
}

export async function addToCartAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");
  if (!(await storeIsOpen()) || !isProductId(productId)) redirect("/cart");

  const product = (await loadBuyableProducts([productId])).get(productId);
  if (!product || onlinePurchaseBlock(product)) redirect("/cart?unavailable=1");

  const cart = await readCart();
  const inCart = cart.find((l) => l.productId === productId)?.quantity ?? 0;
  const wanted = Math.max(1, quantityFrom(formData, 1));
  const quantity = Math.min(wanted, product.available - inCart);
  if (quantity < 1) redirect("/cart?limit=1");
  await writeCart(addToCart(cart, productId, quantity));
  redirect(`/cart?added=${encodeURIComponent(product.slug)}`);
}

export async function updateCartLineAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");
  if (isProductId(productId)) {
    await writeCart(setCartQuantity(await readCart(), productId, quantityFrom(formData, 1)));
  }
  redirect("/cart");
}

export async function removeCartLineAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");
  if (isProductId(productId)) await writeCart(setCartQuantity(await readCart(), productId, 0));
  redirect("/cart");
}

export async function checkoutAction(formData: FormData): Promise<void> {
  if (!(await storeIsOpen())) redirect("/cart?error=unavailable");
  const fulfillment = formData.get("fulfillment") === "pickup" ? "pickup" : "ship";

  // One open checkout per browser: starting again releases the last one's stock.
  const jar = await cookies();
  const previous = jar.get(CHECKOUT_COOKIE)?.value;
  if (previous && isProductId(previous)) await abandonCheckout(previous);

  const user = await getSignedInUser().catch(() => null);

  // Net-30 customers can charge the order to their account instead of paying now.
  if (formData.get("payment") === "account") {
    if (!user?.customer) redirect("/account/login?next=/cart");
    const placed = await createNet30Order({ cart: await readCart(), fulfillment, userId: user.id, customer: user.customer });
    if (!placed.ok) {
      if (placed.cleaned) await writeCart(placed.cleaned);
      redirect(`/cart?error=${placed.error}&fulfillment=${fulfillment}&payment=account`);
    }
    await writeCart([]);
    redirect(`/account/orders/${placed.reference}?placed=1`);
  }

  const customer = user?.customer
    ? {
        id: user.id,
        email: user.customer.email,
        name: user.customer.name,
        taxExempt: user.customer.tax_exempt,
        stripeCustomerId: user.customer.stripe_customer_id,
      }
    : null;

  const result = await createCheckout({ cart: await readCart(), fulfillment, origin: await siteOrigin(), customer });
  if (!result.ok) {
    if (result.cleaned) await writeCart(result.cleaned);
    redirect(`/cart?error=${result.error}&fulfillment=${fulfillment}`);
  }
  jar.set(CHECKOUT_COOKIE, result.orderId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
  });
  redirect(result.url);
}

/** "Order again" from the account: add what's still buyable from a past order. */
export async function reorderAction(formData: FormData): Promise<void> {
  await requireCustomer();
  const reference = String(formData.get("reference") ?? "");
  if (!(await storeIsOpen()) || !/^O-\d{1,10}$/.test(reference)) redirect("/cart");
  // The customer's own session: RLS only returns their own orders.
  const order = await getOrder(await createSessionClient(), { reference });
  if (!order) redirect("/account/orders");

  const ids = order.items.flatMap((i) => (i.product_id ? [i.product_id] : []));
  const products = await loadBuyableProducts(ids);
  let cart = await readCart();
  let skipped = false;
  for (const item of order.items) {
    const product = item.product_id ? products.get(item.product_id) : undefined;
    const inCart = cart.find((l) => l.productId === item.product_id)?.quantity ?? 0;
    const quantity = product ? Math.min(item.quantity, product.available - inCart) : 0;
    if (!product || onlinePurchaseBlock(product) || quantity < 1) {
      skipped = true;
      continue;
    }
    cart = addToCart(cart, product.id, quantity);
  }
  await writeCart(cart);
  redirect(skipped ? "/cart?unavailable=1" : "/cart");
}
