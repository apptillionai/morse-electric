import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/admin-shell";
import { InviteCustomerForm } from "@/components/admin/customer-forms";
import { requireStaff, staffClient } from "@/lib/admin/auth";
import { getAccountRequest } from "@/lib/admin/customers";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Invite customer" };

export default async function InviteCustomerPage(props: PageProps<"/admin/customers/new">) {
  await requireStaff();
  const sp = await props.searchParams;
  const requestId = typeof sp.request === "string" && /^[0-9a-f-]{36}$/i.test(sp.request) ? sp.request : null;
  const request = requestId ? await getAccountRequest(await staffClient(), requestId) : null;
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/customers">← Customers</Link></p>
      <PageHeader
        title="Invite a customer"
        description="Creates their login and gives you a one-time link. They open it, choose a password, and can then sign in at /account."
      />
      {!isSupabaseAdminConfigured() && (
        <Notice tone="warn">SUPABASE_SECRET_KEY isn’t set on this deployment, so new logins can’t be created yet.</Notice>
      )}
      {request && (
        <Notice>
          From business account request {request.reference}
          {request.wants_terms && " (they asked for Net-30 terms: set them on the customer’s page after inviting)"}.
        </Notice>
      )}
      <InviteCustomerForm
        requestId={request?.id}
        initial={request ? { email: request.email, name: request.name, company: request.company, phone: request.phone ?? "" } : undefined}
      />
    </>
  );
}
