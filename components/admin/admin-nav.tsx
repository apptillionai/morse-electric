"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/import", label: "Import CSV" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/service", label: "Service" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-x-1 gap-y-1">
      {LINKS.map((link) => {
        const current = "exact" in link ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded px-3 py-2 text-sm font-semibold no-underline",
              current ? "bg-on-inverse text-inverse hover:text-inverse" : "text-on-inverse-muted hover:text-on-inverse",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
