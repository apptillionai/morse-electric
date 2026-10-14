import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { demoCatalog } from "./demo-source";
import type { CatalogSource } from "./source";
import { supabaseCatalog } from "./supabase-source";

/**
 * The live catalog when Supabase is configured; otherwise the placeholder demo
 * catalog, so the site renders in development and previews before Morse's
 * database exists. Pages show a banner whenever `isDemo` is true.
 */
export function getCatalog(): CatalogSource {
  return isSupabaseConfigured() ? supabaseCatalog : demoCatalog;
}
