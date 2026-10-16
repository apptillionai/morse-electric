import Link from "next/link";
import { updateCoreAction } from "@/app/admin/core-actions";
import { PageHeader } from "@/components/admin/admin-shell";
import { CoreActions } from "@/components/admin/core-actions";
import { InboxTable } from "@/components/admin/inbox";
import { staffClient } from "@/lib/admin/auth";
import { CORE_FILTER_LABELS, CORE_FILTERS, listCores } from "@/lib/admin/cores";
import { daysUntilDue, shopToday } from "@/lib/orders/reminders";
import { CORE_STATUS_LABELS, formatDueDate } from "@/lib/orders/types";
import { cn, formatPrice } from "@/lib/utils";

export const metadata = { title: "Core returns" };

export default async function CoresPage(props: PageProps<"/admin/cores">) {
  const sp = await props.searchParams;
  const filter = typeof sp.status === "string" && (CORE_FILTERS as readonly string[]).includes(sp.status) ? sp.status : "open";
  const cores = await listCores(await staffClient(), filter);
  const today = shopToday();

  return (
    <>
      <PageHeader
        title="Core returns"
        description="Old units customers owe back for a core-charge refund. Mark them received, then refund or reject after inspection."
      />
      <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
        {CORE_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "open" ? "/admin/cores" : `/admin/cores?status=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold no-underline",
              filter === f ? "border-bold bg-bold text-on-bold hover:text-on-bold" : "border-edge-strong text-fg hover:border-bold hover:text-fg",
            )}
          >
            {CORE_FILTER_LABELS[f]}
          </Link>
        ))}
      </nav>
      <InboxTable head={["Order", "Item", "Core charge", "Due", "Status", "Actions"]} empty={cores.length === 0}>
        {cores.map((c) => {
          const days = daysUntilDue(c.due_date, today);
          const overdue = c.status === "awaiting" && days < 0;
          const amount = formatPrice(c.quantity * c.core_charge_cents) ?? "";
          return (
            <tr key={c.id} className="border-b border-edge-soft align-top last:border-b-0">
              <td className="px-4 py-3">
                {c.order && <Link href={`/admin/orders/${c.order.id}`} className="font-mono font-semibold">{c.order.reference}</Link>}
                <div className="text-xs text-fg-muted">{c.order?.name ?? c.order?.email}</div>
              </td>
              <td className="px-4 py-3">
                {c.item?.name}
                <div className="font-mono text-xs text-fg-muted">{c.item?.sku}</div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {c.quantity} × {formatPrice(c.core_charge_cents)}
                {c.status === "credited" && c.credit_cents !== null && <div className="text-xs text-fg-muted">Refunded {formatPrice(c.credit_cents)}</div>}
              </td>
              <td className={cn("px-4 py-3 whitespace-nowrap", overdue && "font-semibold text-danger")}>
                {formatDueDate(c.due_date)}
                {c.status === "awaiting" && <div className="text-xs">{overdue ? `${-days} days overdue` : days === 0 ? "Due today" : `in ${days} days`}</div>}
              </td>
              <td className="px-4 py-3">
                {CORE_STATUS_LABELS[c.status]}
                {c.rejection_reason && <div className="text-xs text-fg-muted">{c.rejection_reason}</div>}
              </td>
              <td className="px-4 py-3">
                <CoreActions action={updateCoreAction.bind(null, c.id)} status={c.status} amount={amount} />
              </td>
            </tr>
          );
        })}
      </InboxTable>
    </>
  );
}
