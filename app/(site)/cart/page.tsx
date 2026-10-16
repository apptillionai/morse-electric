import type { Metadata } from "next";
import Link from "next/link";
import { checkoutAction, removeCartLineAction, updateCartLineAction } from "@/app/actions/cart";
import { Button, ButtonLink } from "@/components/ui/button";
import { CONDITION_LABELS } from "@/lib/catalog/types";
import { CHECKOUT_ERRORS, isCheckoutError } from "@/lib/orders/checkout";
import { MAX_LINE_QUANTITY } from "@/lib/orders/cart";
import { priceCart } from "@/lib/orders/pricing";
import { loadBuyableProducts, readCart, storeIsOpen } from "@/lib/orders/store";
import { getBusiness, getSiteSettings } from "@/lib/site-settings";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

const money = (cents: number) => formatPrice(cents) ?? "";

function Notice({ tone, children }: { tone: "ok" | "warn" | "danger"; children: React.ReactNode }) {
  const color = { ok: "border-ok text-ok", warn: "border-warn text-fg", danger: "border-danger text-danger" }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded border-2 bg-surface px-4 py-3 text-sm font-medium ${color}`}>
      {children}
    </p>
  );
}

export default async function CartPage(props: PageProps<"/cart">) {
  const [sp, open, business] = await Promise.all([props.searchParams, storeIsOpen(), getBusiness()]);
  const one = (key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : undefined);

  if (!open) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 pt-12 pb-20">
        <h1 className="display text-5xl">Cart</h1>
        <p className="text-fg-muted">
          Online ordering isn’t open yet. Request a quote for anything in our catalog, or {business.callUs}.
        </p>
        <div>
          <ButtonLink href="/shop">Browse parts</ButtonLink>
        </div>
      </div>
    );
  }

  const [lines, { shippingRates }] = await Promise.all([readCart(), getSiteSettings()]);
  const cart = priceCart(lines, await loadBuyableProducts(lines.map((l) => l.productId)), shippingRates);
  const error = one("error");
  const added = cart.lines.find((l) => l.product.slug === one("added"));
  const canShip = cart.shipping.available;
  const preferPickup = one("fulfillment") === "pickup" || !canShip;
  const shipCents = cart.shipping.available ? cart.shipping.cents : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 pt-12 pb-20">
      <h1 className="display text-5xl">Cart</h1>

      {added && <Notice tone="ok">Added {added.product.name} to your cart.</Notice>}
      {one("unavailable") && <Notice tone="warn">That item can’t be bought online right now. Request a quote instead.</Notice>}
      {one("limit") && <Notice tone="warn">You already have all we have in stock of that item in your cart.</Notice>}
      {isCheckoutError(error) && <Notice tone="danger">{CHECKOUT_ERRORS[error]}</Notice>}
      {cart.adjustments.length > 0 && (
        <Notice tone="warn">
          Your cart has changed:{" "}
          {cart.adjustments.map((a) => `${a.name} ${a.message}`).join("; ")}.
        </Notice>
      )}

      {cart.lines.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-md border border-edge bg-surface p-6">
          <p className="text-fg-muted">Your cart is empty.</p>
          <ButtonLink href="/shop">Browse parts</ButtonLink>
        </div>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <ul className="flex flex-col divide-y divide-edge rounded-md border border-edge bg-surface" aria-label="Items in your cart">
            {cart.lines.map(({ product, quantity, lineCents }) => (
              <li key={product.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 p-5">
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                  <Link href={`/products/${product.slug}`} className="font-semibold">
                    {product.name}
                  </Link>
                  <span className="text-sm text-fg-muted">
                    {CONDITION_LABELS[product.condition]} · <span className="font-mono">Part # {product.sku}</span>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {money(product.priceCents ?? 0)} each
                    {product.shipClass === "pickup_only" && " · pickup only"}
                  </span>
                </div>
                <form action={updateCartLineAction} className="flex items-end gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Qty
                    <input
                      type="number"
                      name="quantity"
                      min={0}
                      max={Math.min(MAX_LINE_QUANTITY, product.available)}
                      defaultValue={quantity}
                      className="h-11 w-20 rounded border border-edge-strong bg-surface px-3 font-normal"
                    />
                  </label>
                  <Button type="submit" variant="quiet" size="sm">Update</Button>
                </form>
                <div className="flex min-w-24 flex-col items-end gap-1">
                  <strong>{money(lineCents)}</strong>
                  <form action={removeCartLineAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <button type="submit" className="min-h-11 text-sm font-semibold text-fg-muted underline hover:text-fg">
                      Remove<span className="sr-only"> {product.name}</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          <form action={checkoutAction} className="flex flex-col gap-5 rounded-md border border-edge bg-surface p-6">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-display text-xl font-bold uppercase tracking-[0.04em]">Delivery</legend>
              <label className={`flex gap-3 rounded border border-edge-strong p-3 has-checked:border-bold ${canShip ? "cursor-pointer" : "opacity-60"}`}>
                <input type="radio" name="fulfillment" value="ship" disabled={!canShip} defaultChecked={!preferPickup} className="mt-1 size-[18px] accent-fg" />
                <span className="flex flex-col gap-0.5">
                  <strong>Ship it {shipCents !== null && <>· {money(shipCents)}</>}</strong>
                  <span className="text-sm text-fg-muted">
                    {cart.shipping.available ? "UPS or FedEx ground, within the US." : cart.shipping.reason}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded border border-edge-strong p-3 has-checked:border-bold">
                <input type="radio" name="fulfillment" value="pickup" defaultChecked={preferPickup} className="mt-1 size-[18px] accent-fg" />
                <span className="flex flex-col gap-0.5">
                  <strong>Pick up · free</strong>
                  <span className="text-sm text-fg-muted">
                    {business.street}, {business.cityStateZip}. We’ll email you when it’s ready.
                  </span>
                </span>
              </label>
            </fieldset>

            <dl className="flex flex-col gap-2 border-t border-edge pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Subtotal</dt>
                <dd>{money(cart.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-fg-muted">
                <dt>Shipping</dt>
                <dd>{canShip && shipCents !== null ? `${money(shipCents)} or free pickup` : "Free pickup"}</dd>
              </div>
              <div className="flex justify-between gap-4 text-fg-muted">
                <dt>Sales tax</dt>
                <dd>Worked out at checkout</dd>
              </div>
            </dl>

            <Button type="submit" size="lg">Checkout</Button>
            <p className="text-[13px] text-fg-muted">
              You’ll pay on Stripe’s secure page by card or bank transfer (ACH). By ordering you agree to our{" "}
              <Link href="/policies/terms-of-sale">terms of sale</Link>, <Link href="/policies/returns">returns</Link> and{" "}
              <Link href="/policies/shipping">shipping</Link> policies. Tax-exempt? <Link href="/account/profile">Sign in</Link> with an
              approved certificate first.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
