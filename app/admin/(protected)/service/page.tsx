import Link from "next/link";
import { PageHeader } from "@/components/admin/admin-shell";
import { formatDate, InboxFilters, InboxTable, StatusBadge } from "@/components/admin/inbox";
import { listServiceRequests, SERVICE_STATUSES } from "@/lib/admin/requests";
import { EQUIPMENT_TYPES } from "@/lib/requests/schemas";
import { staffClient } from "@/lib/admin/auth";

export const metadata = { title: "Service jobs" };

export default async function ServicePage(props: PageProps<"/admin/service">) {
  const sp = await props.searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "open";
  const jobs = await listServiceRequests(await staffClient(), filter);
  return (
    <>
      <PageHeader title="Service jobs" description="Repair requests from the website. Rush jobs are listed first." />
      <InboxFilters base="/admin/service" current={filter} statuses={SERVICE_STATUSES} />
      <InboxTable head={["Job", "Customer", "Equipment", "Received", "Status"]} empty={jobs.length === 0}>
        {jobs.map((j) => (
          <tr key={j.id} className="border-b border-edge-soft last:border-b-0">
            <td className="px-4 py-3 font-mono">
              <Link href={`/admin/service/${j.id}`} className="font-semibold">{j.reference}</Link>
              {j.is_rush && <span className="ml-2 rounded-full border border-danger px-2 py-0.5 font-sans text-xs font-semibold text-danger">Rush</span>}
            </td>
            <td className="px-4 py-3">
              {j.name}
              {j.company && <div className="text-xs text-fg-muted">{j.company}</div>}
            </td>
            <td className="px-4 py-3">
              {EQUIPMENT_TYPES[j.equipment_type] ?? j.equipment_type}
              {(j.make || j.size) && <div className="text-xs text-fg-muted">{[j.make, j.size].filter(Boolean).join(" · ")}</div>}
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{formatDate(j.created_at)}</td>
            <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
          </tr>
        ))}
      </InboxTable>
    </>
  );
}
