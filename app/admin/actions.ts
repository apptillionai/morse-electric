"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin/auth";
import { safeAdminPath } from "@/lib/admin/paths";
import { applyImportPlan, loadAllProducts, loadRefs, saveProduct, type ImportResult } from "@/lib/admin/catalog";
import { inviteCustomer, newSignInToken, removeCustomer } from "@/lib/admin/customers";
import { parseImport, planImport, type ImportPlan, type RowError } from "@/lib/admin/csv-import";
import { parseTierForm } from "@/lib/admin/price-tiers";
import { parseProductForm, PRODUCT_FORM_FIELDS, type ProductFormField } from "@/lib/admin/product-form";
import { QUOTE_STATUSES, SERVICE_STATUSES } from "@/lib/admin/requests";
import { sendAccountLinkEmail } from "@/lib/customers/email";
import { accountLinkUrl } from "@/lib/customers/links";
import { siteOrigin } from "@/lib/customers/origin";
import { INVITE_FIELDS, inviteSchema } from "@/lib/customers/schemas";
import { fieldErrors, formFields } from "@/lib/requests/schemas";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { SITE_SETTINGS_TAG } from "@/lib/site-settings";
import { isDefaultTheme } from "@/lib/theme";
import { BUSINESS_FIELDS, businessSchema } from "@/lib/business";
import { LIVE_RATE_FIELDS, parseLiveRateFields, parseRateRows, RATE_FIELDS } from "@/lib/orders/settings";
import { createSessionClient } from "@/lib/supabase/server";

// Every action re-checks staff access: server actions are reachable by POST
// from anywhere, so the /admin layout guard alone is not enough.

/** Public storefront pages that show catalog data. */
function revalidateStorefront() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface SignInState {
  error?: string;
  email?: string;
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const { email, password, next } = formFields(formData, ["email", "password", "next"] as const);
  if (!email.trim() || !password) return { error: "Enter your email and password.", email };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) return { error: "That email and password don’t match a staff account.", email };

  const { data: staff } = await supabase.from("staff").select("role").eq("user_id", data.user.id).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    return { error: "This account isn’t set up for staff access. Ask an administrator to add you.", email };
  }
  redirect(safeAdminPath(next));
}

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductFormState {
  error?: string;
  fieldErrors?: Partial<Record<ProductFormField, string>>;
  values?: Record<string, string>;
}

export async function saveProductAction(id: string | null, _prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  await requireStaff();
  const supabase = await createSessionClient();
  const form = formFields(formData, PRODUCT_FORM_FIELDS);
  const refs = await loadRefs(supabase);
  const parsed = parseProductForm(form, refs.categories.map((c) => c.slug));
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors, values: form };

  const result = await saveProduct(supabase, id, parsed.sku, parsed.values);
  if ("error" in result) {
    return {
      error: result.error,
      fieldErrors: result.field ? { [result.field]: result.error } : undefined,
      values: form,
    };
  }
  revalidateStorefront();
  redirect(`/admin/products/${result.id}?saved=1`);
}

export async function deleteProductAction(id: string) {
  await requireStaff();
  const supabase = await createSessionClient();
  const { data: images } = await supabase.from("product_images").select("storage_path").eq("product_id", id);
  if (images?.length) await supabase.storage.from("product-images").remove(images.map((i) => i.storage_path));
  const { data, error } = await supabase.from("products").delete().eq("id", id).select("sku").maybeSingle();
  if (error) throw new Error(`Delete failed: ${error.message}`);
  revalidateStorefront();
  redirect(`/admin/products?deleted=${encodeURIComponent(data?.sku ?? "")}`);
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

export interface UploadState {
  error?: string;
  uploaded?: number;
}

export async function uploadImagesAction(productId: string, _prev: UploadState, formData: FormData): Promise<UploadState> {
  await requireStaff();
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose one or more photos." };
  const bad = files.find((f) => !IMAGE_TYPES[f.type]);
  if (bad) return { error: `${bad.name} isn’t a JPEG, PNG or WebP image.` };
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_IMAGE_BYTES) return { error: "Upload at most 3.5 MB at a time. Resize large photos or upload them one by one." };

  const supabase = await createSessionClient();
  const [{ data: product }, { data: last }] = await Promise.all([
    supabase.from("products").select("name").eq("id", productId).single(),
    supabase.from("product_images").select("sort_order").eq("product_id", productId).order("sort_order", { ascending: false }).limit(1),
  ]);
  let order = (last?.[0]?.sort_order ?? -1) + 1;

  for (const file of files) {
    const path = `${productId}/${randomUUID()}.${IMAGE_TYPES[file.type]}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (uploadError) return { error: `Upload failed for ${file.name}: ${uploadError.message}` };
    const { error } = await supabase
      .from("product_images")
      .insert({ product_id: productId, storage_path: path, alt: product?.name ?? "", sort_order: order++ });
    if (error) {
      await supabase.storage.from("product-images").remove([path]);
      return { error: `Saving ${file.name} failed: ${error.message}` };
    }
  }
  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefront();
  return { uploaded: files.length };
}

export async function deleteImageAction(productId: string, imageId: string) {
  await requireStaff();
  const supabase = await createSessionClient();
  const { data } = await supabase.from("product_images").delete().eq("id", imageId).select("storage_path").maybeSingle();
  if (data) await supabase.storage.from("product-images").remove([data.storage_path]);
  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefront();
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const MAX_CSV_BYTES = 1.5 * 1024 * 1024;

export interface ImportState {
  step: "upload" | "preview" | "done";
  error?: string;
  fileName?: string;
  csv?: string;
  summary?: {
    rows: number;
    creates: { line: number; sku: string; name: string }[];
    updates: { line: number; sku: string; fields: string[] }[];
    createCount: number;
    updateCount: number;
    unchanged: number;
    newBrands: string[];
    ignoredHeaders: string[];
    columns: string[];
  };
  errors?: RowError[];
  errorCount?: number;
  result?: ImportResult;
}

async function planFromCsv(csv: string): Promise<{ plan: ImportPlan; parsedRows: number; columns: string[]; ignored: string[] }> {
  const supabase = await createSessionClient();
  const parsed = parseImport(csv);
  const [refs, existing] = await Promise.all([loadRefs(supabase), loadAllProducts(supabase)]);
  return { plan: planImport(parsed, existing, refs), parsedRows: parsed.rows.length + parsed.errors.length, columns: parsed.columns, ignored: parsed.ignoredHeaders };
}

export async function previewImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireStaff();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { step: "upload", error: "Choose a CSV file to import." };
  if (file.size > MAX_CSV_BYTES) return { step: "upload", error: "That file is over 1.5 MB. Split it into smaller files." };
  if (!/\.csv$/i.test(file.name) && !file.type.includes("csv") && file.type !== "text/plain") {
    return { step: "upload", error: "Upload a .csv file. In Excel or Google Sheets use File → Download / Save as → CSV." };
  }
  const csv = await file.text();
  const { plan, parsedRows, columns, ignored } = await planFromCsv(csv);
  return {
    step: "preview",
    fileName: file.name,
    csv,
    summary: {
      rows: parsedRows,
      creates: plan.creates.slice(0, 100).map((c) => ({ line: c.line, sku: c.sku, name: c.values.name })),
      updates: plan.updates.slice(0, 100).map((u) => ({ line: u.line, sku: u.sku, fields: Object.keys(u.changes) })),
      createCount: plan.creates.length,
      updateCount: plan.updates.length,
      unchanged: plan.unchanged,
      newBrands: plan.newBrands,
      ignoredHeaders: ignored,
      columns,
    },
    errors: plan.errors.slice(0, 200),
    errorCount: plan.errors.length,
  };
}

export async function applyImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireStaff();
  const csv = formData.get("csv");
  if (typeof csv !== "string" || !csv) return { step: "upload", error: "The import expired. Upload the file again." };
  if (csv.length > MAX_CSV_BYTES * 2) return { step: "upload", error: "That file is too large." };

  // Re-plan against the catalog as it is now, in case it changed since the preview.
  const { plan } = await planFromCsv(csv);
  if (plan.errors.length) {
    return { step: "upload", error: `The file has ${plan.errors.length} problem(s) now. Upload it again to see them.` };
  }
  const supabase = await createSessionClient();
  const refs = await loadRefs(supabase);
  try {
    const result = await applyImportPlan(supabase, plan, refs);
    revalidateStorefront();
    return { step: "done", result };
  } catch (e) {
    revalidateStorefront();
    return {
      step: "upload",
      error: `Import stopped part-way: ${e instanceof Error ? e.message : e}. Rows before the problem were saved; fix it and import the same file again. Rows already saved will show as unchanged.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface TriageState {
  saved?: boolean;
  error?: string;
}

const NOTES_TABLE = {
  quote_requests: { table: "quote_request_notes", key: "quote_request_id" },
  service_requests: { table: "service_request_notes", key: "service_request_id" },
} as const;

async function triage(table: "quote_requests" | "service_requests", statuses: readonly string[], id: string, formData: FormData): Promise<TriageState> {
  const staff = await requireStaff();
  const { status, staff_notes } = formFields(formData, ["status", "staff_notes"] as const);
  if (!statuses.includes(status)) return { error: "Choose a status." };
  if (staff_notes.length > 4000) return { error: "Notes must be 4,000 characters or fewer." };
  const supabase = await createSessionClient();
  const { error } = await supabase.from(table).update({ status }).eq("id", id);
  if (error) return { error: error.message };

  const notes = NOTES_TABLE[table];
  const text = staff_notes.trim();
  const { error: notesError } = text
    ? await supabase.from(notes.table).upsert({ [notes.key]: id, notes: text, updated_by: staff.id, updated_at: new Date().toISOString() })
    : await supabase.from(notes.table).delete().eq(notes.key, id);
  if (notesError) return { error: `Status saved, but the notes weren’t: ${notesError.message}` };

  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
  return { saved: true };
}

export async function updateQuoteAction(id: string, _prev: TriageState, formData: FormData) {
  return triage("quote_requests", QUOTE_STATUSES, id, formData);
}

export async function updateServiceAction(id: string, _prev: TriageState, formData: FormData) {
  return triage("service_requests", SERVICE_STATUSES, id, formData);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

const NO_SECRET_KEY = "Customer logins need SUPABASE_SECRET_KEY set in Vercel. Add it, redeploy and try again.";

/** A one-time link to show staff (to copy and send) and, when email is set up, to email the customer. */
export interface AccountLinkResult {
  url: string;
  emailed: boolean;
  email: string;
}

export interface InviteState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  done?: AccountLinkResult & { customerId: string; name: string; linked: number };
}

export async function inviteCustomerAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const staff = await requireStaff();
  const values = formFields(formData, INVITE_FIELDS);
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error), values };
  if (!isSupabaseAdminConfigured()) return { error: NO_SECRET_KEY, values };

  const supabase = await createSessionClient();
  const result = await inviteCustomer(supabase, staff.id, parsed.data);
  if (!result.ok) return { error: result.error, fieldErrors: result.field ? { [result.field]: result.error } : undefined, values };

  // Invited from a "Request a business account" submission: mark it done.
  const requestId = formData.get("request_id");
  if (typeof requestId === "string" && /^[0-9a-f-]{36}$/i.test(requestId)) {
    const { error } = await supabase.from("account_requests").update({ status: "invited", customer_id: result.id }).eq("id", requestId);
    if (error) console.error("[invite] marking account request invited:", error.message);
  }

  const url = accountLinkUrl(await siteOrigin(), result.tokenHash, "invite");
  const emailed = await sendAccountLinkEmail(parsed.data.email, parsed.data.name, url, "invite");
  revalidatePath("/admin", "layout");
  return { done: { customerId: result.id, name: parsed.data.name, email: parsed.data.email, url, emailed, linked: result.linked } };
}

export interface LinkState {
  error?: string;
  link?: AccountLinkResult;
}

export async function newSignInLinkAction(customerId: string): Promise<LinkState> {
  await requireStaff();
  if (!isSupabaseAdminConfigured()) return { error: NO_SECRET_KEY };
  const supabase = await createSessionClient();
  const { data: customer } = await supabase.from("customers").select("email, name").eq("user_id", customerId).maybeSingle();
  if (!customer) return { error: "Customer not found." };
  const token = await newSignInToken(customer.email);
  if ("error" in token) return { error: `Couldn’t create a link: ${token.error}` };
  const url = accountLinkUrl(await siteOrigin(), token.tokenHash, "recovery");
  const emailed = await sendAccountLinkEmail(customer.email, customer.name, url, "recovery");
  return { link: { url, emailed, email: customer.email } };
}

export async function setTaxExemptAction(customerId: string, formData: FormData) {
  await requireStaff();
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("customers")
    .update({ tax_exempt: formData.get("tax_exempt") === "on" })
    .eq("user_id", customerId);
  if (error) throw new Error(`Saving tax status failed: ${error.message}`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/account", "layout");
}

export async function dismissAccountRequestAction(requestId: string) {
  await requireStaff();
  const supabase = await createSessionClient();
  const { error } = await supabase.from("account_requests").update({ status: "dismissed" }).eq("id", requestId);
  if (error) throw new Error(`Dismissing the request failed: ${error.message}`);
  revalidatePath("/admin/customers");
}

export interface TermsState {
  error?: string;
  saved?: boolean;
}

/** Put a customer on Net-30 terms (or back to paying up front) with a credit limit. */
export async function setTermsAction(customerId: string, _prev: TermsState, formData: FormData): Promise<TermsState> {
  await requireStaff();
  const terms = formData.get("terms") === "net30" ? "net30" : "prepay";
  const raw = String(formData.get("credit_limit") ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  const dollars = raw === "" ? 0 : Number(raw);
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) return { error: "Enter a credit limit from $0 to $1,000,000." };
  if (terms === "net30" && dollars <= 0) return { error: "Set a credit limit above $0 for Net-30 terms." };
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("customers")
    .update({ terms, credit_limit_cents: Math.round(dollars * 100) })
    .eq("user_id", customerId);
  if (error) return { error: `Couldn’t save terms: ${error.message}` };
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/account", "layout");
  revalidatePath("/cart");
  return { saved: true };
}

export async function removeCustomerAction(customerId: string) {
  await requireStaff();
  if (!isSupabaseAdminConfigured()) throw new Error(NO_SECRET_KEY);
  await removeCustomer(await createSessionClient(), customerId);
  revalidatePath("/admin", "layout");
  redirect("/admin/customers?removed=1");
}

// ---------------------------------------------------------------------------
// Price tiers
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TierState {
  saved?: boolean;
  errors?: Partial<Record<"name" | "discount", string>>;
  error?: string;
  /** What was submitted, so the form keeps it after a failed save. */
  values?: { name: string; discount: string };
  /** Changes on every save, so the form re-mounts with the right values. */
  version?: number;
}

/** Add a tier (id null) or change one's name or discount. */
export async function savePriceTierAction(id: string | null, _prev: TierState, formData: FormData): Promise<TierState> {
  await requireStaff();
  const values = { name: String(formData.get("name") ?? ""), discount: String(formData.get("discount") ?? "") };
  const version = Date.now();
  if (id !== null && !UUID.test(id)) return { error: "Tier not found.", values, version };
  const parsed = parseTierForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values, version };
  const supabase = await createSessionClient();
  const { error } = id
    ? await supabase.from("price_tiers").update(parsed.values).eq("id", id)
    : await supabase.from("price_tiers").insert(parsed.values);
  if (error) {
    if (error.code === "23505") return { errors: { name: "Another tier already has this name." }, values, version };
    return { error: `Couldn’t save the tier: ${error.message}`, values, version };
  }
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/customers", "layout");
  revalidatePath("/account", "layout");
  // A new tier's form starts empty again; an edited one shows what was saved.
  return id ? { saved: true, version } : { saved: true, version, values: { name: "", discount: "" } };
}

/** Remove a tier. Its customers go back to list prices. */
export async function deletePriceTierAction(id: string) {
  await requireStaff();
  if (!UUID.test(id)) redirect("/admin/pricing");
  const supabase = await createSessionClient();
  const { error } = await supabase.from("price_tiers").delete().eq("id", id);
  if (error) throw new Error(`Removing the tier failed: ${error.message}`);
  revalidatePath("/admin/customers", "layout");
  revalidatePath("/account", "layout");
  redirect("/admin/pricing?removed=1");
}

/** Put a customer on a price tier, or back on list prices. */
export async function setCustomerTierAction(customerId: string, formData: FormData) {
  await requireStaff();
  const raw = String(formData.get("price_tier_id") ?? "");
  const tierId = UUID.test(raw) ? raw : null;
  const supabase = await createSessionClient();
  const { error } = await supabase.from("customers").update({ price_tier_id: tierId }).eq("user_id", customerId);
  if (error) throw new Error(`Saving the price tier failed: ${error.message}`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/pricing");
  revalidatePath("/account", "layout");
}

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export interface SettingsState {
  saved?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const staff = await requireStaff();
  const values = formFields(formData, [
    "default_theme",
    "store_enabled",
    "core_return_days",
    ...BUSINESS_FIELDS,
    ...RATE_FIELDS,
    ...LIVE_RATE_FIELDS,
  ] as const);
  const theme = values.default_theme;
  if (!isDefaultTheme(theme)) return { error: "Choose a default theme.", values };
  const business = businessSchema.safeParse(values);
  const rates = parseRateRows(values);
  const liveRates = parseLiveRateFields(values);
  const returnDays = Number(values.core_return_days || "30");
  const daysError = Number.isInteger(returnDays) && returnDays >= 1 && returnDays <= 365 ? null : "Enter a number of days from 1 to 365.";
  if (!business.success || !rates.ok || !liveRates.ok || daysError) {
    return {
      error: "Check the highlighted fields.",
      fieldErrors: {
        ...(business.success ? {} : fieldErrors(business.error)),
        ...(rates.ok ? {} : rates.errors),
        ...(liveRates.ok ? {} : liveRates.errors),
        ...(daysError ? { core_return_days: daysError } : {}),
      },
      values,
    };
  }
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("site_settings")
    .update({
      default_theme: theme,
      ...business.data,
      store_enabled: values.store_enabled === "on",
      shipping_rates: rates.rates,
      ...liveRates.columns,
      core_return_days: returnDays,
      updated_by: staff.id,
    })
    .eq("id", 1);
  if (error) return { error: `Couldn’t save: ${error.message}` };
  // Every page reads these through the root layout, header and footer.
  updateTag(SITE_SETTINGS_TAG);
  revalidatePath("/", "layout");
  return { saved: true };
}
