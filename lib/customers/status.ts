import type { QuoteStatus, ServiceStatus } from "@/lib/admin/requests";

/** The repair stages a customer sees, in order. */
export const REPAIR_STEPS = [
  { key: "received", label: "Received" },
  { key: "inspect", label: "Inspection" },
  { key: "quote", label: "Quote" },
  { key: "repair", label: "Repair" },
  { key: "test", label: "Testing" },
  { key: "ready", label: "Ready" },
] as const;

const STEP_OF: Record<ServiceStatus, number> = {
  received: 0,
  teardown: 1,
  quoted: 2,
  approved: 3,
  in_repair: 3,
  testing: 4,
  ready: 5,
  delivered: 5,
  closed: 5,
  spam: -1,
};

/** Index of the current step in REPAIR_STEPS, or -1 for requests hidden from customers. */
export function repairStep(status: ServiceStatus): number {
  return STEP_OF[status];
}

export const SERVICE_STATUS_MESSAGE: Record<ServiceStatus, string> = {
  received: "We’ve received your request and will be in touch to arrange drop-off or pickup.",
  teardown: "Your unit is in the shop and being inspected.",
  quoted: "We’ve sent you a repair quote. Reply or call us to approve it.",
  approved: "Quote approved. Your repair is scheduled.",
  in_repair: "Your unit is being repaired.",
  testing: "Repair done. We’re testing it under load.",
  ready: "Ready for pickup or delivery.",
  delivered: "Delivered. Thanks for your business.",
  closed: "This job is closed.",
  spam: "",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  new: "Received",
  quoted: "Quote sent",
  won: "Ordered",
  lost: "Closed",
  spam: "",
};

/** Customers never see requests staff marked as spam. */
export const isVisibleToCustomer = (status: string) => status !== "spam";
