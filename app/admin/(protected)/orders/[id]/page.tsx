import Link from "next/link";
import { notFound } from "next/navigation";
import { advanceOrderAction, closeOrderAction, saveOrderNotesAction } from "@/app/admin/order-actions";
import { PageHeader } from "@/components/admin/admin-shell";
import { Detail, formatDate, StatusBadge } from "@/components/admin/inbox";
import { AdvanceOrderForm, CloseOrderForm, OrderNotesForm } from "@/components/admin/order-forms";
import { OrderSummary } from "@/components/orders/order-summary";
import { staffClient } from "@/lib/admin/auth";
import { getOrderForStaff, NEXT_STEPS } from "@/lib/admin/orders";
import { formatDueDate, INVOICE_STATUS_LABELS } from "@/lib/orders/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Order" };

const PAYMENT = { card: "Card", ach: "Bank transfer (ACH)", net30: "Net-30 invoice", other: "Other" } as const;

export default async function OrderPage(props: PageProps<"/admin/orders/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const order = await getOrderForStaff(await staffClient(), id);
  if (!order || order.status === "checkout") notFound();

  const steps = NEXT_STEPS[order.status]?.[order.fulfillment] ?? [];
  const closable = ["invoiced", "paid", "processing", "ready_for_pickup", "shipped", "completed"].includes(order.status);
  const stripeUrl = order.stripe_payment_intent_id
    ? `https://dashboard.stripe.com/${order.stripe_checkout_session_id?.startsWith("cs_test_") ? "test/" : ""}payments/${order.stripe_payment_intent_id}`
    : null;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/orders">← Orders</Link></p>
      <PageHeader
        title={order.reference}
        description={<>Placed {formatDate(order.created_at)} · <StatusBadge status={order.status} /></>}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <dl className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
            <Detail label="Customer">{order.name}</Detail>
            <Detail label="Account">
              {order.customer_id ? <Link href={`/admin/customers/${order.customer_id}`}>Customer account</Link> : <span className="text-fg-muted">Guest checkout</span>}
            </Detail>
            <Detail label="Email">{order.email && <a href={`mailto:${order.email}?subject=${encodeURIComponent(`Your Morse Electric order ${order.reference}`)}`}>{order.email}</a>}</Detail>
            <Detail label="Phone">{order.phone && <a href={`tel:${order.phone}`}>{order.phone}</a>}</Detail>
            <Detail label="Delivery">{order.fulfillment === "pickup" ? "Pickup at the shop" : "Ship"}</Detail>
            <Detail label="Payment">
              {order.payment_method ? PAYMENT[order.payment_method] : null}
              {stripeUrl && <> · <a href={stripeUrl} target="_blank" rel="noreferrer">View in Stripe</a></>}
            </Detail>
            {order.stripe_invoice_id && (
              <Detail label="Invoice">
                {order.invoice_status ? INVOICE_STATUS_LABELS[order.invoice_status] : "Not sent"}
                {order.invoice_status === "open" && order.invoice_due_date && <>, due {formatDueDate(order.invoice_due_date)}</>}
                {" "}·{" "}
                <a
                  href={`https://dashboard.stripe.com/invoices/${order.stripe_invoice_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View in Stripe
                </a>
              </Detail>
            )}
            {order.paid_at && <Detail label="Paid">{formatDate(order.paid_at)}</Detail>}
            {order.shipped_at && <Detail label="Shipped">{formatDate(order.shipped_at)}</Detail>}
          </dl>
          <OrderSummary order={order} />
          {order.cores.length > 0 && (
            <p className="text-sm">
              This order has {order.cores.length === 1 ? "a core" : `${order.cores.length} cores`} to return.{" "}
              <Link href="/admin/cores?status=all">Manage core returns</Link>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-5">
          {order.status === "pending_payment" && (
            <p className="rounded-md border-2 border-warn bg-surface p-4 text-sm">
              The customer paid by bank transfer, which takes a few business days to clear. Don’t release the order yet:
              you’ll get an email when it clears or fails.
            </p>
          )}
          <AdvanceOrderForm action={advanceOrderAction.bind(null, order.id)} steps={steps} />
          {closable && <CloseOrderForm action={closeOrderAction.bind(null, order.id)} shipped={["shipped", "completed"].includes(order.status)} />}
          <OrderNotesForm action={saveOrderNotesAction.bind(null, order.id)} notes={order.staff_notes} />
        </div>
      </div>
    </>
  );
}
