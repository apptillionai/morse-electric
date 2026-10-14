import { Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";

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
      <div className="bg-ink text-[13px] text-mist">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-6 py-2">
          <span>
            <strong className="font-semibold text-copper-bright">24/7 emergency motor service</strong> · Call{" "}
            <PhoneLink className="text-white" />
          </span>
          <span>
            {SITE.hours} · {SITE.street}, {SITE.cityStateZip}
          </span>
        </div>
      </div>

      <header className="border-b border-line bg-white">
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
              className="h-11 min-w-0 flex-1 rounded-l border border-r-0 border-field bg-white px-3.5 text-[15px] placeholder:text-muted"
            />
            <button
              type="submit"
              aria-label="Search"
              className="flex h-11 w-12 items-center justify-center rounded-r bg-ink text-white"
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
