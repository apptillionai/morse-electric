import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteStatus, ServiceStatus } from "@/lib/admin/requests";
import type { EquipmentType } from "@/lib/requests/schemas";

export interface MyServiceRequest {
  id: string;
  reference: string;
  status: ServiceStatus;
  equipment_type: EquipmentType;
  make: string | null;
  size: string | null;
  model_serial: string | null;
  symptoms: string;
  is_rush: boolean;
  created_at: string;
  updated_at: string;
}

export interface MyQuoteRequest {
  id: string;
  reference: string;
  status: QuoteStatus;
  product_sku: string | null;
  quantity: number | null;
  details: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The signed-in customer's own requests. RLS limits the rows to theirs; the
 * explicit customer filter keeps staff (who can read everything) to their own.
 */
export async function listMyRequests(supabase: SupabaseClient, customerId: string) {
  const [service, quotes] = await Promise.all([
    supabase
      .from("service_requests")
      .select("id, reference, status, equipment_type, make, size, model_serial, symptoms, is_rush, created_at, updated_at")
      .eq("customer_id", customerId)
      .neq("status", "spam")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("quote_requests")
      .select("id, reference, status, product_sku, quantity, details, created_at, updated_at")
      .eq("customer_id", customerId)
      .neq("status", "spam")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (service.error) throw new Error(`Service requests: ${service.error.message}`);
  if (quotes.error) throw new Error(`Quote requests: ${quotes.error.message}`);
  return { service: service.data as MyServiceRequest[], quotes: quotes.data as MyQuoteRequest[] };
}
