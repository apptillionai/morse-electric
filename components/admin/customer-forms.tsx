"use client";

import { Check, Copy, Link2, Mail } from "lucide-react";
import { useActionState, useState } from "react";
import {
  inviteCustomerAction,
  newSignInLinkAction,
  setTermsAction,
  type AccountLinkResult,
  type InviteState,
  type LinkState,
  type TermsState,
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

type InviteDefaults = Partial<Record<"email" | "name" | "company" | "phone", string>>;

/** `initial` and `requestId` prefill the form from a "Request a business account" submission. */
export function InviteCustomerForm({ initial, requestId }: { initial?: InviteDefaults; requestId?: string }) {
  // A new key starts a fresh form (and fresh action state) for the next invite.
  const [round, setRound] = useState(0);
  return (
    <InviteForm
      key={round}
      initial={round === 0 ? initial : undefined}
      requestId={round === 0 ? requestId : undefined}
      onAgain={() => setRound((r) => r + 1)}
    />
  );
}

function InviteForm({ onAgain, initial, requestId }: { onAgain: () => void; initial?: InviteDefaults; requestId?: string }) {
  const [state, action, pending] = useActionState(inviteCustomerAction, {} as InviteState);
  const v = state.values ?? initial ?? {};
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
      {requestId && <input type="hidden" name="request_id" value={requestId} />}
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

/** Payment terms and credit limit for one customer. */
export function TermsForm({ customerId, terms, limitCents }: { customerId: string; terms: "prepay" | "net30"; limitCents: number }) {
  const [state, action, pending] = useActionState(setTermsAction.bind(null, customerId), {} as TermsState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage message={state.error} />
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Terms</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
          <input type="radio" name="terms" value="prepay" defaultChecked={terms === "prepay"} className="size-[18px] accent-fg" />
          Pays at checkout (card or bank transfer)
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
          <input type="radio" name="terms" value="net30" defaultChecked={terms === "net30"} className="size-[18px] accent-fg" />
          Net-30: can charge orders to their account
        </label>
      </fieldset>
      <TextField
        label="Credit limit ($)"
        name="credit_limit"
        inputMode="decimal"
        defaultValue={limitCents ? (limitCents / 100).toFixed(2) : ""}
        hint="Orders on account stop once unpaid invoices would go over this."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="dark" size="sm" disabled={pending}>{pending ? "Saving…" : "Save terms"}</Button>
        {state.saved && !pending && <span role="status" className="text-sm font-medium text-ok">Saved.</span>}
      </div>
    </form>
  );
}
