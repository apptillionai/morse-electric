import "server-only";

import { headers } from "next/headers";

/**
 * The site origin to put in emailed links: NEXT_PUBLIC_SITE_URL when it's set,
 * otherwise the host this request came in on (e.g. the vercel.app address).
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && !configured.includes("localhost")) return new URL(configured).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
