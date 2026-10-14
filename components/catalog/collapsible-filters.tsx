"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Filters stay open on desktop; on small screens they sit behind a toggle so results come first. */
export function CollapsibleFilters({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full lg:w-72 lg:flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="catalog-filters"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded border border-ink bg-white font-semibold lg:hidden"
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
        {open ? "Hide filters" : "Filters"}
        {activeCount > 0 && ` (${activeCount})`}
      </button>
      <div id="catalog-filters" className={cn("mt-3 lg:mt-0 lg:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  );
}
