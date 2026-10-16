import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/admin-shell";
import { formatDate, InboxTable } from "@/components/admin/inbox";
import { ButtonLink } from "@/components/ui/button";
import { staffClient } from "@/lib/admin/auth";
import { listAccountRequests, listCustomers } from "@/lib/admin/customers";
import { dismissAccountRequestAction } from "@/app/admin/actions";

export const metadata = { title: "Customers" };

export default async function CustomersPage(props: PageProps<"/admin/customers">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const supabase = await staffClient();
  const [customers, requests] = await Promise.all([listCustomers(supabase, q || null), listAccountRequests(supabase)]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer accounts are invite-only. Customers can track repairs, see their quotes and keep company details on file."
        actions={<ButtonLink href="/admin/customers/new" size="sm"><UserPlus size={16} aria-hidden="true" />Invite customer</ButtonLink>}
      />
      {sp.removed === "1" && <Notice>Customer account removed. Their past requests are kept.</Notice>}
      {requests.length > 0 && (
        <section aria-labelledby="requests-heading" className="mb-6 flex flex-col gap-3">
          <h2 id="requests-heading" className="font-display text-xl font-bold uppercase tracking-[0.04em]">
            Business account requests ({requests.length})
          </h2>
          <ul className="flex flex-col divide-y divide-edge-soft rounded-md border-2 border-warn bg-surface">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 text-sm">
                  <span>
                    <strong>{r.name}</strong>, {r.company}
                    {r.wants_terms && <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-xs font-semibold text-warn">Wants Net-30</span>}
                  </span>
                  <span className="text-fg-muted">
                    {r.email}
                    {r.phone && ` · ${r.phone}`} · {r.reference} · {formatDate(r.created_at)}
                  </span>
                  {r.details && <span className="whitespace-pre-line">{r.details}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ButtonLink href={`/admin/customers/new?request=${r.id}`} size="sm">Invite</ButtonLink>
                  <form action={dismissAccountRequestAction.bind(null, r.id)}>
                    <button type="submit" className="min-h-11 px-2 text-sm font-semibold text-fg-muted underline hover:text-fg">Dismiss</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-md border border-edge bg-surface p-4">
        <label className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5 text-sm font-semibold">
          Search
          <input name="q" defaultValue={q} placeholder="Name, company or email" className="h-11 rounded border border-edge-strong bg-surface px-3 font-normal text-fg placeholder:text-fg-muted" />
        </label>
        <button type="submit" className="h-11 rounded bg-bold px-5 font-semibold text-on-bold hover:bg-bold-hover">Search</button>
      </form>
      <InboxTable head={["Customer", "Email", "Phone", "Tax", "Since"]} empty={customers.length === 0}>
        {customers.map((c) => (
          <tr key={c.user_id} className="border-b border-edge-soft last:border-b-0">
            <td className="px-4 py-3">
              <Link href={`/admin/customers/${c.user_id}`} className="font-semibold">{c.name}</Link>
              {c.company && <div className="text-xs text-fg-muted">{c.company}</div>}
            </td>
            <td className="px-4 py-3">{c.email}</td>
            <td className="px-4 py-3">{c.phone ?? <span className="text-fg-muted">—</span>}</td>
            <td className="px-4 py-3">
              {c.tax_exempt ? (
                <span className="font-semibold text-ok">Exempt</span>
              ) : c.tax_cert_path ? (
                <span className="font-semibold text-warn">Certificate to review</span>
              ) : (
                <span className="text-fg-muted">Taxable</span>
              )}
            </td>
            <td className="px-4 py-3 whitespace-nowrap">{formatDate(c.created_at)}</td>
          </tr>
        ))}
      </InboxTable>
    </>
  );
}
