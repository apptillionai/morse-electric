/** The production address. www and the old vercel.app address redirect here. */
export const PRIMARY_URL = "https://morseelectricmotor.com";

/**
 * Business details shown across the site. The address is confirmed; bracketed
 * values are placeholders until Morse confirms them. Set the env vars to
 * override without a deploy of new code. `phoneHref` stays null until a real number exists so we never
 * render a dead tel: link.
 */
const phone = process.env.NEXT_PUBLIC_MORSE_PHONE ?? "[PHONE]";
const digits = phone.replace(/[^\d+]/g, "");

export const SITE = {
  name: "Morse Electric Motor Co.",
  legalName: "Morse Electric Motor Company",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? PRIMARY_URL).replace(/\/$/, ""),
  phone,
  phoneHref: digits.length >= 10 ? `tel:${digits}` : null,
  email: process.env.NEXT_PUBLIC_MORSE_EMAIL ?? "[EMAIL]",
  street: process.env.NEXT_PUBLIC_MORSE_STREET ?? "380 East Broadway",
  cityStateZip: process.env.NEXT_PUBLIC_MORSE_CITY ?? "Gardner, MA 01440",
  hours: process.env.NEXT_PUBLIC_MORSE_HOURS ?? "Mon–Fri [HOURS]",
  serviceArea: process.env.NEXT_PUBLIC_MORSE_SERVICE_AREA ?? "[SERVICE AREA]",
} as const;

export const NAV_LINKS = [
  { href: "/shop", label: "Shop parts" },
  { href: "/service", label: "Repair & service" },
  { href: "/service#field", label: "Field service" },
  { href: "/contact", label: "Contact" },
] as const;

/** Structured address for maps links and search engines (keep in step with street/cityStateZip). */
export const ADDRESS = {
  streetAddress: "380 East Broadway",
  addressLocality: "Gardner",
  addressRegion: "MA",
  postalCode: "01440",
  addressCountry: "US",
} as const;

export const DIRECTIONS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${ADDRESS.streetAddress}, ${ADDRESS.addressLocality}, ${ADDRESS.addressRegion} ${ADDRESS.postalCode}`,
)}`;
