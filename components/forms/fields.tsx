import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded border bg-white px-3 font-normal text-[15px] text-ink placeholder:text-steel aria-[invalid=true]:border-danger";

interface FieldProps {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

function FieldShell({
  label,
  name,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps & { children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-sm font-semibold">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <span id={`${name}-hint`} className="text-[13px] text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${name}-error`} className="text-[13px] font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

function describedBy(name: string, error?: string, hint?: ReactNode) {
  return error ? `${name}-error` : hint ? `${name}-hint` : undefined;
}

export function TextField({
  label,
  name,
  error,
  hint,
  required,
  className,
  ...props
}: FieldProps & Omit<ComponentProps<"input">, "name">) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required} className={className}>
      <input
        id={name}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={cn(control, "h-11 border-field")}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  required,
  className,
  ...props
}: FieldProps & Omit<ComponentProps<"textarea">, "name">) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required} className={className}>
      <textarea
        id={name}
        name={name}
        required={required}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
        className={cn(control, "resize-y border-field py-2.5")}
        {...props}
      />
    </FieldShell>
  );
}

export function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-[18px] accent-ink" />
      {label}
    </label>
  );
}

/** Off-screen field bots fill in and people never see. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
      {message}
    </p>
  );
}
