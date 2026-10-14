import { AlertTriangle, ClipboardList, FileUp, Package, Wrench } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/admin-shell";
import { dashboardCounts } from "@/lib/admin/requests";
import { staffClient } from "@/lib/admin/auth";

export const metadata = { title: "Dashboard" };

function Tile({ href, label, value, note, icon: Icon, tone }: { href: string; label: string; value: number; note?: string; icon: typeof Package; tone?: "warn" }) {
  return (
    <Link href={href} className="flex flex-col gap-2 rounded-md border border-edge bg-surface p-5 text-fg no-underline hover:border-bold hover:text-fg">
      <span className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
        <Icon size={16} aria-hidden="true" />
        {label}
      </span>
      <span className={`font-display text-5xl font-bold ${tone === "warn" && value > 0 ? "text-warn" : ""}`}>{value}</span>
      {note && <span className="text-sm text-fg-muted">{note}</span>}
    </Link>
  );
}

export default async function DashboardPage() {
  const counts = await dashboardCounts(await staffClient());
  return (
    <>
      <PageHeader title="Dashboard" description="What needs attention today." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Tile href="/admin/quotes" label="New quote requests" value={counts.newQuotes} icon={ClipboardList} tone="warn" />
        <Tile href="/admin/service" label="Open service jobs" value={counts.openService} note={counts.rushService ? `${counts.rushService} marked rush` : undefined} icon={Wrench} tone="warn" />
        <Tile href="/admin/products?status=active" label="Active products" value={counts.activeProducts} note={counts.drafts ? `${counts.drafts} drafts` : undefined} icon={Package} />
        <Tile href="/admin/products?status=active&stock=out" label="Out of stock" value={counts.outOfStock} icon={AlertTriangle} tone="warn" />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/products/new" className="font-semibold">Add a product</Link>
        <span aria-hidden="true" className="text-fg-muted">·</span>
        <Link href="/admin/import" className="inline-flex items-center gap-1.5 font-semibold">
          <FileUp size={16} aria-hidden="true" />
          Import a parts spreadsheet
        </Link>
      </div>
    </>
  );
}
