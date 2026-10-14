"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "@/lib/site";
import { cn } from "@/lib/utils";

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-x-6 gap-y-1 text-[15px] font-medium">
      {NAV_LINKS.map(({ href, label }) => {
        const base = href.split("#")[0];
        const current = !href.includes("#") && (pathname === base || pathname.startsWith(`${base}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "py-2.5 no-underline",
              current ? "text-accent-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-fg hover:text-accent-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
