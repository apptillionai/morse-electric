"use client";

import { useActionState } from "react";
import { submitAccountRequest } from "@/app/actions/requests";
import { CheckboxField, FormMessage, Honeypot, TextAreaField, TextField } from "@/components/forms/fields";
import { RequestReceived } from "@/components/forms/request-received";
import { Turnstile } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/requests/form-state";

export function AccountRequestForm() {
  const [state, action, pending] = useActionState(submitAccountRequest, INITIAL_FORM_STATE);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  if (state.status === "success") {
    return (
      <RequestReceived title="Request received" reference={state.reference}>
        We’ll review it and email you a link to set up your account, usually within one business day.
      </RequestReceived>
    );
  }

  return (
    <form action={action} className="relative flex flex-col gap-5" noValidate>
      <Honeypot />
      <FormMessage message={state.status === "error" ? state.message : undefined} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        <TextField label="Name" name="name" autoComplete="name" required defaultValue={v.name} error={e.name} />
        <TextField label="Company" name="company" autoComplete="organization" required defaultValue={v.company} error={e.company} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={v.email} error={e.email} hint="You’ll sign in with this." />
        <TextField label="Phone" name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} error={e.phone} />
      </div>
      <CheckboxField label="We’d like to apply for Net-30 terms" name="wantsTerms" defaultChecked={v.wantsTerms === "on"} />
      <TextAreaField
        label="Anything else"
        name="details"
        defaultValue={v.details}
        error={e.details}
        placeholder="What you buy from us or have repaired, how often, and for Net-30 a trade reference or two."
      />
      <Turnstile action="business" resetSignal={state} />
      <div>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Sending…" : "Request an account"}</Button>
      </div>
    </form>
  );
}
