import "server-only";

import { cache } from "react";
import { EMPTY_BUSINESS, toBusiness, type Business, type BusinessDetails } from "@/lib/business";
import { parseShippingRates, type ShippingRate } from "@/lib/orders/pricing";
import { FALLBACK_DEFAULT_THEME, isDefaultTheme, type DefaultTheme } from "@/lib/theme";

export const SITE_SETTINGS_TAG = "site-settings";

export interface SiteSettings {
  defaultTheme: DefaultTheme;
  business: BusinessDetails;
  /** Online ordering switch; use storeIsOpen() (lib/orders/store.ts), which also checks Stripe is set up. */
  storeEnabled: boolean;
  shippingRates: ShippingRate[];
  /** Days a customer has to return a core for a refund. */
  coreReturnDays: number;
}

const FALLBACK: SiteSettings = {
  defaultTheme: FALLBACK_DEFAULT_THEME,
  business: EMPTY_BUSINESS,
  storeEnabled: false,
  shippingRates: [],
  coreReturnDays: 30,
};

interface SettingsRow {
  default_theme?: unknown;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  hours?: string | null;
  service_area?: string | null;
  store_enabled?: boolean | null;
  shipping_rates?: unknown;
  core_return_days?: number | null;
}

/**
 * Site-wide settings, read with the public key through Next's fetch cache so
 * static pages stay static. Saving in /admin/settings expires the tag.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return FALLBACK;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/site_settings?select=*&id=eq.1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { tags: [SITE_SETTINGS_TAG], revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return FALLBACK;
    const [row] = (await response.json()) as SettingsRow[];
    if (!row) return FALLBACK;
    return {
      defaultTheme: isDefaultTheme(row.default_theme) ? row.default_theme : FALLBACK.defaultTheme,
      business: {
        phone: row.phone ?? null,
        email: row.email ?? null,
        street: row.street ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        postalCode: row.postal_code ?? null,
        hours: row.hours ?? null,
        serviceArea: row.service_area ?? null,
      },
      storeEnabled: row.store_enabled === true,
      shippingRates: parseShippingRates(row.shipping_rates),
      coreReturnDays: typeof row.core_return_days === "number" && row.core_return_days > 0 ? row.core_return_days : 30,
    };
  } catch {
    return FALLBACK;
  }
});

/** Phone, email, address, hours and service area as the site displays them. */
export async function getBusiness(): Promise<Business> {
  return toBusiness((await getSiteSettings()).business);
}
