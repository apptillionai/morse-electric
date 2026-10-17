import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ORDER_STATUS_LABELS } from "@/lib/orders/types";
import type { EquipmentType } from "@/lib/requests/schemas";

export const QUOTE_STATUSES = ["new", "quoted", "won", "lost", "spam"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const SERVICE_STATUSES = [
  "received", "teardown", "quoted", "declined", "approved", "in_repair", "testing", "ready", "delivered", "closed", "spam",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/** Statuses that still need someone's attention. */
export const OPEN_QUOTE: QuoteStatus[] = ["new"];
export const OPEN_SERVICE: ServiceStatus[] = ["received", "teardown", "quoted", "declined", "approved", "in_repair", "testing", "ready"];

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
  spam: "Spam",
  received: "Received",
  teardown: "Teardown",
  approved: "Approved",
  declined: "Quote declined",
  in_repair: "In repair",
  testing: "Testing",
  ready: "Ready",
  delivered: "Delivered",
  closed: "Closed",
  ...ORDER_STATUS_LABELS,
};

export interface QuoteRequest {
  id: string;
  reference: string;
  status: QuoteStatus;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  product_sku: string | null;
  product_id: string | null;
  quantity: number | null;
  details: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequest {
  id: string;
  reference: string;
  status: ServiceStatus;
  equipment_type: EquipmentType;
  name: string;
  company: string | null;
  email: string;
  phone: string;
  make: string | null;
  size: string | null;
  model_serial: string | null;
  symptoms: string;
  wants_pickup: boolean;
  is_rush: boolean;
  wants_replacement_quote: boolean;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestPhoto {
  url: string;
  name: string;
  /** Browsers other than Safari can't show HEIC, so those are offered as downloads. */
  previewable: boolean;
}

interface PhotoRow {
  storage_path: string;
  content_type: string;
  file_name: string | null;
  sort_order: number;
}

/** Short-lived links to a request's photos (the bucket is private). */
async function photoLinks(supabase: SupabaseClient, rows: PhotoRow[] | null): Promise<RequestPhoto[]> {
  if (!rows?.length) return [];
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const { data, error } = await supabase.storage.from("request-photos").createSignedUrls(
    sorted.map((r) => r.storage_path),
    3600,
  );
  if (error) throw new Error(`Request photos: ${error.message}`);
  return sorted.flatMap((row, i) => {
    const url = data[i]?.signedUrl;
    return url
      ? [{ url, name: row.file_name ?? `Photo ${i + 1}`, previewable: row.content_type !== "image/heic" }]
      : [];
  });
}

const PHOTO_COLUMNS = "photos:request_photos(storage_path, content_type, file_name, sort_order)";

export type InboxFilter = "open" | "all" | string;

export async function listQuotes(supabase: SupabaseClient, filter: InboxFilter) {
  let q = supabase.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (filter === "open") q = q.in("status", OPEN_QUOTE);
  else if ((QUOTE_STATUSES as readonly string[]).includes(filter)) q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) throw new Error(`Quote requests: ${error.message}`);
  return data as QuoteRequest[];
}

/** Staff notes live in their own staff-only table; embedded one-to-one, so an object or null. */
type WithNotes<T> = T & { notes: { notes: string } | { notes: string }[] | null; photos: PhotoRow[] | null };
const notesText = (n: WithNotes<object>["notes"]) => (Array.isArray(n) ? n[0]?.notes : n?.notes) ?? "";

export async function getQuote(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("quote_requests")
    .select(`*, notes:quote_request_notes(notes), ${PHOTO_COLUMNS}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Quote request: ${error.message}`);
  if (!data) return null;
  const { notes, photos, ...quote } = data as WithNotes<QuoteRequest>;
  return { ...quote, staff_notes: notesText(notes), photos: await photoLinks(supabase, photos) };
}

export async function listServiceRequests(supabase: SupabaseClient, filter: InboxFilter) {
  let q = supabase.from("service_requests").select("*").order("is_rush", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (filter === "open") q = q.in("status", OPEN_SERVICE);
  else if ((SERVICE_STATUSES as readonly string[]).includes(filter)) q = q.eq("status", filter);
  const { data, error } = await q;
  if (error) throw new Error(`Service requests: ${error.message}`);
  return data as ServiceRequest[];
}

export async function getServiceRequest(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("service_requests")
    .select(`*, notes:service_request_notes(notes), ${PHOTO_COLUMNS}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Service request: ${error.message}`);
  if (!data) return null;
  const { notes, photos, ...job } = data as WithNotes<ServiceRequest>;
  return { ...job, staff_notes: notesText(notes), photos: await photoLinks(supabase, photos) };
}

export async function dashboardCounts(supabase: SupabaseClient) {
  const [newQuotes, openService, rushService, products, outOfStock, drafts] = await Promise.all([
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).in("status", OPEN_QUOTE),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).in("status", OPEN_SERVICE),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).in("status", OPEN_SERVICE).eq("is_rush", true),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active").eq("in_stock", false),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);
  for (const r of [newQuotes, openService, rushService, products, outOfStock, drafts]) {
    if (r.error) throw new Error(`Dashboard: ${r.error.message}`);
  }
  return {
    newQuotes: newQuotes.count ?? 0,
    openService: openService.count ?? 0,
    rushService: rushService.count ?? 0,
    activeProducts: products.count ?? 0,
    outOfStock: outOfStock.count ?? 0,
    drafts: drafts.count ?? 0,
  };
}
