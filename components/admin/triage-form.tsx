"use client";

import { useActionState } from "react";
import type { TriageState } from "@/app/admin/actions";
import { FormMessage, SelectField, TextAreaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";

export function TriageForm({
  action: save,
  statuses,
  status,
  notes,
}: {
  action: (prev: TriageState, formData: FormData) => Promise<TriageState>;
  statuses: { value: string; label: string }[];
  status: string;
  notes: string;
}) {
  const [state, action, pending] = useActionState(save, {} as TriageState);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-5">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.04em]">Status</h2>
      <FormMessage message={state.error} />
      <SelectField label="Status" name="status" required defaultValue={status} options={statuses} />
      <TextAreaField label="Staff notes" name="staff_notes" rows={6} defaultValue={notes} hint="Only staff see these." />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="dark" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {state.saved && !pending && <span role="status" className="text-sm font-medium text-ok">Saved.</span>}
      </div>
    </form>
  );
}
