import Link from "next/link";
import { notFound } from "next/navigation";
import { updateQuoteAction } from "@/app/admin/actions";
import { PageHeader } from "@/components/admin/admin-shell";
import { Detail, formatDate, RequestPhotos, StatusBadge } from "@/components/admin/inbox";
import { TriageForm } from "@/components/admin/triage-form";
import { getQuote, QUOTE_STATUSES, STATUS_LABELS } from "@/lib/admin/requests";
import { staffClient } from "@/lib/admin/auth";
import { QuotePanel } from "@/components/admin/quote-panel";
import { listQuotesFor } from "@/lib/quotes/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Quote request" };

export default async function QuotePage(props: PageProps<"/admin/quotes/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!UUID.test(id)) notFound();
  const supabase = await staffClient();
  const [q, quotes] = await Promise.all([getQuote(supabase, id), listQuotesFor(supabase, { quoteRequestId: id })]);
  if (!q) notFound();

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/quotes">← Quote requests</Link></p>
      <PageHeader title={q.reference} description={<>Received {formatDate(q.created_at)} · <StatusBadge status={q.status} /></>} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <dl className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
          <Detail label="Name">{q.name}</Detail>
          <Detail label="Account">
            {q.customer_id ? <Link href={`/admin/customers/${q.customer_id}`}>Customer account</Link> : <span className="text-fg-muted">Sent without signing in</span>}
          </Detail>
          <Detail label="Company">{q.company}</Detail>
          <Detail label="Email"><a href={`mailto:${q.email}?subject=${encodeURIComponent(`Your Morse Electric quote ${q.reference}`)}`}>{q.email}</a></Detail>
          <Detail label="Phone">{q.phone && <a href={`tel:${q.phone}`}>{q.phone}</a>}</Detail>
          <Detail label="Part">
            {q.product_sku && (q.product_id ? <Link href={`/admin/products/${q.product_id}`} className="font-mono">{q.product_sku}</Link> : <span className="font-mono">{q.product_sku}</span>)}
          </Detail>
          <Detail label="Quantity">{q.quantity}</Detail>
          <Detail label="Details">{q.details && <span className="whitespace-pre-line">{q.details}</span>}</Detail>
          <Detail label="Photos">{q.photos.length > 0 && <RequestPhotos photos={q.photos} />}</Detail>
        </dl>
        <TriageForm
          action={updateQuoteAction.bind(null, q.id)}
          statuses={QUOTE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          status={q.status}
          notes={q.staff_notes ?? ""}
        />
      </div>
      <div className="mt-6">
        <QuotePanel
          kind="parts"
          requestId={q.id}
          quotes={quotes}
          notice={{
            quote: typeof sp.quote === "string" ? sp.quote : undefined,
            link: typeof sp.link === "string" ? sp.link : undefined,
            quoteError: typeof sp.quote_error === "string" ? sp.quote_error : undefined,
          }}
        />
      </div>
    </>
  );
}
