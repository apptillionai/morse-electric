import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductCondition } from "@/lib/catalog/types";

export const ORDER_STATUSES = [
  "checkout", "pending_payment", "invoiced", "paid", "processing", "shipped", "ready_for_pickup", "completed", "cancelled", "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  checkout: "In checkout",
  pending_payment: "Awaiting bank payment",
  invoiced: "Charged to account",
  paid: "Paid",
  processing: "Being prepared",
  shipped: "Shipped",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Orders staff still have to act on. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ["pending_payment", "invoiced", "paid", "processing", "ready_for_pickup"];

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  open: "Invoice open",
  paid: "Invoice paid",
  void: "Invoice voided",
  uncollectible: "Invoice marked uncollectible",
};

export interface OrderItem {
  id: string;
  product_id: string | null;
  sku: string;
  name: string;
  condition: ProductCondition;
  unit_price_cents: number;
  /** Per unit; 0 when the item carries no core. */
  core_charge_cents: number;
  quantity: number;
  sort_order: number;
}

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  customer_id: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  fulfillment: "ship" | "pickup";
  ship_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal: string | null;
  ship_country: string | null;
  subtotal_cents: number;
  core_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_method: "card" | "ach" | "net30" | "other" | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  /** Net-30 orders: the Stripe invoice. */
  stripe_invoice_id: string | null;
  invoice_url: string | null;
  invoice_status: "open" | "paid" | "void" | "uncollectible" | null;
  invoice_due_date: string | null;
  invoice_paid_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  cancel_reason: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const CORE_STATUSES = ["awaiting", "received", "credited", "rejected", "cancelled"] as const;
export type CoreStatus = (typeof CORE_STATUSES)[number];

export const CORE_STATUS_LABELS: Record<CoreStatus, string> = {
  awaiting: "Waiting for your old unit",
  received: "Received, being inspected",
  credited: "Refunded",
  rejected: "Not accepted",
  cancelled: "Not needed (order cancelled)",
};

export interface CoreReturn {
  id: string;
  order_id: string;
  order_item_id: string;
  status: CoreStatus;
  quantity: number;
  core_charge_cents: number;
  due_date: string;
  received_at: string | null;
  credited_at: string | null;
  credit_cents: number | null;
  stripe_refund_id: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
  cores: CoreReturn[];
}

/** "Mar 3, 2027" for a due date stored as YYYY-MM-DD. */
export function formatDueDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** Ship-to address as display lines, or null for pickup. */
export function shippingLines(order: Order): string[] | null {
  if (order.fulfillment !== "ship" || !order.ship_line1) return null;
  const cityLine = [order.ship_city, [order.ship_state, order.ship_postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [order.ship_name, order.ship_line1, order.ship_line2, cityLine].filter((l): l is string => Boolean(l));
}

/** One order with its items. RLS decides who may read it; staff and the service role see all. */
export async function getOrder(
  supabase: SupabaseClient,
  by: { id: string } | { reference: string } | { sessionId: string },
): Promise<OrderWithItems | null> {
  let query = supabase.from("orders").select("*, items:order_items(*), cores:core_returns(*)");
  if ("id" in by) query = query.eq("id", by.id);
  else if ("reference" in by) query = query.eq("reference", by.reference);
  else query = query.eq("stripe_checkout_session_id", by.sessionId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Order: ${error.message}`);
  if (!data) return null;
  const order = data as OrderWithItems;
  return {
    ...order,
    items: [...(order.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    cores: order.cores ?? [],
  };
}
