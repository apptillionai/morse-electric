import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous, session-less client for public catalog reads. Row-level security
 * limits it to active products, categories and brands.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
