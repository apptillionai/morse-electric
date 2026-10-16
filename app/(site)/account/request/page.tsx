import Link from "next/link";
import { AccountRequestForm } from "@/components/account/account-request-form";

export const metadata = {
  title: "Request a business account",
  description: "Apply for a Morse Electric customer account: track repairs and orders, keep company details on file, and apply for Net-30 terms.",
};

export default function AccountRequestPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pt-12 pb-20">
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Business accounts</span>
        <h1 className="display text-5xl">Request an account</h1>
        <p className="text-fg-muted">
          With an account you can follow repair jobs, see your quotes and orders, keep shipping and tax-exemption details on
          file, and, once approved, order on Net-30 terms. Already have one? <Link href="/account/login">Sign in</Link>.
        </p>
      </div>
      <AccountRequestForm />
    </div>
  );
}
