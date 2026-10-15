import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/admin-shell";
import { InviteCustomerForm } from "@/components/admin/customer-forms";
import { requireStaff } from "@/lib/admin/auth";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Invite customer" };

export default async function InviteCustomerPage() {
  await requireStaff();
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
      <InviteCustomerForm />
    </>
  );
}
