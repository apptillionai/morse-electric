/**
 * Business details shown across the site. Bracketed values are placeholders
 * until Morse confirms them; set the env vars to override without a deploy of
 * new code. `phoneHref` stays null until a real number exists so we never
 * render a dead tel: link.
 */
const phone = process.env.NEXT_PUBLIC_MORSE_PHONE ?? "[PHONE]";
const digits = phone.replace(/[^\d+]/g, "");

export const SITE = {
  name: "Morse Electric Motor Co.",
  legalName: "Morse Electric Motor Company",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  phone,
  phoneHref: digits.length >= 10 ? `tel:${digits}` : null,
  email: process.env.NEXT_PUBLIC_MORSE_EMAIL ?? "[EMAIL]",
  street: process.env.NEXT_PUBLIC_MORSE_STREET ?? "[STREET ADDRESS]",
  cityStateZip: process.env.NEXT_PUBLIC_MORSE_CITY ?? "[CITY, ST ZIP]",
  hours: process.env.NEXT_PUBLIC_MORSE_HOURS ?? "Mon–Fri [HOURS]",
  serviceArea: process.env.NEXT_PUBLIC_MORSE_SERVICE_AREA ?? "[SERVICE AREA]",
} as const;

export const NAV_LINKS = [
  { href: "/shop", label: "Shop parts" },
  { href: "/service", label: "Repair & service" },
  { href: "/service#field", label: "Field service" },
  { href: "/contact", label: "Contact" },
] as const;
