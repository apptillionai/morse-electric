import "server-only";

import { SITE } from "@/lib/site";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaAction = "quote" | "service";
type CaptchaResult = { ok: true } | { ok: false; error: string };

function allowedHostnames(): Set<string> {
  const hosts = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  try {
    hosts.push(new URL(SITE.url).hostname);
  } catch {
    // SITE.url is validated by deploy config; ignore a malformed value here.
  }
  return new Set(hosts);
}

/**
 * Verify a Cloudflare Turnstile token before storing or emailing anything.
 * Fails closed in production when Turnstile isn't configured; skips the check
 * in development so forms can be exercised locally without keys.
 */
export async function verifyCaptcha(token: unknown, action: CaptchaAction): Promise<CaptchaResult> {
  const retry = "Please complete the security check and try again.";
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    if (process.env.NODE_ENV !== "production") return { ok: true };
    console.error("[captcha] TURNSTILE_SECRET_KEY is not configured.");
    return { ok: false, error: `Online requests are temporarily unavailable. Please call ${SITE.phone}.` };
  }

  if (typeof token !== "string" || !token.trim() || token.length > 2048) {
    return { ok: false, error: retry };
  }

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, error: retry };
    const result = (await response.json()) as { success?: boolean; hostname?: string; action?: string };
    if (
      result.success !== true ||
      result.action !== action ||
      !allowedHostnames().has((result.hostname ?? "").toLowerCase())
    ) {
      return { ok: false, error: retry };
    }
    return { ok: true };
  } catch {
    // Timeout, provider failure or malformed response: fail closed.
    return { ok: false, error: retry };
  }
}
