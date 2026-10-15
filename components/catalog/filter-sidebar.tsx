import Link from "next/link";
import { RPM_BANDS, shopHref, type CatalogFilters, type RpmBand } from "@/lib/catalog/filters";
import {
  CONDITION_LABELS,
  ENCLOSURE_LABELS,
  ENCLOSURES,
  POWER_LABELS,
  POWER_SUPPLIES,
  PRODUCT_CONDITIONS,
  type Brand,
} from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { CollapsibleFilters } from "./collapsible-filters";

const fieldset = "m-0 flex flex-col gap-2 border-0 p-0";
const legend = "mb-2 font-semibold";
const check = "size-[18px] accent-fg";
const input = "h-10 w-0 min-w-0 flex-1 rounded border border-edge-strong bg-surface px-2.5";

/**
 * Plain GET form: filtering works without JavaScript and every result set has
 * a shareable URL. The category lives in the action path.
 */
export function FilterSidebar({ filters, brands }: { filters: CatalogFilters; brands: Brand[] }) {
  const action = filters.category ? `/shop/${filters.category}` : "/shop";
  return (
    <CollapsibleFilters activeCount={activeFilterCount(filters)}>
      <aside aria-label="Filters" className="rounded-md border border-edge bg-surface p-5">
        <form action={action} className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="display text-[22px]">Filter</h2>
            <Link href={shopHref({ ...filters, q: null }, clearAll)} className="text-sm">
              Clear all
            </Link>
          </div>
          {filters.q && <input type="hidden" name="q" value={filters.q} />}
          {filters.sort !== "featured" && <input type="hidden" name="sort" value={filters.sort} />}

          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 font-semibold">
            <input type="checkbox" name="in_stock" value="1" defaultChecked={filters.inStock} className="size-5 accent-fg" />
            In stock only
          </label>

          <fieldset className={fieldset}>
            <legend className={legend}>Condition</legend>
            {PRODUCT_CONDITIONS.map((c) => (
              <label key={c} className="flex items-center gap-2.5">
                <input type="checkbox" name="condition" value={c} defaultChecked={filters.conditions.includes(c)} className={check} />
                {CONDITION_LABELS[c]}
              </label>
            ))}
          </fieldset>

          <fieldset className={fieldset}>
            <legend className={legend}>Horsepower</legend>
            <div className="flex items-center gap-2">
              <label htmlFor="hp_min" className="sr-only">Minimum horsepower</label>
              <input id="hp_min" name="hp_min" inputMode="decimal" placeholder="Min" defaultValue={filters.hpMin ?? ""} className={input} />
              <span aria-hidden="true">–</span>
              <label htmlFor="hp_max" className="sr-only">Maximum horsepower</label>
              <input id="hp_max" name="hp_max" inputMode="decimal" placeholder="Max" defaultValue={filters.hpMax ?? ""} className={input} />
            </div>
          </fieldset>

          <fieldset className={fieldset}>
            <legend className={legend}>Speed (RPM)</legend>
            {(Object.keys(RPM_BANDS) as RpmBand[]).map((r) => (
              <label key={r} className="flex items-center gap-2.5">
                <input type="checkbox" name="rpm" value={r} defaultChecked={filters.rpm.includes(r)} className={check} />
                {RPM_BANDS[r].label}
              </label>
            ))}
          </fieldset>

          <fieldset className={fieldset}>
            <legend className={legend}>Enclosure</legend>
            {ENCLOSURES.filter((e) => e !== "other").map((e) => (
              <label key={e} className="flex items-center gap-2.5">
                <input type="checkbox" name="enclosure" value={e} defaultChecked={filters.enclosures.includes(e)} className={check} />
                {ENCLOSURE_LABELS[e]}
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1.5 font-semibold">
            Power
            <select name="power" defaultValue={filters.power ?? ""} className="h-11 rounded border border-edge-strong bg-surface px-2.5 font-normal">
              <option value="">Any</option>
              {POWER_SUPPLIES.map((p) => (
                <option key={p} value={p}>{POWER_LABELS[p]}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 font-semibold">
            Frame
            <input name="frame" placeholder="e.g. 184T" defaultValue={filters.frame ?? ""} className="h-11 rounded border border-edge-strong bg-surface px-3 font-normal" />
          </label>

          {brands.length > 0 && (
            <label className="flex flex-col gap-1.5 font-semibold">
              Brand
              <select name="brand" defaultValue={filters.brand ?? ""} className="h-11 rounded border border-edge-strong bg-surface px-2.5 font-normal">
                <option value="">All brands</option>
                {brands.map((b) => (
                  <option key={b.slug} value={b.slug}>{b.name}</option>
                ))}
              </select>
            </label>
          )}

          <Button type="submit" variant="dark">Apply filters</Button>
        </form>
      </aside>
    </CollapsibleFilters>
  );
}

function activeFilterCount(f: CatalogFilters): number {
  return (
    f.conditions.length +
    f.rpm.length +
    f.enclosures.length +
    [f.inStock, f.hpMin !== null || f.hpMax !== null, f.power, f.frame, f.brand].filter(Boolean).length
  );
}

const clearAll: Partial<CatalogFilters> = {
  conditions: [],
  inStock: false,
  hpMin: null,
  hpMax: null,
  rpm: [],
  enclosures: [],
  power: null,
  frame: null,
  brand: null,
  sort: "featured",
};
