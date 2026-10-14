import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/admin-shell";
import { formatDate, InboxTable } from "@/components/admin/inbox";
import { ButtonLink } from "@/components/ui/button";
import { staffClient } from "@/lib/admin/auth";
import { listCustomers } from "@/lib/admin/customers";

export const metadata = { title: "Customers" };

export default async function CustomersPage(props: PageProps<"/admin/customers">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const customers = await listCustomers(await staffClient(), q || null);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer accounts are invite-only. Customers can track repairs, see their quotes and keep company details on file."
        actions={<ButtonLink href="/admin/customers/new" size="sm"><UserPlus size={16} aria-hidden="true" />Invite customer</ButtonLink>}
      />
      {sp.removed === "1" && <Notice>Customer account removed. Their past requests are kept.</Notice>}
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
