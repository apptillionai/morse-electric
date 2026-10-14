"use client";

import { Check, Copy, Link2, Mail } from "lucide-react";
import { useActionState, useState } from "react";
import {
  inviteCustomerAction,
  newSignInLinkAction,
  type AccountLinkResult,
  type InviteState,
  type LinkState,
} from "@/app/admin/actions";
import { FormMessage, TextField } from "@/components/forms/fields";
import { Button, ButtonLink } from "@/components/ui/button";

/** Shows a one-time sign-in link for staff to copy, and whether it was emailed. */
export function AccountLinkPanel({ link, intro }: { link: AccountLinkResult; intro: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="flex flex-col gap-3 rounded-md border-2 border-ok bg-surface p-5">
      <p className="font-semibold text-ok">{intro}</p>
      {link.emailed ? (
        <p className="flex items-center gap-2 text-sm">
          <Mail size={16} aria-hidden="true" /> We emailed the link to <strong>{link.email}</strong>. You can also copy it below.
        </p>
      ) : (
        <p className="text-sm">
          Email isn’t set up yet, so <strong>copy this link and send it to {link.email}</strong> yourself (email or text).
        </p>
      )}
      <div className="flex flex-wrap items-stretch gap-2">
        <label htmlFor="account-link" className="sr-only">Sign-in link</label>
        <input
          id="account-link"
          readOnly
          value={link.url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-11 min-w-0 flex-[1_1_320px] rounded border border-edge-strong bg-page px-3 font-mono text-xs text-fg"
        />
        <Button
          variant="dark"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(link.url);
            setCopied(true);
          }}
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-[13px] text-fg-muted">
        The link works once. It expires after the “Email OTP expiration” time set in Supabase (1 hour by default). If it
        expires, make a new one from the customer’s page.
      </p>
    </div>
  );
}

export function InviteCustomerForm() {
  // A new key starts a fresh form (and fresh action state) for the next invite.
  const [round, setRound] = useState(0);
  return <InviteForm key={round} onAgain={() => setRound((r) => r + 1)} />;
}

function InviteForm({ onAgain }: { onAgain: () => void }) {
  const [state, action, pending] = useActionState(inviteCustomerAction, {} as InviteState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  if (state.done) {
    const d = state.done;
    return (
      <div className="flex flex-col gap-4">
        <AccountLinkPanel link={d} intro={`Account created for ${d.name}.`} />
        {d.linked > 0 && (
          <p className="text-sm">
            Linked {d.linked} earlier request{d.linked === 1 ? "" : "s"} sent from {d.email}, so they’ll see {d.linked === 1 ? "it" : "them"} in their account.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/admin/customers/${d.customerId}`} variant="quiet" size="sm">Open customer</ButtonLink>
          <Button variant="quiet" size="sm" onClick={onAgain}>Invite another</Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5 rounded-md border border-edge bg-surface p-6" noValidate>
      <FormMessage message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Email" name="email" type="email" required defaultValue={v.email} error={e.email} hint="They’ll sign in with this." />
        <TextField label="Name" name="name" required defaultValue={v.name} error={e.name} />
        <TextField label="Company" name="company" defaultValue={v.company} error={e.company} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={v.phone} error={e.phone} />
      </div>
      <div>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Creating…" : "Create account & get invite link"}</Button>
      </div>
    </form>
  );
}

export function NewSignInLinkForm({ customerId }: { customerId: string }) {
  const [state, action, pending] = useActionState(newSignInLinkAction.bind(null, customerId), {} as LinkState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage message={state.error} />
      {state.link && <AccountLinkPanel link={state.link} intro="New sign-in link ready." />}
      <div>
        <Button type="submit" variant="quiet" size="sm" disabled={pending}>
          <Link2 size={16} aria-hidden="true" />
          {pending ? "Creating…" : "Make a new sign-in link"}
        </Button>
      </div>
      <p className="text-[13px] text-fg-muted">For a customer who lost the invite or forgot their password. It lets them choose a new password.</p>
    </form>
  );
}
