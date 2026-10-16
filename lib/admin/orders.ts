import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrder, OPEN_ORDER_STATUSES, ORDER_STATUSES, type Order, type OrderStatus } from "@/lib/orders/types";

/** Statuses staff filter by; "checkout" (not yet paid) is never listed. */
export const LISTED_ORDER_STATUSES = ORDER_STATUSES.filter((s) => s !== "checkout");

/**
 * The fulfilment steps staff can take from each status. Placing, cancelling
 * and refunding go through their own actions (they move stock and money).
 */
export const NEXT_STEPS: Partial<Record<OrderStatus, { ship: OrderStatus[]; pickup: OrderStatus[] }>> = {
  paid: { ship: ["processing", "shipped"], pickup: ["processing", "ready_for_pickup"] },
  processing: { ship: ["shipped"], pickup: ["ready_for_pickup"] },
  shipped: { ship: ["completed"], pickup: [] },
  ready_for_pickup: { ship: [], pickup: ["completed"] },
};

export type OrderListRow = Pick<Order, "id" | "reference" | "status" | "name" | "email" | "fulfillment" | "total_cents" | "created_at"> & {
  items: { count: number }[];
};

export async function listOrders(supabase: SupabaseClient, filter: string): Promise<OrderListRow[]> {
  let q = supabase
    .from("orders")
    .select("id, reference, status, name, email, fulfillment, total_cents, created_at, items:order_items(count)")
    .neq("status", "checkout")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "open") q = q.in("status", OPEN_ORDER_STATUSES);
  else if ((LISTED_ORDER_STATUSES as readonly string[]).includes(filter)) q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) throw new Error(`Orders: ${error.message}`);
  return data as OrderListRow[];
}

export async function getOrderForStaff(supabase: SupabaseClient, id: string) {
  const [order, notes] = await Promise.all([
    getOrder(supabase, { id }),
    supabase.from("order_notes").select("notes").eq("order_id", id).maybeSingle(),
  ]);
  return order ? { ...order, staff_notes: (notes.data?.notes as string | undefined) ?? "" } : null;
}

export async function orderCounts(supabase: SupabaseClient) {
  const count = (statuses: OrderStatus[]) =>
    supabase.from("orders").select("id", { count: "exact", head: true }).in("status", statuses);
  const [toFulfil, awaitingPayment, readyForPickup] = await Promise.all([
    count(["paid", "processing"]),
    count(["pending_payment"]),
    count(["ready_for_pickup"]),
  ]);
  for (const r of [toFulfil, awaitingPayment, readyForPickup]) if (r.error) throw new Error(`Order counts: ${r.error.message}`);
  return {
    toFulfil: toFulfil.count ?? 0,
    awaitingPayment: awaitingPayment.count ?? 0,
    readyForPickup: readyForPickup.count ?? 0,
  };
}
