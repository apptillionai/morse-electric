import Link from "next/link";
import { notFound } from "next/navigation";
import { updateQuoteAction } from "@/app/admin/actions";
import { PageHeader } from "@/components/admin/admin-shell";
import { Detail, formatDate, StatusBadge } from "@/components/admin/inbox";
import { TriageForm } from "@/components/admin/triage-form";
import { getQuote, QUOTE_STATUSES, STATUS_LABELS } from "@/lib/admin/requests";
import { staffClient } from "@/lib/admin/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Quote request" };

export default async function QuotePage(props: PageProps<"/admin/quotes/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const q = await getQuote(await staffClient(), id);
  if (!q) notFound();

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/quotes">← Quote requests</Link></p>
      <PageHeader title={q.reference} description={<>Received {formatDate(q.created_at)} · <StatusBadge status={q.status} /></>} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <dl className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
          <Detail label="Name">{q.name}</Detail>
          <Detail label="Company">{q.company}</Detail>
          <Detail label="Email"><a href={`mailto:${q.email}?subject=${encodeURIComponent(`Your Morse Electric quote ${q.reference}`)}`}>{q.email}</a></Detail>
          <Detail label="Phone">{q.phone && <a href={`tel:${q.phone}`}>{q.phone}</a>}</Detail>
          <Detail label="Part">
            {q.product_sku && (q.product_id ? <Link href={`/admin/products/${q.product_id}`} className="font-mono">{q.product_sku}</Link> : <span className="font-mono">{q.product_sku}</span>)}
          </Detail>
          <Detail label="Quantity">{q.quantity}</Detail>
          <Detail label="Details">{q.details && <span className="whitespace-pre-line">{q.details}</span>}</Detail>
        </dl>
        <TriageForm
          action={updateQuoteAction.bind(null, q.id)}
          statuses={QUOTE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          status={q.status}
          notes={q.staff_notes ?? ""}
        />
      </div>
    </>
  );
}
