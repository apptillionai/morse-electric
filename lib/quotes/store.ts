import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EquipmentType } from "@/lib/requests/schemas";
import type { QuoteKind, QuoteLineValues, QuoteOfferStatus, QuoteState } from "./logic";

// ---------------------------------------------------------------------------
// The customer's link: /quotes/<token>. Only the token's SHA-256 is stored,
// so a new link (resend) replaces the old one.
// ---------------------------------------------------------------------------

export const QUOTE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const newQuoteToken = () => randomBytes(32).toString("base64url");
export const hashQuoteToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const quoteLink = (origin: string, token: string) => `${origin}/quotes/${token}`;

export interface QuoteLine {
  id: string;
  quote_id: string;
  product_id: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  core_charge_cents: number;
  sort_order: number;
}

export interface Quote {
  id: string;
  reference: string;
  quote_request_id: string | null;
  service_request_id: string | null;
  customer_id: string | null;
  status: QuoteOfferStatus;
  name: string;
  email: string;
  message: string | null;
  shipping_cents: number | null;
  valid_until: string;
  order_id: string | null;
  decline_reason: string | null;
  sent_at: string | null;
  responded_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  lines: QuoteLine[];
  /** The request it prices (one of the two). */
  quote_request: { reference: string; status: string; product_sku: string | null; details: string | null } | null;
  service_request: {
    reference: string;
    status: string;
    equipment_type: EquipmentType;
    make: string | null;
    size: string | null;
  } | null;
  order: { reference: string; status: string } | null;
}

// Every column but token_hash, which never leaves the server.
const SELECT = `id, reference, quote_request_id, service_request_id, customer_id, status, name, email, message,
  shipping_cents, valid_until, order_id, decline_reason, sent_at, responded_at, paid_at, created_at, updated_at,
  lines:quote_lines(*),
  quote_request:quote_requests(reference, status, product_sku, details),
  service_request:service_requests(reference, status, equipment_type, make, size),
  order:orders!quotes_order_id_fkey(reference, status)`;

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function normalize(row: Quote): Quote {
  return {
    ...row,
    lines: [...(row.lines ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    quote_request: one(row.quote_request),
    service_request: one(row.service_request),
    order: one(row.order),
  };
}

/** One quote with its lines. RLS decides who may read it (the service role reads all). */
export async function loadQuote(supabase: SupabaseClient, by: { id: string } | { tokenHash: string }): Promise<Quote | null> {
  let query = supabase.from("quotes").select(SELECT);
  query = "id" in by ? query.eq("id", by.id) : query.eq("token_hash", by.tokenHash);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Quote: ${error.message}`);
  return data ? normalize(data as unknown as Quote) : null;
}

/** Every quote for one request, newest first. */
export async function listQuotesFor(
  supabase: SupabaseClient,
  by: { quoteRequestId: string } | { serviceRequestId: string },
): Promise<Quote[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select(SELECT)
    .eq("quoteRequestId" in by ? "quote_request_id" : "service_request_id", "quoteRequestId" in by ? by.quoteRequestId : by.serviceRequestId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Quotes: ${error.message}`);
  return (data as unknown as Quote[]).map(normalize);
}

/** The signed-in customer's sent quotes (RLS hides drafts and other customers'). */
export async function listMyQuotes(supabase: SupabaseClient, customerId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select(SELECT)
    .eq("customer_id", customerId)
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Quotes: ${error.message}`);
  return (data as unknown as Quote[]).map(normalize);
}

export const quoteKind = (q: Pick<Quote, "service_request_id">): QuoteKind => (q.service_request_id ? "repair" : "parts");

export const lineValues = (lines: QuoteLine[]): QuoteLineValues[] =>
  lines.map((l) => ({
    productId: l.product_id,
    sku: l.sku,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unit_price_cents,
    coreChargeCents: l.core_charge_cents,
  }));

export const quoteState = (q: Quote): QuoteState => ({
  kind: quoteKind(q),
  status: q.status,
  validUntil: q.valid_until,
  jobStatus: q.service_request?.status ?? null,
  lineCount: q.lines.length,
});

/** "Quote for Q-1001" / "Repair quote for job SR-1001". */
export function quoteTitle(q: Quote): string {
  return q.service_request ? `Repair quote for job ${q.service_request.reference}` : `Quote for request ${q.quote_request?.reference ?? q.reference}`;
}
