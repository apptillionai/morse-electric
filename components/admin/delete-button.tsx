"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="quiet" size="sm" disabled={pending} className="text-danger hover:border-danger hover:text-danger">
      <Trash2 size={16} aria-hidden="true" />
      {pending ? "Deleting…" : label}
    </Button>
  );
}

/** A form that posts to a server action after a confirmation prompt. */
export function DeleteButton({ action, label, confirmText }: { action: () => Promise<void>; label: string; confirmText: string }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
    >
      <Submit label={label} />
    </form>
  );
}
