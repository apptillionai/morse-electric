import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountCard } from "@/components/account/account-shell";
import { CustomerLoginForm } from "@/components/account/account-forms";
import { PhoneLink } from "@/components/site/site-header";
import { getSignedInUser } from "@/lib/customers/account";
import { safeAccountPath } from "@/lib/customers/links";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Sign in" };

export default async function CustomerLoginPage(props: PageProps<"/account/login">) {
  const { next } = await props.searchParams;
  const destination = safeAccountPath(typeof next === "string" ? next : null);
  const user = await getSignedInUser();
  if (user?.customer) redirect(destination);

  return (
    <AccountCard eyebrow="Customer account" title="Sign in">
      {user ? (
        <p className="mb-5 rounded border-2 border-warn bg-surface px-4 py-3 text-sm font-medium text-warn">
          You’re signed in with a staff login, which doesn’t have a customer account. <Link href="/admin">Go to the admin</Link>.
        </p>
      ) : null}
      {isSupabaseConfigured() ? (
        <CustomerLoginForm next={destination} />
      ) : (
        <p className="text-fg-muted">Customer accounts aren’t available on this preview.</p>
      )}
      <p className="mt-6 border-t border-edge pt-5 text-sm text-fg-muted">
        Accounts are set up by our team for business customers. <Link href="/account/request">Request an account</Link>, or
        call <PhoneLink className="font-semibold" />.
      </p>
    </AccountCard>
  );
}
