import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/catalog/category-icon";
import { DemoCatalogBanner } from "@/components/catalog/demo-banner";
import { ProductCard } from "@/components/catalog/product-card";
import { PhoneLink } from "@/components/site/site-header";
import { ButtonLink } from "@/components/ui/button";
import { getCatalog } from "@/lib/catalog";
import { POWER_LABELS, POWER_SUPPLIES } from "@/lib/catalog/types";
import { RPM_BANDS, type RpmBand } from "@/lib/catalog/filters";
import { getBusiness } from "@/lib/site-settings";

// Prerendered, then refreshed so stock and featured items stay current.
export const revalidate = 300;

export const metadata: Metadata = { alternates: { canonical: "/" } };

const repairSteps = (serviceArea: string) => [
  ["Drop off or schedule pickup", `Bring it in, or our truck collects it from your site within ${serviceArea}.`],
  ["Teardown & inspection", "Winding tests, bearing and shaft checks, and photos of every finding."],
  ["Approve a quote", "Repair or replace, side by side. Approve by phone, email or PO number."],
  ["Rebuild, rewind & load test", "New bearings, varnish, dynamic balancing and a full run-in test."],
  ["Back to you, under warranty", "Delivered and documented, with our shop warranty."],
] as const;

const SERVICES = [
  ["Motor rewinding", "AC and DC rewinds to original or upgraded insulation class.", "/service#request"],
  ["Pump & blower repair", "Seals, impellers, bearings, machining and performance testing.", "/service#request"],
  ["Vacuum pump rebuilds", "Vanes, seals, oil service and vacuum-level testing.", "/service#request"],
  ["Starter & alternator repair", "Bench-tested rebuilds for automotive, ag and heavy equipment.", "/service#request"],
  ["Field service & installation", "On-site removal, installation, laser alignment and startup.", "/service#field"],
  ["Predictive maintenance", "Vibration analysis, thermography and motor circuit testing.", "/service#field"],
] as const;

const INDUSTRIES = [
  "Water & wastewater",
  "Agriculture & irrigation",
  "Manufacturing",
  "HVAC & building services",
  "Food & beverage",
  "Trucking & fleet",
  "Marine",
  "Oil & gas",
];

const fieldClass = "h-11 w-full rounded border border-edge-strong bg-surface px-3 text-[15px] font-normal";

export default async function HomePage() {
  const business = await getBusiness();
  const catalog = getCatalog();
  const [categories, featured] = await Promise.all([catalog.listCategories(), catalog.getFeatured(4)]);

  return (
    <>
      <DemoCatalogBanner show={catalog.isDemo} />

      {/* Hero */}
      <section className="bg-inverse text-on-inverse">
        <div className="mx-auto flex max-w-7xl flex-wrap items-stretch gap-12 px-6 pt-18 pb-16">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col justify-center gap-6">
            <span className="eyebrow text-on-inverse-accent">Sales · Repair · Rewind · Field service</span>
            <h1 className="display text-[clamp(44px,6vw,80px)] leading-[0.95]">
              Motors, pumps &amp; blowers: sold, rebuilt and back on line fast.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-on-inverse-muted">
              New and remanufactured electric motors, pumps, blowers, vacuum pumps, starters and alternators, in stock
              and ready to go, or repaired in our shop.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/shop" size="lg">Shop motors &amp; parts</ButtonLink>
              <ButtonLink href="/service#request" variant="outline-light" size="lg">Get a repair quote</ButtonLink>
            </div>
          </div>

          {/* Part finder: a GET form into the filtered shop. */}
          <form action="/shop" className="flex min-w-0 flex-[1_1_400px] flex-col gap-4 rounded-md bg-surface p-7 text-fg">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-[28px]">Find a replacement</h2>
              <span className="text-[13px] text-fg-muted">Match by nameplate</span>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-semibold">
                Equipment type
                <select name="category" className={fieldClass} defaultValue="electric-motors">
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                Horsepower
                <input name="hp" inputMode="decimal" placeholder="e.g. 5" className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                RPM
                <select name="rpm" className={fieldClass} defaultValue="">
                  <option value="">Any</option>
                  {(Object.keys(RPM_BANDS) as RpmBand[]).map((r) => (
                    <option key={r} value={r}>{RPM_BANDS[r].label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                Frame
                <input name="frame" placeholder="e.g. 184T" className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                Power
                <select name="power" className={fieldClass} defaultValue="">
                  <option value="">Any</option>
                  {POWER_SUPPLIES.map((p) => (
                    <option key={p} value={p}>{POWER_LABELS[p]}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="h-12 rounded bg-bold font-semibold text-on-bold hover:bg-bold-hover">
              Show matching parts
            </button>
            <p className="text-[13px] text-fg-muted">
              Can’t read the nameplate? <Link href="/quote">Send us the details</Link> and we’ll identify it.
            </p>
          </form>
        </div>
      </section>

      {/* Product lines */}
      <section className="mx-auto max-w-7xl px-6 pt-20 pb-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">What we sell &amp; service</span>
            <h2 className="display text-5xl">Six product lines. One shop.</h2>
          </div>
          <Link href="/shop" className="font-semibold">Browse the full catalog →</Link>
        </div>
        <div className="grid gap-px overflow-hidden rounded-md border border-edge bg-edge sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div key={c.slug} className="flex flex-col gap-3.5 bg-surface p-7">
              <CategoryIcon slug={c.slug} className="text-accent-ink" />
              <h3 className="display text-[28px]">{c.name}</h3>
              <p className="leading-normal text-fg-muted">{c.description}</p>
              <div className="mt-auto flex gap-5 font-semibold">
                <Link href={`/shop/${c.slug}`}>Shop {c.name.toLowerCase()}</Link>
                <Link href="/service#request">Repair</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* In stock */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 pt-10 pb-20">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="eyebrow">In stock</span>
              <h2 className="display text-5xl">Ready on the shelf</h2>
            </div>
            <Link href="/shop?in_stock=1" className="font-semibold">See all in-stock items →</Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Repair or replace */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-12 px-6 py-20">
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
            <span className="eyebrow">Repair or replace?</span>
            <h2 className="display text-5xl">We’ll tell you which costs less.</h2>
            <p className="text-[17px] leading-relaxed text-fg-muted">
              Every unit that comes through our door gets a teardown report and a side-by-side quote: repair it, or
              replace it with a new or remanufactured unit from stock. You decide.
            </p>
            <div className="photo-placeholder flex h-64 items-center justify-center rounded-md text-[13px] text-fg-muted">
              Photo: technician on the motor test stand
            </div>
          </div>
          <ol className="flex min-w-0 flex-[1_1_520px] flex-col">
            {repairSteps(business.serviceArea).map(([title, body], i) => (
              <li key={title} className="flex gap-5 border-b border-edge py-5 last:border-b-0">
                <span className="display w-12 flex-none text-[40px] text-accent-ink" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-1">
                  <strong className="text-lg">{title}</strong>
                  <span className="leading-normal text-fg-muted">{body}</span>
                </div>
              </li>
            ))}
            <li className="pt-3">
              <ButtonLink href="/service#request">Start a repair request</ButtonLink>
            </li>
          </ol>
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-8 flex flex-col gap-2">
          <span className="eyebrow">Shop &amp; field services</span>
          <h2 className="display text-5xl">Keep the line running</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
          {SERVICES.map(([title, body, href]) => (
            <Link
              key={title}
              href={href}
              className="flex flex-col gap-2 rounded-md border border-edge bg-surface p-6 text-fg no-underline hover:border-bold hover:text-fg"
            >
              <strong className="text-lg">{title}</strong>
              <span className="leading-normal text-fg-muted">{body}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Industries */}
      <section className="bg-inverse text-on-inverse">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 px-6 py-18">
          <h2 className="display text-[40px]">Industries we keep moving</h2>
          <ul className="flex flex-wrap gap-3">
            {INDUSTRIES.map((name) => (
              <li key={name} className="rounded-full border border-inverse-edge px-5 py-3 font-medium">{name}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Emergency */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-md border border-edge bg-surface p-10">
          <div className="flex flex-[1_1_420px] flex-col gap-2.5">
            <h2 className="display text-[44px]">Motor down right now?</h2>
            <p className="text-[17px] leading-normal text-fg-muted">
              Our emergency line is answered around the clock: <PhoneLink className="font-semibold" />. We’ll check
              stock for a replacement while we schedule your repair.
            </p>
          </div>
          <ButtonLink href="/service#request" variant="outline" size="lg">Request service online</ButtonLink>
        </div>
      </section>
    </>
  );
}
