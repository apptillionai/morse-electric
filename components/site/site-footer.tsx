import Link from "next/link";
import { SEED_CATEGORIES } from "@/lib/catalog/seed";
import { SITE } from "@/lib/site";
import { getBusiness } from "@/lib/site-settings";
import { PhoneLink } from "./site-header";

const linkClass = "text-on-inverse-muted no-underline hover:text-on-inverse";

export async function SiteFooter() {
  const business = await getBusiness();
  return (
    <footer className="bg-inverse text-sm text-on-inverse-muted">
      <div className="mx-auto grid max-w-7xl grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8 px-6 pt-14 pb-8">
        <div className="flex flex-col gap-2.5">
          <span className="font-display text-[26px] font-bold tracking-[0.04em] text-on-inverse">
            MORSE ELECTRIC MOTOR CO.
          </span>
          <span>
            {business.street}
            <br />
            {business.cityStateZip}
          </span>
          <span>
            <PhoneLink className="text-on-inverse-muted" /> ·{" "}
            {business.emailHref ? (
              <a href={business.emailHref} className={linkClass}>{business.email}</a>
            ) : (
              business.email
            )}
          </span>
        </div>
        <nav aria-label="Shop" className="flex flex-col gap-2.5">
          <strong className="text-on-inverse">Shop</strong>
          {SEED_CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/shop/${c.slug}`} className={linkClass}>
              {c.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Service" className="flex flex-col gap-2.5">
          <strong className="text-on-inverse">Service</strong>
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
      <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 border-t border-inverse-edge px-6 py-5 text-[13px]">
        <span>
          © {new Date().getFullYear()} {SITE.legalName}, a subsidiary of {SITE.parentCompany}
        </span>
        <span>{business.hours}</span>
      </div>
    </footer>
  );
}
