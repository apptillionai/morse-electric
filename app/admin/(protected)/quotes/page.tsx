import Link from "next/link";
import { PageHeader } from "@/components/admin/admin-shell";
import { formatDate, InboxFilters, InboxTable, StatusBadge } from "@/components/admin/inbox";
import { listQuotes, QUOTE_STATUSES } from "@/lib/admin/requests";
import { staffClient } from "@/lib/admin/auth";

export const metadata = { title: "Quote requests" };

export default async function QuotesPage(props: PageProps<"/admin/quotes">) {
  const sp = await props.searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "open";
  const quotes = await listQuotes(await staffClient(), filter);
  return (
    <>
      <PageHeader title="Quote requests" description="Price and availability requests from the website." />
      <InboxFilters base="/admin/quotes" current={filter} statuses={QUOTE_STATUSES} />
      <InboxTable head={["Reference", "From", "Part", "Received", "Status"]} empty={quotes.length === 0}>
        {quotes.map((q) => (
          <tr key={q.id} className="border-b border-edge-soft last:border-b-0">
            <td className="px-4 py-3 font-mono"><Link href={`/admin/quotes/${q.id}`} className="font-semibold">{q.reference}</Link></td>
            <td className="px-4 py-3">
              {q.name}
              {q.company && <div className="text-xs text-fg-muted">{q.company}</div>}
            </td>
            <td className="px-4 py-3">
              {q.product_sku ? <span className="font-mono">{q.product_sku}</span> : <span className="text-fg-muted">General</span>}
              {q.quantity ? <span className="text-fg-muted"> × {q.quantity}</span> : null}
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{formatDate(q.created_at)}</td>
            <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
          </tr>
        ))}
      </InboxTable>
    </>
  );
}
