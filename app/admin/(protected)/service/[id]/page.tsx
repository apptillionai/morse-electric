import Link from "next/link";
import { notFound } from "next/navigation";
import { updateServiceAction } from "@/app/admin/actions";
import { PageHeader } from "@/components/admin/admin-shell";
import { Detail, formatDate, StatusBadge } from "@/components/admin/inbox";
import { TriageForm } from "@/components/admin/triage-form";
import { getServiceRequest, SERVICE_STATUSES, STATUS_LABELS } from "@/lib/admin/requests";
import { EQUIPMENT_TYPES } from "@/lib/requests/schemas";
import { staffClient } from "@/lib/admin/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Service job" };

const yesNo = (v: boolean) => (v ? "Yes" : "No");

export default async function ServiceJobPage(props: PageProps<"/admin/service/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const j = await getServiceRequest(await staffClient(), id);
  if (!j) notFound();

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/service">← Service jobs</Link></p>
      <PageHeader
        title={j.reference}
        description={
          <>
            Received {formatDate(j.created_at)} · <StatusBadge status={j.status} />
            {j.is_rush && <span className="ml-2 rounded-full border border-danger px-2 py-0.5 text-xs font-semibold text-danger">Rush</span>}
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <dl className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
          <Detail label="Name">{j.name}</Detail>
          <Detail label="Account">
            {j.customer_id ? <Link href={`/admin/customers/${j.customer_id}`}>Customer account</Link> : <span className="text-fg-muted">Sent without signing in</span>}
          </Detail>
          <Detail label="Company">{j.company}</Detail>
          <Detail label="Email"><a href={`mailto:${j.email}?subject=${encodeURIComponent(`Your Morse Electric repair ${j.reference}`)}`}>{j.email}</a></Detail>
          <Detail label="Phone"><a href={`tel:${j.phone}`}>{j.phone}</a></Detail>
          <Detail label="Equipment">{EQUIPMENT_TYPES[j.equipment_type] ?? j.equipment_type}</Detail>
          <Detail label="Make">{j.make}</Detail>
          <Detail label="Size / rating">{j.size}</Detail>
          <Detail label="Model / serial">{j.model_serial && <span className="font-mono">{j.model_serial}</span>}</Detail>
          <Detail label="Symptoms"><span className="whitespace-pre-line">{j.symptoms}</span></Detail>
          <Detail label="Pickup wanted">{yesNo(j.wants_pickup)}</Detail>
          <Detail label="Rush">{yesNo(j.is_rush)}</Detail>
          <Detail label="Replacement quote">{yesNo(j.wants_replacement_quote)}</Detail>
        </dl>
        <TriageForm
          action={updateServiceAction.bind(null, j.id)}
          statuses={SERVICE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          status={j.status}
          notes={j.staff_notes ?? ""}
        />
      </div>
    </>
  );
}
