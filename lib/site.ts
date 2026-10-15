/** The production address. www and the old vercel.app address redirect here. */
export const PRIMARY_URL = "https://morseelectricmotor.com";

/**
 * Fixed site identity. Phone, email, address, hours and service area are
 * edited by staff at /admin/settings: read them with getBusiness()
 * (lib/site-settings.ts).
 */
export const SITE = {
  name: "Morse Electric Motor Co.",
  legalName: "Morse Electric Motor Company",
  parentCompany: "ALP Associates Inc.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? PRIMARY_URL).replace(/\/$/, ""),
} as const;

export const NAV_LINKS = [
  { href: "/shop", label: "Shop parts" },
  { href: "/service", label: "Repair & service" },
  { href: "/service#field", label: "Field service" },
  { href: "/contact", label: "Contact" },
] as const;

