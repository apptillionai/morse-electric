import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { QuoteRequestInput, ServiceRequestInput } from "./schemas";

/** Insert a quote request and return its customer-facing reference (Q-1001…). */
export async function insertQuoteRequest(
  input: QuoteRequestInput,
  context: { productId: string | null; sourcePath: string | null },
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("quote_requests")
    .insert({
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone,
      product_id: context.productId,
      product_sku: input.sku,
      quantity: input.quantity,
      details: input.details,
      source_path: context.sourcePath,
    })
    .select("reference")
    .single();
  if (error) throw new Error(`Quote request insert failed: ${error.message}`);
  return data.reference as string;
}

/** Insert a service request and return its job reference (SR-1001…). */
export async function insertServiceRequest(
  input: ServiceRequestInput,
  context: { sourcePath: string | null },
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("service_requests")
    .insert({
      equipment_type: input.equipmentType,
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone,
      make: input.make,
      size: input.size,
      model_serial: input.modelSerial,
      symptoms: input.symptoms,
      wants_pickup: input.wantsPickup,
      is_rush: input.isRush,
      wants_replacement_quote: input.wantsReplacementQuote,
      source_path: context.sourcePath,
    })
    .select("reference")
    .single();
  if (error) throw new Error(`Service request insert failed: ${error.message}`);
  return data.reference as string;
}
