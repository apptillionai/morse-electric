import { CONDITION_LABELS } from "@/lib/catalog/types";
import { shippingLines, type OrderWithItems } from "@/lib/orders/types";
import { formatPrice } from "@/lib/utils";

const money = (cents: number) => formatPrice(cents) ?? "";

/** Items, totals and delivery for one order. Shared by the success page, the account and the admin. */
export function OrderSummary({ order }: { order: OrderWithItems }) {
  const address = shippingLines(order);
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y divide-edge rounded-md border border-edge bg-surface" aria-label="Items">
        {order.items.map((item) => (
          <li key={item.id} className="flex flex-wrap justify-between gap-x-6 gap-y-1 p-4">
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">{item.name}</span>
              <span className="text-sm text-fg-muted">
                {CONDITION_LABELS[item.condition]} · <span className="font-mono">Part # {item.sku}</span> · {item.quantity} × {money(item.unit_price_cents)}
              </span>
            </span>
            <strong>{money(item.unit_price_cents * item.quantity)}</strong>
          </li>
        ))}
      </ul>
      <div className="grid gap-5 sm:grid-cols-2">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{money(order.subtotal_cents)}</dd></div>
          <div className="flex justify-between gap-4">
            <dt>{order.fulfillment === "pickup" ? "Pickup" : "Shipping"}</dt>
            <dd>{order.fulfillment === "pickup" ? "Free" : money(order.shipping_cents)}</dd>
          </div>
          <div className="flex justify-between gap-4"><dt>Tax</dt><dd>{money(order.tax_cents)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-edge pt-1.5 font-semibold"><dt>Total</dt><dd>{money(order.total_cents)}</dd></div>
        </dl>
        <div className="text-sm">
          <p className="font-semibold">{order.fulfillment === "pickup" ? "Collect from our shop" : "Ship to"}</p>
          {address ? (
            <address className="not-italic text-fg-muted">
              {address.map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
            </address>
          ) : (
            order.fulfillment === "ship" && <p className="text-fg-muted">Address not received yet.</p>
          )}
          {order.tracking_number && (
            <p className="mt-2">
              Tracking: {order.carrier && <>{order.carrier} </>}
              <span className="font-mono">{order.tracking_number}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
