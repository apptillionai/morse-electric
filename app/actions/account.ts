"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSignedInUser, requireCustomer } from "@/lib/customers/account";
import { isAccountEmailConfigured, sendAccountLinkEmail } from "@/lib/customers/email";
import { accountLinkUrl, isAccountLinkType, safeAccountPath } from "@/lib/customers/links";
import { siteOrigin } from "@/lib/customers/origin";
import { PROFILE_FIELDS, passwordSchema, profileSchema } from "@/lib/customers/schemas";
import { verifyCaptcha } from "@/lib/requests/captcha";
import { email as emailSchema, fieldErrors, formFields } from "@/lib/requests/schemas";
import { getBusiness } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSessionClient } from "@/lib/supabase/server";

export interface AccountFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  saved?: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

export async function signInCustomer(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { email, password, next } = formFields(formData, ["email", "password", "next"] as const);
  const values = { email };
  if (!email.trim() || !password) return { error: "Enter your email and password.", values };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) return { error: "That email and password don’t match an account.", values };

  const [{ data: customer }, { data: staff }] = await Promise.all([
    supabase.from("customers").select("user_id").eq("user_id", data.user.id).maybeSingle(),
    supabase.from("staff").select("role").eq("user_id", data.user.id).maybeSingle(),
  ]);
  if (customer) redirect(safeAccountPath(next));
  if (staff) redirect("/admin");
  await supabase.auth.signOut();
  const { callUs } = await getBusiness();
  return { error: `There’s no customer account for this email. Please ${callUs} to set one up.`, values };
}

export async function signOutCustomer() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/");
}

// ---------------------------------------------------------------------------
// One-time links (invites and password resets)
// ---------------------------------------------------------------------------

export async function acceptAccountLink(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { token_hash, type } = formFields(formData, ["token_hash", "type"] as const);
  if (!token_hash || token_hash.length > 512 || !isAccountLinkType(type)) {
    return { error: "This link isn’t valid. Ask us for a new one." };
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) {
    return { error: "This link has expired or has already been used. Use “Forgot your password?” to get a new one, or call us." };
  }
  redirect(type === "invite" ? "/account/password?welcome=1" : "/account/password");
}

export async function setPassword(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const user = await getSignedInUser();
  if (!user) return { error: "Your sign-in link has expired. Request a new one." };
  const parsed = passwordSchema.safeParse(formFields(formData, ["password", "confirm"] as const));
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const reused = /different from the old password/i.test(error.message);
    return {
      error: reused ? "Choose a password you haven’t used before." : `Couldn’t save your password: ${error.message}`,
      fieldErrors: reused ? { password: "Choose a new password." } : undefined,
    };
  }
  redirect(user.customer ? "/account?password=1" : "/admin");
}

export async function requestPasswordReset(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { email } = formFields(formData, ["email"] as const);
  const sent: AccountFormState = {
    saved: true,
    message: "If there’s an account for that email, we’ve sent a sign-in link. It works once and expires soon.",
  };
  const trap = formData.get("website");
  if (typeof trap === "string" && trap.trim()) return sent;

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "Enter the email address for your account.", fieldErrors: { email: "Enter a valid email address." }, values: { email } };

  const captcha = await verifyCaptcha(formData.get("cf-turnstile-response"), "account");
  if (!captcha.ok) return { error: captcha.error, values: { email } };

  if (!isSupabaseAdminConfigured() || !isAccountEmailConfigured()) {
    const { callUs } = await getBusiness();
    return { error: `Password reset by email isn’t available yet. Please ${callUs} and we’ll send you a new sign-in link.`, values: { email } };
  }

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: parsed.data });
  if (data?.properties?.hashed_token) {
    const { data: customer } = await admin.from("customers").select("name").eq("user_id", data.user.id).maybeSingle();
    const url = accountLinkUrl(await siteOrigin(), data.properties.hashed_token, "recovery");
    await sendAccountLinkEmail(parsed.data, customer?.name ?? "there", url, "recovery");
  }
  // Same answer whether or not the account exists.
  return sent;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function saveProfile(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { id } = await requireCustomer();
  const values = formFields(formData, PROFILE_FIELDS);
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createSessionClient();
  const { error } = await supabase.from("customers").update(parsed.data).eq("user_id", id);
  if (error) return { error: `Couldn’t save: ${error.message}`, values };
  revalidatePath("/account", "layout");
  return { saved: true };
}

const CERT_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const MAX_CERT_BYTES = 3.5 * 1024 * 1024;

export async function uploadTaxCertificate(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { id, customer } = await requireCustomer();
  const file = formData.get("certificate");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your certificate file." };
  if (!CERT_TYPES[file.type]) return { error: "Upload a PDF, JPEG or PNG." };
  if (file.size > MAX_CERT_BYTES) return { error: "That file is over 3.5 MB. Try a smaller scan." };

  const supabase = await createSessionClient();
  const path = `${id}/tax-certificate-${randomUUID()}.${CERT_TYPES[file.type]}`;
  const { error: uploadError } = await supabase.storage
    .from("customer-documents")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { error } = await supabase
    .from("customers")
    .update({ tax_cert_path: path, tax_cert_uploaded_at: new Date().toISOString() })
    .eq("user_id", id);
  if (error) {
    await supabase.storage.from("customer-documents").remove([path]);
    return { error: `Couldn’t save the certificate: ${error.message}` };
  }
  if (customer.tax_cert_path) await supabase.storage.from("customer-documents").remove([customer.tax_cert_path]);
  revalidatePath("/account", "layout");
  return { saved: true, message: "Certificate uploaded. We’ll review it and mark your account tax-exempt." };
}
