import { CircleUser, Search } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";
import { ThemeChooser } from "./theme-chooser";

export function PhoneLink({ className }: { className?: string }) {
  return SITE.phoneHref ? (
    <a href={SITE.phoneHref} className={className}>
      {SITE.phone}
    </a>
  ) : (
    <span className={className}>{SITE.phone}</span>
  );
}

export function SiteHeader() {
  return (
    <>
      <div className="bg-inverse text-[13px] text-on-inverse-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-6 py-2">
          <span>
            <strong className="font-semibold text-on-inverse-accent">24/7 emergency motor service</strong> · Call{" "}
            <PhoneLink className="text-on-inverse" />
          </span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span>
              {SITE.hours} · {SITE.street}, {SITE.cityStateZip}
            </span>
            <Link href="/account" className="inline-flex items-center gap-1.5 font-semibold text-on-inverse no-underline hover:text-on-inverse-accent">
              <CircleUser size={16} aria-hidden="true" />
              Customer login
            </Link>
            <ThemeChooser />
          </span>
        </div>
      </div>

      <header className="border-b border-edge bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3.5 px-6 py-3.5">
          <Logo />
          <NavLinks />
          <form role="search" action="/shop" className="flex min-w-0 flex-[1_1_240px]">
            <label htmlFor="site-search" className="sr-only">
              Search parts
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              placeholder="Part #, HP, frame…"
              className="h-11 min-w-0 flex-1 rounded-l border border-r-0 border-edge-strong bg-surface px-3.5 text-[15px] placeholder:text-fg-muted"
            />
            <button
              type="submit"
              aria-label="Search"
              className="flex h-11 w-12 items-center justify-center rounded-r bg-bold text-on-bold"
            >
              <Search size={20} aria-hidden="true" />
            </button>
          </form>
          <ButtonLink href="/service#request" size="sm">
            Request service
          </ButtonLink>
        </div>
      </header>
    </>
  );
}
