import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductCondition } from "@/lib/catalog/types";

export const ORDER_STATUSES = [
  "checkout", "pending_payment", "paid", "processing", "shipped", "ready_for_pickup", "completed", "cancelled", "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  checkout: "In checkout",
  pending_payment: "Awaiting bank payment",
  paid: "Paid",
  processing: "Being prepared",
  shipped: "Shipped",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Orders staff still have to act on. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ["pending_payment", "paid", "processing", "ready_for_pickup"];

export interface OrderItem {
  id: string;
  product_id: string | null;
  sku: string;
  name: string;
  condition: ProductCondition;
  unit_price_cents: number;
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
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_method: "card" | "ach" | "net30" | "other" | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  cancel_reason: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
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
  let query = supabase.from("orders").select("*, items:order_items(*)");
  if ("id" in by) query = query.eq("id", by.id);
  else if ("reference" in by) query = query.eq("reference", by.reference);
  else query = query.eq("stripe_checkout_session_id", by.sessionId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Order: ${error.message}`);
  if (!data) return null;
  const order = data as OrderWithItems;
  return { ...order, items: [...(order.items ?? [])].sort((a, b) => a.sort_order - b.sort_order) };
}
