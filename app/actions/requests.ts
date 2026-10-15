"use server";

import { after } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { getSignedInUser } from "@/lib/customers/account";
import { verifyCaptcha } from "@/lib/requests/captcha";
import { sendRequestEmails } from "@/lib/requests/email";
import type { RequestFormState } from "@/lib/requests/form-state";
import {
  EQUIPMENT_TYPES,
  fieldErrors,
  formFields,
  quoteRequestSchema,
  serviceRequestSchema,
} from "@/lib/requests/schemas";
import { insertQuoteRequest, insertServiceRequest } from "@/lib/requests/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { getBusiness } from "@/lib/site-settings";

const QUOTE_FIELDS = ["name", "company", "email", "phone", "sku", "quantity", "details"] as const;
const SERVICE_FIELDS = [
  "equipmentType",
  "name",
  "company",
  "email",
  "phone",
  "make",
  "size",
  "modelSerial",
  "symptoms",
  "wantsPickup",
  "isRush",
  "wantsReplacementQuote",
] as const;

async function unavailable() {
  const { callUs } = await getBusiness();
  return `Online requests aren't available right now. Please ${callUs}.`;
}

/** Honeypot: a hidden "website" field real visitors never fill in. */
function isBot(formData: FormData): boolean {
  const trap = formData.get("website");
  return typeof trap === "string" && trap.trim() !== "";
}

/** The signed-in customer's id, so the request shows up in their account. Never blocks a request. */
async function currentCustomerId(): Promise<string | null> {
  try {
    const user = await getSignedInUser();
    return user?.customer ? user.id : null;
  } catch {
    return null;
  }
}

function sourcePath(formData: FormData): string | null {
  const value = formData.get("source_path");
  return typeof value === "string" && value.startsWith("/") ? value.slice(0, 500) : null;
}

export async function submitQuoteRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const values = formFields(formData, QUOTE_FIELDS);
  if (isBot(formData)) return { status: "success", reference: "received" };

  const parsed = quoteRequestSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error), values };
  }

  // Signed-in customers were invited by staff, so they skip the spam check.
  const customerId = await currentCustomerId();
  if (!customerId) {
    const captcha = await verifyCaptcha(formData.get("cf-turnstile-response"), "quote");
    if (!captcha.ok) return { status: "error", message: captcha.error, values };
  }

  if (!isSupabaseAdminConfigured()) return { status: "error", message: await unavailable(), values };

  const input = parsed.data;
  try {
    const product = input.sku ? await getCatalog().getProductBySku(input.sku) : null;
    const reference = await insertQuoteRequest(input, {
      productId: product?.id ?? null,
      sourcePath: sourcePath(formData),
      customerId,
    });

    after(() =>
      sendRequestEmails({
        kind: "quote",
        reference,
        customerName: input.name,
        customerEmail: input.email,
        rows: [
          ["Name", input.name],
          ["Company", input.company],
          ["Email", input.email],
          ["Phone", input.phone],
          ["Part", product ? `${product.name} (${product.sku})` : input.sku],
          ["Quantity", input.quantity?.toString() ?? null],
          ["Details", input.details],
        ],
      }),
    );

    return { status: "success", reference };
  } catch (error) {
    console.error("[quote]", error instanceof Error ? error.message : error);
    return { status: "error", message: await unavailable(), values };
  }
}

export async function submitServiceRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const values = formFields(formData, SERVICE_FIELDS);
  if (isBot(formData)) return { status: "success", reference: "received" };

  const parsed = serviceRequestSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error), values };
  }

  // Signed-in customers were invited by staff, so they skip the spam check.
  const customerId = await currentCustomerId();
  if (!customerId) {
    const captcha = await verifyCaptcha(formData.get("cf-turnstile-response"), "service");
    if (!captcha.ok) return { status: "error", message: captcha.error, values };
  }

  if (!isSupabaseAdminConfigured()) return { status: "error", message: await unavailable(), values };

  const input = parsed.data;
  try {
    const reference = await insertServiceRequest(input, { sourcePath: sourcePath(formData), customerId });
    const yes = (flag: boolean) => (flag ? "Yes" : null);

    after(() =>
      sendRequestEmails({
        kind: "service",
        reference,
        customerName: input.name,
        customerEmail: input.email,
        rows: [
          ["Equipment", EQUIPMENT_TYPES[input.equipmentType]],
          ["Name", input.name],
          ["Company", input.company],
          ["Email", input.email],
          ["Phone", input.phone],
          ["Make / brand", input.make],
          ["HP / size", input.size],
          ["Model / serial", input.modelSerial],
          ["Problem", input.symptoms],
          ["Pickup requested", yes(input.wantsPickup)],
          ["Rush (line down)", yes(input.isRush)],
          ["Also quote a replacement", yes(input.wantsReplacementQuote)],
        ],
      }),
    );

    return { status: "success", reference };
  } catch (error) {
    console.error("[service]", error instanceof Error ? error.message : error);
    return { status: "error", message: await unavailable(), values };
  }
}
