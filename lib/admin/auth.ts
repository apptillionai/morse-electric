import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createSessionClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { REQUEST_PATH_HEADER, safeAdminPath } from "./paths";

export interface StaffUser {
  id: string;
  email: string;
  role: "staff" | "admin";
}

/** The signed-in staff member, or null. Cached per request. */
export const getStaffUser = cache(async (): Promise<StaffUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSessionClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  // RLS only lets a user read their own staff row, so a row means "is staff".
  const { data: staff } = await supabase.from("staff").select("role").eq("user_id", userId).maybeSingle();
  if (!staff) return null;
  return { id: userId, email: String(claims.claims.email ?? ""), role: staff.role };
});

/**
 * Gate for every admin page and server action. Server actions are public
 * endpoints, so each one must call this itself; the layout check alone is not enough.
 */
export async function requireStaff(): Promise<StaffUser> {
  await connection(); // always per-request, even when Supabase isn't configured
  const staff = await getStaffUser();
  if (!staff) {
    const next = safeAdminPath((await headers()).get(REQUEST_PATH_HEADER));
    redirect(next === "/admin" ? "/admin/login" : `/admin/login?next=${encodeURIComponent(next)}`);
  }
  return staff;
}

/**
 * The session client for an admin page, after the staff check. Pages render in
 * parallel with their layout, so each page checks for itself rather than relying
 * on the layout's guard.
 */
export async function staffClient() {
  await requireStaff();
  return createSessionClient();
}
