import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABELS } from "@/lib/admin/requests";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  new: "border-warn text-warn",
  received: "border-warn text-warn",
  won: "border-ok text-ok",
  delivered: "border-ok text-ok",
  closed: "border-edge-strong text-fg-muted",
  lost: "border-edge-strong text-fg-muted",
  spam: "border-edge-strong text-fg-muted",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[status] ?? "border-bold text-fg")}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Status filter tabs for an inbox list. */
export function InboxFilters({ base, current, statuses }: { base: string; current: string; statuses: readonly string[] }) {
  const tabs = [
    { value: "open", label: "Open" },
    ...statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })),
    { value: "all", label: "All" },
  ];
  return (
    <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.value === "open" ? base : `${base}?status=${t.value}`}
          aria-current={current === t.value ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold no-underline",
            current === t.value ? "border-bold bg-bold text-on-bold hover:text-on-bold" : "border-edge-strong text-fg hover:border-bold hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function InboxTable({ head, empty, children }: { head: string[]; empty: boolean; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-edge bg-surface">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-edge text-fg-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className="px-4 py-10 text-center text-fg-muted">Nothing here.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm font-semibold text-fg-muted sm:w-40">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? <span className="text-fg-muted">—</span>}</dd>
    </div>
  );
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(iso));
