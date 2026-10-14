import { Download, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/admin-shell";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { ADMIN_PAGE_SIZE, listProducts, type ProductListQuery } from "@/lib/admin/catalog";
import { PRODUCT_STATUSES } from "@/lib/admin/product-fields";
import { CONDITION_LABELS } from "@/lib/catalog/types";
import { cn, formatPrice } from "@/lib/utils";
import { staffClient } from "@/lib/admin/auth";

export const metadata = { title: "Products" };

const STATUS_STYLE: Record<string, string> = {
  active: "border-ok text-ok",
  draft: "border-warn text-warn",
  archived: "border-edge-strong text-fg-muted",
};

export default async function ProductsPage(props: PageProps<"/admin/products">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const query: ProductListQuery = {
    q: str("q") || null,
    status: (PRODUCT_STATUSES as readonly string[]).includes(str("status")) ? (str("status") as ProductListQuery["status"]) : "all",
    stock: str("stock") === "in" || str("stock") === "out" ? (str("stock") as "in" | "out") : "all",
    page: Math.max(1, Number(str("page")) || 1),
  };
  const { items, total } = await listProducts(await staffClient(), query);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const pageHref = (page: number) => {
    const p = new URLSearchParams();
    if (query.q) p.set("q", query.q);
    if (query.status !== "all") p.set("status", query.status);
    if (query.stock !== "all") p.set("stock", query.stock);
    if (page > 1) p.set("page", String(page));
    return `/admin/products${p.size ? `?${p}` : ""}`;
  };
  const deleted = str("deleted");

  return (
    <>
      <PageHeader
        title="Products"
        description={`${total} product${total === 1 ? "" : "s"}`}
        actions={
          <>
            <ButtonLink href="/admin/products/new" size="sm"><Plus size={16} aria-hidden="true" />Add product</ButtonLink>
            <ButtonLink href="/admin/import" variant="quiet" size="sm"><Upload size={16} aria-hidden="true" />Import CSV</ButtonLink>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download from a route handler, not a page */}
            <a href="/admin/products/export" className={buttonClasses({ variant: "quiet", size: "sm" })}><Download size={16} aria-hidden="true" />Export CSV</a>
          </>
        }
      />
      {deleted && <Notice>Deleted {deleted}.</Notice>}

      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-md border border-edge bg-surface p-4">
        <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-sm font-semibold">
          Search
          <input name="q" defaultValue={query.q ?? ""} placeholder="SKU, name or manufacturer part #" className="h-11 rounded border border-edge-strong bg-surface px-3 font-normal text-fg placeholder:text-fg-muted" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Status
          <select name="status" defaultValue={query.status} className="h-11 rounded border border-edge-strong bg-surface px-2.5 font-normal text-fg">
            <option value="all">All</option>
            {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Stock
          <select name="stock" defaultValue={query.stock} className="h-11 rounded border border-edge-strong bg-surface px-2.5 font-normal text-fg">
            <option value="all">All</option>
            <option value="in">In stock</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
        <button type="submit" className="h-11 rounded bg-bold px-5 font-semibold text-on-bold hover:bg-bold-hover">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-md border border-edge bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-edge text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Product</th>
              <th scope="col" className="px-4 py-3 font-semibold">Category</th>
              <th scope="col" className="px-4 py-3 font-semibold">Condition</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Price</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Qty</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-edge-soft last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/products/${p.id}`} className="font-semibold">{p.values.name}</Link>
                  <div className="font-mono text-xs text-fg-muted">{p.sku}</div>
                </td>
                <td className="px-4 py-3">{p.categoryName}</td>
                <td className="px-4 py-3">{CONDITION_LABELS[p.values.condition]}</td>
                <td className="px-4 py-3 text-right">{formatPrice(p.values.price_cents) ?? <span className="text-fg-muted">On request</span>}</td>
                <td className={cn("px-4 py-3 text-right font-semibold", !p.inStock && "text-warn")}>{p.values.qty ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[p.values.status])}>{p.values.status}</span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-fg-muted">
                  No products match. <Link href="/admin/products/new">Add one</Link> or <Link href="/admin/import">import a spreadsheet</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          {query.page > 1 ? <Link href={pageHref(query.page - 1)}>← Previous</Link> : <span />}
          <span className="text-fg-muted">Page {query.page} of {pages}</span>
          {query.page < pages ? <Link href={pageHref(query.page + 1)}>Next →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
