import Link from "next/link";
import { PageHeader } from "@/components/admin/admin-shell";
import { formatDate, InboxFilters, InboxTable, StatusBadge } from "@/components/admin/inbox";
import { staffClient } from "@/lib/admin/auth";
import { LISTED_ORDER_STATUSES, listOrders } from "@/lib/admin/orders";
import { formatPrice } from "@/lib/utils";

export const metadata = { title: "Orders" };

export default async function OrdersPage(props: PageProps<"/admin/orders">) {
  const sp = await props.searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "open";
  const orders = await listOrders(await staffClient(), filter);
  return (
    <>
      <PageHeader title="Orders" description="Orders placed and paid for on the website." />
      <InboxFilters base="/admin/orders" current={filter} statuses={LISTED_ORDER_STATUSES} />
      <InboxTable head={["Order", "Customer", "Items", "Total", "Delivery", "Placed", "Status"]} empty={orders.length === 0}>
        {orders.map((o) => (
          <tr key={o.id} className="border-b border-edge-soft last:border-b-0">
            <td className="px-4 py-3 font-mono"><Link href={`/admin/orders/${o.id}`} className="font-semibold">{o.reference}</Link></td>
            <td className="px-4 py-3">
              {o.name ?? <span className="text-fg-muted">Guest</span>}
              {o.email && <div className="text-xs text-fg-muted">{o.email}</div>}
            </td>
            <td className="px-4 py-3">{o.items[0]?.count ?? 0}</td>
            <td className="px-4 py-3">{formatPrice(o.total_cents)}</td>
            <td className="px-4 py-3">{o.fulfillment === "pickup" ? "Pickup" : "Ship"}</td>
            <td className="px-4 py-3 whitespace-nowrap">{formatDate(o.created_at)}</td>
            <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
          </tr>
        ))}
      </InboxTable>
    </>
  );
}
