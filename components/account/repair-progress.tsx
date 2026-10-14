import { Check } from "lucide-react";
import type { ServiceStatus } from "@/lib/admin/requests";
import { REPAIR_STEPS, repairStep } from "@/lib/customers/status";
import { cn } from "@/lib/utils";

/** Repair stages as a step list: done, current, still to come. */
export function RepairProgress({ status }: { status: ServiceStatus }) {
  const current = repairStep(status);
  const finished = status === "delivered" || status === "closed";
  return (
    <ol className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6" aria-label="Repair progress">
      {REPAIR_STEPS.map((step, i) => {
        const done = i < current || (finished && i === current);
        const active = i === current && !finished;
        return (
          <li key={step.key} className="flex flex-col gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "h-1.5 rounded-full",
                done ? "bg-ok" : active ? "bg-accent" : "bg-edge",
              )}
              aria-hidden="true"
            />
            <span className={cn("flex items-center gap-1 text-xs font-semibold", done || active ? "text-fg" : "text-fg-muted")}>
              {done && <Check size={12} aria-hidden="true" />}
              {step.label}
              <span className="sr-only">{done ? " (done)" : active ? " (current)" : " (not started)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
