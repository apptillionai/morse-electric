import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Equipment, EquipmentJob } from "./equipment";

export interface EquipmentWithJobs extends Equipment {
  jobs: EquipmentJob[];
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

/**
 * One customer's equipment with each unit's repair jobs, newest first. Read
 * through the caller's session: customers get only their own (RLS), and the
 * explicit filter keeps staff to the customer they're looking at.
 */
export async function listEquipment(supabase: SupabaseClient, customerId: string): Promise<EquipmentWithJobs[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select("*, jobs:service_requests(id, reference, status, symptoms, created_at)")
    .eq("customer_id", customerId)
    .order("label");
  if (error) throw new Error(`Equipment: ${error.message}`);
  return (data as (EquipmentWithJobs & { hp: number | string | null })[]).map((row) => ({
    ...row,
    hp: num(row.hp),
    jobs: [...(row.jobs ?? [])].filter((j) => j.status !== "spam").sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
}
