import "server-only";

import { headers } from "next/headers";
import { SITE } from "@/lib/site";

/**
 * The site origin to put in emailed links. Deployed builds always use the
 * primary domain (SITE.url), so links never point at a vercel.app address;
 * local development uses the host the request came in on.
 */
export async function siteOrigin(): Promise<string> {
  if (process.env.NODE_ENV === "production") return new URL(SITE.url).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
