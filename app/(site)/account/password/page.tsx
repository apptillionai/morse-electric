import { redirect } from "next/navigation";
import { AccountCard } from "@/components/account/account-shell";
import { SetPasswordForm } from "@/components/account/account-forms";
import { getSignedInUser } from "@/lib/customers/account";

export const metadata = { title: "Choose a password" };

export default async function PasswordPage(props: PageProps<"/account/password">) {
  const [{ welcome }, user] = await Promise.all([props.searchParams, getSignedInUser()]);
  if (!user) redirect("/account/login");
  return (
    <AccountCard eyebrow={welcome ? "Step 2 of 2" : "Your account"} title="Choose a password">
      <p className="mb-5 text-fg-muted">
        You’ll sign in with <strong className="text-fg">{user.email}</strong> and this password.
      </p>
      <SetPasswordForm />
    </AccountCard>
  );
}
