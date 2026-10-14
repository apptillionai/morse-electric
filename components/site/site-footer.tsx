import Link from "next/link";
import { SEED_CATEGORIES } from "@/lib/catalog/seed";
import { SITE } from "@/lib/site";
import { PhoneLink } from "./site-header";

const linkClass = "text-mist no-underline hover:text-white";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-sm text-mist">
      <div className="mx-auto grid max-w-7xl grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8 px-6 pt-14 pb-8">
        <div className="flex flex-col gap-2.5">
          <span className="font-display text-[26px] font-bold tracking-[0.04em] text-white">
            MORSE ELECTRIC MOTOR CO.
          </span>
          <span>
            {SITE.street}
            <br />
            {SITE.cityStateZip}
          </span>
          <span>
            <PhoneLink className="text-mist" /> · {SITE.email}
          </span>
        </div>
        <nav aria-label="Shop" className="flex flex-col gap-2.5">
          <strong className="text-white">Shop</strong>
          {SEED_CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/shop/${c.slug}`} className={linkClass}>
              {c.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Service" className="flex flex-col gap-2.5">
          <strong className="text-white">Service</strong>
          <Link href="/service#request" className={linkClass}>
            Request a repair
          </Link>
          <Link href="/service#field" className={linkClass}>
            Field service
          </Link>
          <Link href="/quote" className={linkClass}>
            Request a quote
          </Link>
          <Link href="/contact" className={linkClass}>
            Contact &amp; hours
          </Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 border-t border-ink-line px-6 py-5 text-[13px]">
        <span>© {new Date().getFullYear()} {SITE.legalName}</span>
        <span>{SITE.hours}</span>
      </div>
    </footer>
  );
}
