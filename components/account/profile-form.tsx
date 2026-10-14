"use client";

import { FileCheck2 } from "lucide-react";
import { useActionState, useState } from "react";
import { saveProfile, uploadTaxCertificate, type AccountFormState } from "@/app/actions/account";
import { FormMessage, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import type { ProfileField } from "@/lib/customers/schemas";

const INITIAL: AccountFormState = {};

function Saved({ children }: { children: React.ReactNode }) {
  return <p role="status" className="rounded border-2 border-ok bg-surface px-4 py-3 text-sm font-medium text-ok">{children}</p>;
}

function AddressFields({ prefix, v, e }: { prefix: "ship" | "bill"; v: (f: ProfileField) => string; e: Record<string, string> }) {
  const f = (part: string) => `${prefix}_${part}` as ProfileField;
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <TextField label="Street address" name={f("line1")} autoComplete={`${prefix === "ship" ? "shipping" : "billing"} address-line1`} defaultValue={v(f("line1"))} error={e[f("line1")]} className="sm:col-span-6" />
      <TextField label="Suite, unit, building" name={f("line2")} autoComplete={`${prefix === "ship" ? "shipping" : "billing"} address-line2`} defaultValue={v(f("line2"))} error={e[f("line2")]} className="sm:col-span-6" />
      <TextField label="City" name={f("city")} autoComplete={`${prefix === "ship" ? "shipping" : "billing"} address-level2`} defaultValue={v(f("city"))} error={e[f("city")]} className="sm:col-span-3" />
      <TextField label="State" name={f("state")} autoComplete={`${prefix === "ship" ? "shipping" : "billing"} address-level1`} defaultValue={v(f("state"))} error={e[f("state")]} className="sm:col-span-1" />
      <TextField label="ZIP" name={f("postal")} autoComplete={`${prefix === "ship" ? "shipping" : "billing"} postal-code`} inputMode="numeric" defaultValue={v(f("postal"))} error={e[f("postal")]} className="sm:col-span-2" />
    </div>
  );
}

export function ProfileForm({ email, initial }: { email: string; initial: Record<ProfileField, string> }) {
  const [state, action, pending] = useActionState(saveProfile, INITIAL);
  const v = (f: ProfileField) => state.values?.[f] ?? initial[f];
  const e = state.fieldErrors ?? {};
  const [billSame, setBillSame] = useState(initial.bill_same_as_ship === "on");
  const key = state.values ? JSON.stringify(state) : "initial";

  return (
    <form action={action} key={key} className="flex flex-col gap-6" noValidate>
      {state.saved && <Saved>Saved. We’ll use these details on your quotes and repair paperwork.</Saved>}
      <FormMessage message={state.error} />

      <fieldset className="grid gap-4 rounded-md border border-edge bg-surface p-5 sm:grid-cols-2">
        <legend className="px-1 font-display text-xl font-bold uppercase tracking-[0.04em]">Contact</legend>
        <TextField label="Your name" name="name" autoComplete="name" required defaultValue={v("name")} error={e.name} />
        <TextField label="Company" name="company" autoComplete="organization" defaultValue={v("company")} error={e.company} />
        <TextField label="Phone" name="phone" type="tel" autoComplete="tel" defaultValue={v("phone")} error={e.phone} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Email</span>
          <span className="flex h-11 items-center text-fg">{email}</span>
          <span className="text-[13px] text-fg-muted">To change the email you sign in with, call us.</span>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-5">
        <legend className="px-1 font-display text-xl font-bold uppercase tracking-[0.04em]">Shipping address</legend>
        <AddressFields prefix="ship" v={v} e={e} />
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-5">
        <legend className="px-1 font-display text-xl font-bold uppercase tracking-[0.04em]">Billing address</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="bill_same_as_ship"
            checked={billSame}
            onChange={(event) => setBillSame(event.target.checked)}
            className="size-[18px] accent-fg"
          />
          Same as shipping
        </label>
        {!billSame && <AddressFields prefix="bill" v={v} e={e} />}
      </fieldset>

      <div>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save details"}</Button>
      </div>
    </form>
  );
}

export function TaxCertificateForm({ onFile }: { onFile: { uploadedAt: string; url: string | null } | null }) {
  const [state, action, pending] = useActionState(uploadTaxCertificate, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.saved && state.message && <Saved>{state.message}</Saved>}
      <FormMessage message={state.error} />
      {onFile && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <FileCheck2 size={18} className="text-ok" aria-hidden="true" />
          Certificate on file, uploaded {onFile.uploadedAt}.
          {onFile.url && (
            <a href={onFile.url} target="_blank" rel="noreferrer">
              View<span className="sr-only"> your tax-exemption certificate</span>
            </a>
          )}
        </p>
      )}
      <label htmlFor="certificate" className="text-sm font-semibold">{onFile ? "Replace certificate" : "Upload certificate"}</label>
      <input
        id="certificate"
        name="certificate"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        aria-describedby="certificate-hint"
        className="text-sm file:mr-3 file:h-11 file:cursor-pointer file:rounded file:border file:border-edge-strong file:bg-surface file:px-4 file:font-semibold file:text-fg"
      />
      <span id="certificate-hint" className="text-[13px] text-fg-muted">PDF, JPEG or PNG, up to 3.5 MB. Only you and our staff can see it.</span>
      <div>
        <Button type="submit" variant="dark" size="sm" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
      </div>
    </form>
  );
}
