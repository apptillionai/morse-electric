import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

export function RequestReceived({ title, reference, children }: { title: string; reference?: string; children: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-start gap-3.5 py-6">
      <CircleCheck size={48} className="text-ok" aria-hidden="true" />
      <h3 className="display text-[34px]">{title}</h3>
      {reference && reference !== "received" && (
        <p className="text-fg-muted">
          Your reference number is <strong className="font-mono text-fg">{reference}</strong>.
        </p>
      )}
      <div className="max-w-xl leading-relaxed text-fg-muted">{children}</div>
    </div>
  );
}
