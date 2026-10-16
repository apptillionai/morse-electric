import Link from "next/link";
import { notFound } from "next/navigation";
import { reorderAction } from "@/app/actions/cart";
import { AccountShell } from "@/components/account/account-shell";
import { OrderSummary } from "@/components/orders/order-summary";
import { Button } from "@/components/ui/button";
import { requireCustomer } from "@/lib/customers/account";
import { storeIsOpen } from "@/lib/orders/store";
import { getOrder, ORDER_STATUS_LABELS, type OrderWithItems } from "@/lib/orders/types";
import { getBusiness } from "@/lib/site-settings";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata = { title: "Order" };

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(iso));

function statusMessage(order: OrderWithItems, where: string): string {
  switch (order.status) {
    case "pending_payment":
      return "Waiting for your bank payment to clear. That usually takes a few business days.";
    case "paid":
    case "processing":
      return order.fulfillment === "pickup" ? "We’re getting it ready. We’ll email you when you can collect it." : "We’re getting it ready to ship.";
    case "shipped":
      return "On its way.";
    case "ready_for_pickup":
      return `Ready to collect from ${where}.`;
    case "completed":
      return "Completed.";
    case "cancelled":
      return order.cancel_reason === "payment_failed" ? "Cancelled because the bank payment failed." : "Cancelled and refunded.";
    case "refunded":
      return "Refunded.";
    default:
      return ORDER_STATUS_LABELS[order.status];
  }
}

export default async function AccountOrderPage(props: PageProps<"/account/orders/[reference]">) {
  const [{ id, customer }, { reference }] = await Promise.all([requireCustomer(), props.params]);
  if (!/^O-\d{1,10}$/.test(reference)) notFound();
  const order = await getOrder(await createSessionClient(), { reference });
  if (!order || order.customer_id !== id || order.status === "checkout") notFound();
  const [business, open] = await Promise.all([getBusiness(), storeIsOpen()]);

  return (
    <AccountShell current="/account/orders" name={customer.name} company={customer.company}>
      <p className="text-sm"><Link href="/account/orders">← All orders</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-3xl font-bold uppercase tracking-[0.03em]">Order {order.reference}</h2>
          <p className="text-fg-muted">Placed {date(order.created_at)}</p>
          <p className="font-medium">{statusMessage(order, `${business.street}, ${business.cityStateZip}`)}</p>
        </div>
        {open && (
          <form action={reorderAction}>
            <input type="hidden" name="reference" value={order.reference} />
            <Button type="submit" variant="quiet" size="sm">Order again</Button>
          </form>
        )}
      </div>
      <OrderSummary order={order} />
    </AccountShell>
  );
}
