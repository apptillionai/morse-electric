import { CORE_STATUS_LABELS, formatDueDate, itemDetails, shippingLines, type OrderWithItems } from "@/lib/orders/types";
import { formatPrice } from "@/lib/utils";

const money = (cents: number) => formatPrice(cents) ?? "";

/** Items, totals and delivery for one order. Shared by the success page, the account and the admin. */
export function OrderSummary({ order }: { order: OrderWithItems }) {
  const address = shippingLines(order);
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y divide-edge rounded-md border border-edge bg-surface" aria-label="Items">
        {order.items.map((item) => {
          const core = order.cores.find((c) => c.order_item_id === item.id);
          return (
            <li key={item.id} className="flex flex-wrap justify-between gap-x-6 gap-y-1 p-4">
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{item.name}</span>
                <span className="text-sm text-fg-muted">
                  {itemDetails(item).map((d) => `${d} · `)}
                  {item.quantity} × {money(item.unit_price_cents)}
                </span>
                {item.core_charge_cents > 0 && (
                  <span className="text-sm text-fg-muted">
                    Core charge {item.quantity} × {money(item.core_charge_cents)} (refundable)
                    {core && (
                      <>
                        {" "}· {CORE_STATUS_LABELS[core.status]}
                        {core.status === "awaiting" && <>, due back by {formatDueDate(core.due_date)}</>}
                        {core.status === "credited" && core.credit_cents !== null && <>: {money(core.credit_cents)}</>}
                        {core.status === "rejected" && core.rejection_reason && <>: {core.rejection_reason}</>}
                      </>
                    )}
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end">
                <strong>{money(item.unit_price_cents * item.quantity)}</strong>
                {item.core_charge_cents > 0 && <span className="text-sm text-fg-muted">+ {money(item.core_charge_cents * item.quantity)} core</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grid gap-5 sm:grid-cols-2">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{money(order.subtotal_cents)}</dd></div>
          {order.core_cents > 0 && (
            <div className="flex justify-between gap-4"><dt>Core charges (refundable)</dt><dd>{money(order.core_cents)}</dd></div>
          )}
          <div className="flex justify-between gap-4">
            <dt>{order.fulfillment === "pickup" ? "Pickup" : order.shipping_service ? `Shipping (${order.shipping_service})` : "Shipping"}</dt>
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
