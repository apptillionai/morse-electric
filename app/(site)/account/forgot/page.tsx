import Link from "next/link";
import { AccountCard } from "@/components/account/account-shell";
import { ForgotPasswordForm } from "@/components/account/account-forms";

export const metadata = { title: "Forgot your password?" };

export default function ForgotPasswordPage() {
  return (
    <AccountCard eyebrow="Customer account" title="Forgot your password?">
      <p className="mb-5 text-fg-muted">Enter the email you sign in with and we’ll send you a one-time sign-in link.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm">
        <Link href="/account/login">Back to sign in</Link>
      </p>
    </AccountCard>
  );
}
