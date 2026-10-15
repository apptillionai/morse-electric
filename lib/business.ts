import { z } from "zod";
import { email, optionalText, phonePattern } from "@/lib/requests/schemas";

/** Business details as stored in public.site_settings (edited at /admin/settings). */
export interface BusinessDetails {
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  hours: string | null;
  serviceArea: string | null;
}

export const EMPTY_BUSINESS: BusinessDetails = {
  phone: null,
  email: null,
  street: null,
  city: null,
  state: null,
  postalCode: null,
  hours: null,
  serviceArea: null,
};

/** What pages and emails display. Missing values show as [PLACEHOLDER] so gaps are obvious. */
export interface Business {
  phone: string;
  phoneHref: string | null;
  /** "call us at (978) …" once a phone number is set, otherwise "contact us". For messages and emails. */
  callUs: string;
  email: string;
  emailHref: string | null;
  street: string;
  cityStateZip: string;
  hours: string;
  serviceArea: string;
  /** Structured address for search engines; null until street and city are set. */
  postalAddress: { streetAddress: string; addressLocality: string; addressRegion?: string; postalCode?: string; addressCountry: "US" } | null;
  directionsUrl: string | null;
}

export function toBusiness(d: BusinessDetails): Business {
  const digits = (d.phone ?? "").replace(/[^\d+]/g, "");
  const cityLine = [d.city, [d.state, d.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const fullAddress = d.street && cityLine ? `${d.street}, ${cityLine}` : null;
  return {
    phone: d.phone ?? "[PHONE]",
    // Only link numbers that look dialable, so a typo never becomes a dead tel: link.
    phoneHref: digits.length >= 10 ? `tel:${digits}` : null,
    callUs: d.phone ? `call us at ${d.phone}` : "contact us",
    email: d.email ?? "[EMAIL]",
    emailHref: d.email ? `mailto:${d.email}` : null,
    street: d.street ?? "[STREET ADDRESS]",
    cityStateZip: cityLine || "[CITY, ST ZIP]",
    hours: d.hours ?? "[HOURS]",
    serviceArea: d.serviceArea ?? "[SERVICE AREA]",
    postalAddress:
      d.street && d.city
        ? {
            streetAddress: d.street,
            addressLocality: d.city,
            ...(d.state ? { addressRegion: d.state } : {}),
            ...(d.postalCode ? { postalCode: d.postalCode } : {}),
            addressCountry: "US",
          }
        : null,
    directionsUrl: fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}` : null,
  };
}

export const BUSINESS_FIELDS = ["phone", "email", "street", "city", "state", "postal_code", "hours", "service_area"] as const;
export type BusinessField = (typeof BUSINESS_FIELDS)[number];

/** Validates the Business details part of /admin/settings. Blank fields are saved as empty (placeholder shown). */
export const businessSchema = z.object({
  phone: optionalText(40).refine((v) => v === null || phonePattern.test(v), "Enter a valid phone number."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || email.safeParse(v).success, "Enter a valid email address.")
    .transform((v) => v || null),
  street: optionalText(160),
  city: optionalText(80),
  state: optionalText(40),
  postal_code: optionalText(20),
  hours: optionalText(120),
  service_area: optionalText(160),
});
