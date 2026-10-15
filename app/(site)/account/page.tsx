import { ClipboardList, Wrench } from "lucide-react";
import Link from "next/link";
import { AccountShell } from "@/components/account/account-shell";
import { RepairProgress } from "@/components/account/repair-progress";
import { ButtonLink } from "@/components/ui/button";
import { requireCustomer } from "@/lib/customers/account";
import { listMyRequests } from "@/lib/customers/requests";
import { QUOTE_STATUS_LABEL, SERVICE_STATUS_MESSAGE } from "@/lib/customers/status";
import { EQUIPMENT_TYPES } from "@/lib/requests/schemas";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata = { title: "Requests & repairs" };

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(iso));

function Notice({ children }: { children: React.ReactNode }) {
  return <p role="status" className="rounded border-2 border-ok bg-surface px-4 py-3 text-sm font-medium text-ok">{children}</p>;
}

export default async function AccountPage(props: PageProps<"/account">) {
  const [{ id, customer }, sp] = await Promise.all([requireCustomer(), props.searchParams]);
  const { service, quotes } = await listMyRequests(await createSessionClient(), id);
  const open = service.filter((j) => !["delivered", "closed"].includes(j.status));
  const past = service.filter((j) => ["delivered", "closed"].includes(j.status));

  return (
    <AccountShell current="/account" name={customer.name} company={customer.company}>
      {sp.password === "1" && <Notice>Password saved. You’re signed in.</Notice>}

      <section aria-labelledby="repairs-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="repairs-heading" className="flex items-center gap-2 font-display text-3xl font-bold uppercase tracking-[0.03em]">
            <Wrench size={24} aria-hidden="true" /> Repair jobs
          </h2>
          <ButtonLink href="/service#request" size="sm" variant="quiet">Request a repair</ButtonLink>
        </div>
        {service.length === 0 && (
          <p className="rounded-md border border-edge bg-surface p-5 text-fg-muted">
            No repair jobs yet. Requests you send while signed in show up here with live status.
          </p>
        )}
        {[...open, ...past].map((job) => (
          <article key={job.id} className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-semibold">
                {EQUIPMENT_TYPES[job.equipment_type]}
                {(job.make || job.size) && <span className="font-normal text-fg-muted"> · {[job.make, job.size].filter(Boolean).join(" ")}</span>}
              </h3>
              <span className="text-sm text-fg-muted">
                Job <span className="font-mono font-semibold text-fg">{job.reference}</span> · sent {date(job.created_at)}
                {job.is_rush && <span className="ml-2 rounded-full border border-danger px-2 py-0.5 text-xs font-semibold text-danger">Rush</span>}
              </span>
            </div>
            <RepairProgress status={job.status} />
            <p className="font-medium">{SERVICE_STATUS_MESSAGE[job.status]}</p>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">What you told us</summary>
              <p className="mt-2 whitespace-pre-line text-fg-muted">{job.symptoms}</p>
              {job.model_serial && <p className="mt-1 text-fg-muted">Model / serial: <span className="font-mono">{job.model_serial}</span></p>}
            </details>
          </article>
        ))}
      </section>

      <section aria-labelledby="quotes-heading" className="mt-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="quotes-heading" className="flex items-center gap-2 font-display text-3xl font-bold uppercase tracking-[0.03em]">
            <ClipboardList size={24} aria-hidden="true" /> Quote requests
          </h2>
          <ButtonLink href="/quote" size="sm" variant="quiet">Request a quote</ButtonLink>
        </div>
        {quotes.length === 0 ? (
          <p className="rounded-md border border-edge bg-surface p-5 text-fg-muted">
            No quote requests yet. <Link href="/shop">Browse parts</Link> or <Link href="/quote">ask us for a price</Link>.
          </p>
        ) : (
          <div role="region" aria-labelledby="quotes-heading" tabIndex={0} className="overflow-x-auto rounded-md border border-edge bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-edge text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Part</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Sent</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b border-edge-soft last:border-b-0">
                    <td className="px-4 py-3 font-mono font-semibold">{q.reference}</td>
                    <td className="px-4 py-3">
                      {q.product_sku ? <span className="font-mono">{q.product_sku}</span> : <span className="line-clamp-1 text-fg-muted">{q.details}</span>}
                      {q.quantity ? <span className="text-fg-muted"> × {q.quantity}</span> : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{date(q.created_at)}</td>
                    <td className="px-4 py-3 font-semibold">{QUOTE_STATUS_LABEL[q.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-fg-muted">Prices and quotes are sent by email. Reply to that email or call us to order.</p>
      </section>
    </AccountShell>
  );
}
