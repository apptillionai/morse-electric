import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { AccountShell } from "@/components/account/account-shell";
import { ButtonLink } from "@/components/ui/button";
import { requireCustomer } from "@/lib/customers/account";
import { coreReturnInstructions } from "@/lib/orders/email";
import { formatDueDate, ORDER_STATUS_LABELS, type CoreReturn, type Order } from "@/lib/orders/types";
import { getBusiness } from "@/lib/site-settings";
import { createSessionClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";

export const metadata = { title: "Orders" };

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(iso));

type Row = Pick<Order, "id" | "reference" | "status" | "fulfillment" | "total_cents" | "created_at" | "tracking_number"> & {
  items: { id: string; name: string; quantity: number }[];
  cores: Pick<CoreReturn, "id" | "order_item_id" | "status" | "quantity" | "core_charge_cents" | "due_date">[];
};

export default async function AccountOrdersPage() {
  const { id, customer } = await requireCustomer();
  // RLS returns only this customer's orders; the filter keeps it that way for staff who are also customers.
  const { data, error } = await (await createSessionClient())
    .from("orders")
    .select(
      "id, reference, status, fulfillment, total_cents, created_at, tracking_number, items:order_items(id, name, quantity), cores:core_returns(id, order_item_id, status, quantity, core_charge_cents, due_date)",
    )
    .eq("customer_id", id)
    .neq("status", "checkout")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Orders: ${error.message}`);
  const orders = data as Row[];
  const business = await getBusiness();
  const owed = orders.flatMap((o) =>
    o.cores
      .filter((c) => c.status === "awaiting")
      .map((c) => ({ ...c, reference: o.reference, name: o.items.find((i) => i.id === c.order_item_id)?.name ?? "Item" })),
  );

  return (
    <AccountShell current="/account/orders" name={customer.name} company={customer.company}>
      {owed.length > 0 && (
        <section aria-labelledby="cores-heading" className="flex flex-col gap-3 rounded-md border-2 border-warn bg-surface p-5">
          <h2 id="cores-heading" className="font-display text-2xl font-bold uppercase tracking-[0.03em]">Cores to return</h2>
          <ul className="flex flex-col gap-1.5">
            {owed.map((c) => (
              <li key={c.id}>
                <strong>{c.quantity} × {c.name}</strong> (order{" "}
                <Link href={`/account/orders/${c.reference}`}>{c.reference}</Link>): return by {formatDueDate(c.due_date)} to get{" "}
                {formatPrice(c.quantity * c.core_charge_cents)} back.
              </li>
            ))}
          </ul>
          <p className="text-sm text-fg-muted">{coreReturnInstructions(business, "number")}</p>
        </section>
      )}

      <section aria-labelledby="orders-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="orders-heading" className="flex items-center gap-2 font-display text-3xl font-bold uppercase tracking-[0.03em]">
            <ShoppingCart size={24} aria-hidden="true" /> Orders
          </h2>
          <ButtonLink href="/shop" size="sm" variant="quiet">Shop parts</ButtonLink>
        </div>
        {orders.length === 0 && (
          <p className="rounded-md border border-edge bg-surface p-5 text-fg-muted">
            No orders yet. Orders you place online while signed in show up here.
          </p>
        )}
        {orders.map((o) => (
          <article key={o.id} className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-edge bg-surface p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/account/orders/${o.reference}`} className="text-lg font-semibold">
                Order {o.reference}
              </Link>
              <span className="text-sm text-fg-muted">
                {date(o.created_at)} · {o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 text-sm">
              <strong>{formatPrice(o.total_cents)}</strong>
              <span>{ORDER_STATUS_LABELS[o.status]}</span>
            </div>
          </article>
        ))}
      </section>
    </AccountShell>
  );
}
