import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_TYPES, type PhotoUpload } from "./photos";
import type { QuoteRequestInput, ServiceRequestInput } from "./schemas";

export interface StoredRequest {
  id: string;
  /** Customer-facing reference: Q-1001, SR-1001… */
  reference: string;
}

/** Insert a quote request. */
export async function insertQuoteRequest(
  input: QuoteRequestInput,
  context: { productId: string | null; sourcePath: string | null; customerId: string | null },
): Promise<StoredRequest> {
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
      customer_id: context.customerId,
    })
    .select("id, reference")
    .single();
  if (error) throw new Error(`Quote request insert failed: ${error.message}`);
  return data as StoredRequest;
}

/** Insert a service request. */
export async function insertServiceRequest(
  input: ServiceRequestInput,
  context: { sourcePath: string | null; customerId: string | null; equipmentId?: string | null },
): Promise<StoredRequest> {
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
      customer_id: context.customerId,
      equipment_id: context.equipmentId ?? null,
    })
    .select("id, reference")
    .single();
  if (error) throw new Error(`Service request insert failed: ${error.message}`);
  return data as StoredRequest;
}

/**
 * Store photos for a request that is already saved. Returns how many were
 * stored. Never throws: a storage hiccup must not turn a saved request into
 * an error, so failures are logged and the rest carry on.
 */
export async function storeRequestPhotos(
  kind: "quote" | "service",
  request: StoredRequest,
  photos: PhotoUpload[],
): Promise<number> {
  const supabase = createAdminClient();
  let stored = 0;
  for (const [index, photo] of photos.entries()) {
    const path = `${kind}/${request.id}/${randomUUID()}.${PHOTO_TYPES[photo.type]}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("request-photos")
        .upload(path, photo.bytes, { contentType: photo.type });
      if (uploadError) throw new Error(uploadError.message);
      const { error } = await supabase.from("request_photos").insert({
        [kind === "quote" ? "quote_request_id" : "service_request_id"]: request.id,
        storage_path: path,
        content_type: photo.type,
        size_bytes: photo.bytes.length,
        file_name: photo.name.slice(0, 200) || null,
        sort_order: index,
      });
      if (error) {
        await supabase.storage.from("request-photos").remove([path]);
        throw new Error(error.message);
      }
      stored++;
    } catch (error) {
      console.error(`[photos] ${request.reference} photo ${index + 1}:`, error instanceof Error ? error.message : error);
    }
  }
  return stored;
}
