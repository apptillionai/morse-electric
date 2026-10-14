"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  acceptAccountLink,
  requestPasswordReset,
  setPassword,
  signInCustomer,
  type AccountFormState,
} from "@/app/actions/account";
import { FormMessage, Honeypot, TextField } from "@/components/forms/fields";
import { Turnstile } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN } from "@/lib/customers/schemas";

const INITIAL: AccountFormState = {};

export function CustomerLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInCustomer, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormMessage message={state.error} />
      <TextField label="Email" name="email" type="email" autoComplete="username" required defaultValue={state.values?.email} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm">
        <Link href="/account/forgot">Forgot your password?</Link>
      </p>
    </form>
  );
}

export function AcceptLinkForm({ tokenHash, type, label }: { tokenHash: string; type: string; label: string }) {
  const [state, action, pending] = useActionState(acceptAccountLink, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <FormMessage message={state.error} />
      {state.error ? (
        <p className="text-sm">
          <Link href="/account/forgot">Get a new sign-in link</Link>
        </p>
      ) : (
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Checking…" : label}
        </Button>
      )}
    </form>
  );
}

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage message={state.error} />
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        error={e.password}
        hint={`At least ${PASSWORD_MIN} characters. A few unrelated words works well.`}
      />
      <TextField label="Type it again" name="confirm" type="password" autoComplete="new-password" required error={e.confirm} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, INITIAL);
  if (state.saved) {
    return (
      <p role="status" className="rounded border-2 border-ok bg-surface px-4 py-3 text-sm font-medium text-ok">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="relative flex flex-col gap-4" noValidate>
      <Honeypot />
      <FormMessage message={state.error} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Turnstile action="account" resetSignal={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
