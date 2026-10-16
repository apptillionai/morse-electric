import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreReturn, Order, OrderItem } from "@/lib/orders/types";
import { shopToday } from "@/lib/orders/reminders";

export const CORE_FILTERS = ["open", "overdue", "received", "credited", "rejected", "all"] as const;
export type CoreFilter = (typeof CORE_FILTERS)[number];

export const CORE_FILTER_LABELS: Record<CoreFilter, string> = {
  open: "Open",
  overdue: "Overdue",
  received: "To inspect",
  credited: "Refunded",
  rejected: "Rejected",
  all: "All",
};

export type CoreRow = CoreReturn & {
  order: Pick<Order, "id" | "reference" | "name" | "email" | "status" | "stripe_payment_intent_id" | "stripe_invoice_id"> | null;
  item: Pick<OrderItem, "name" | "sku"> | null;
};

export async function listCores(supabase: SupabaseClient, filter: string): Promise<CoreRow[]> {
  let q = supabase
    .from("core_returns")
    .select("*, order:orders(id, reference, name, email, status, stripe_payment_intent_id, stripe_invoice_id), item:order_items(name, sku)")
    .order("due_date", { ascending: true })
    .limit(300);
  if (filter === "open" || !(CORE_FILTERS as readonly string[]).includes(filter)) q = q.in("status", ["awaiting", "received"]);
  else if (filter === "overdue") q = q.eq("status", "awaiting").lt("due_date", shopToday());
  else if (filter !== "all") q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) throw new Error(`Core returns: ${error.message}`);
  return data as CoreRow[];
}

export async function getCore(supabase: SupabaseClient, id: string): Promise<CoreRow | null> {
  const { data, error } = await supabase
    .from("core_returns")
    .select("*, order:orders(id, reference, name, email, status, stripe_payment_intent_id, stripe_invoice_id), item:order_items(name, sku)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Core return: ${error.message}`);
  return data as CoreRow | null;
}

export async function coreCounts(supabase: SupabaseClient) {
  const [overdue, toInspect] = await Promise.all([
    supabase.from("core_returns").select("id", { count: "exact", head: true }).eq("status", "awaiting").lt("due_date", shopToday()),
    supabase.from("core_returns").select("id", { count: "exact", head: true }).eq("status", "received"),
  ]);
  for (const r of [overdue, toInspect]) if (r.error) throw new Error(`Core counts: ${r.error.message}`);
  return { overdue: overdue.count ?? 0, toInspect: toInspect.count ?? 0 };
}
