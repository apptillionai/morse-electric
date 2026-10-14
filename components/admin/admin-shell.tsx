import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/admin/actions";
import { SkipLink } from "@/components/site/site-chrome";
import { ThemeChooser } from "@/components/site/theme-chooser";
import type { StaffUser } from "@/lib/admin/auth";
import { AdminNav } from "./admin-nav";

export function AdminShell({ staff, children }: { staff: StaffUser; children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <header className="bg-inverse text-on-inverse">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/admin" className="font-display text-2xl font-bold tracking-[0.04em] text-on-inverse no-underline hover:text-on-inverse">
            MORSE <span className="text-base font-medium text-on-inverse-accent">ADMIN</span>
          </Link>
          <AdminNav />
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-on-inverse-muted">
            <ThemeChooser />
            <span className="hidden md:inline">{staff.email}</span>
            <Link href="/" className="text-on-inverse-muted hover:text-on-inverse">View site</Link>
            <form action={signOut}>
              <button type="submit" className="inline-flex min-h-9 items-center gap-1.5 rounded border border-inverse-edge-strong px-3 font-semibold text-on-inverse hover:border-on-inverse">
                <LogOut size={14} aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-6 pt-8 pb-20">
        {children}
      </main>
    </>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="display text-4xl">{title}</h1>
        {description && <p className="max-w-3xl text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "ok", children }: { tone?: "ok" | "warn" | "danger"; children: ReactNode }) {
  const color = { ok: "border-ok text-ok", warn: "border-warn text-warn", danger: "border-danger text-danger" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`mb-6 rounded border-2 bg-surface px-4 py-3 text-sm font-medium ${color}`}>
      {children}
    </div>
  );
}
