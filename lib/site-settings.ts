import "server-only";

import { FALLBACK_DEFAULT_THEME, isDefaultTheme, type DefaultTheme } from "@/lib/theme";

export const SITE_SETTINGS_TAG = "site-settings";

export interface SiteSettings {
  defaultTheme: DefaultTheme;
}

const FALLBACK: SiteSettings = { defaultTheme: FALLBACK_DEFAULT_THEME };

/**
 * Site-wide settings, read with the public key through Next's fetch cache so
 * static pages stay static. Saving in /admin/settings expires the tag.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return FALLBACK;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/site_settings?select=default_theme&id=eq.1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { tags: [SITE_SETTINGS_TAG], revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return FALLBACK;
    const [row] = (await response.json()) as { default_theme?: unknown }[];
    return { defaultTheme: isDefaultTheme(row?.default_theme) ? row.default_theme : FALLBACK.defaultTheme };
  } catch {
    return FALLBACK;
  }
}
