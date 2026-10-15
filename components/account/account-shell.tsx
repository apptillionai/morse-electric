import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutCustomer } from "@/app/actions/account";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account", label: "Requests & repairs" },
  { href: "/account/profile", label: "Company details" },
] as const;

export function AccountShell({
  current,
  name,
  company,
  children,
}: {
  current: (typeof TABS)[number]["href"];
  name: string;
  company: string | null;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 pt-12 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Your account</span>
          <h1 className="display text-5xl">{name}</h1>
          {company && <p className="text-fg-muted">{company}</p>}
        </div>
        <form action={signOutCustomer}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-1.5 rounded border border-edge-strong bg-surface px-4 text-sm font-semibold hover:border-bold"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
      <nav aria-label="Account" className="flex flex-wrap gap-2 border-b border-edge pb-3">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current === t.href ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded px-3.5 text-sm font-semibold no-underline",
              current === t.href ? "bg-bold text-on-bold hover:text-on-bold" : "text-fg hover:bg-surface hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

/** Centered card for the sign-in, link and password pages. */
export function AccountCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-md border border-edge bg-surface p-8">
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="display mb-6 text-4xl">{title}</h1>
        {children}
      </div>
    </div>
  );
}
