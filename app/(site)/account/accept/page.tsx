import Link from "next/link";
import { AccountCard } from "@/components/account/account-shell";
import { AcceptLinkForm } from "@/components/account/account-forms";
import { isAccountLinkType } from "@/lib/customers/links";

export const metadata = { title: "Set up your account" };

export default async function AcceptLinkPage(props: PageProps<"/account/accept">) {
  const { token_hash, type } = await props.searchParams;
  const valid = typeof token_hash === "string" && token_hash.length > 0 && isAccountLinkType(type);
  const invite = type === "invite";

  return (
    <AccountCard eyebrow="Customer account" title={invite ? "Welcome to Morse" : "Sign in"}>
      {valid ? (
        <>
          <p className="mb-5 text-fg-muted">
            {invite
              ? "Your account is ready. Continue to choose a password. You’ll then be able to track repairs and see your quotes."
              : "Continue to sign in and choose a new password."}
          </p>
          <AcceptLinkForm tokenHash={token_hash} type={type} label="Continue" />
        </>
      ) : (
        <p className="text-fg-muted">
          This link isn’t complete. Open it straight from the email, or <Link href="/account/forgot">ask for a new one</Link>.
        </p>
      )}
    </AccountCard>
  );
}
