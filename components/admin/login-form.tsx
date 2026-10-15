"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/admin/actions";
import { FormMessage, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, {} as SignInState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormMessage message={state.error} />
      <TextField label="Email" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
