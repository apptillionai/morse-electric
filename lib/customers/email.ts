import "server-only";

import { Resend } from "resend";
import { escapeHtml } from "@/lib/requests/email";
import { SITE } from "@/lib/site";
import type { AccountLinkType } from "./links";

export function isAccountEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MORSE_EMAIL_FROM);
}

const COPY: Record<AccountLinkType, { subject: string; intro: string; button: string }> = {
  invite: {
    subject: `Your ${SITE.name} customer account`,
    intro: `We’ve set up a customer account for you at ${SITE.name}. Use it to track repair jobs, see your quotes and keep your company details on file.`,
    button: "Set up your account",
  },
  recovery: {
    subject: `Sign in to your ${SITE.name} account`,
    intro: "Use the button below to sign in and choose a new password.",
    button: "Choose a password",
  },
};

/** Email a one-time account link. Returns false (never throws) when email isn't set up or fails. */
export async function sendAccountLinkEmail(to: string, name: string, url: string, type: AccountLinkType): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MORSE_EMAIL_FROM;
  if (!apiKey || !from) return false;
  const copy = COPY[type];
  const p = "font:15px/1.5 sans-serif";
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to,
      subject: copy.subject,
      html: `<p style="${p}">Hi ${escapeHtml(name)},</p>
<p style="${p}">${escapeHtml(copy.intro)}</p>
<p style="${p}"><a href="${escapeHtml(url)}" style="display:inline-block;background:#B4501B;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600">${escapeHtml(copy.button)}</a></p>
<p style="${p};color:#4A5866">The link works once and expires soon. If it has expired, use “Forgot your password?” on the sign-in page or call us at ${escapeHtml(SITE.phone)}.</p>`,
      text: `Hi ${name},\n\n${copy.intro}\n\n${copy.button}: ${url}\n\nThe link works once and expires soon. If it has expired, use "Forgot your password?" on the sign-in page or call us at ${SITE.phone}.`,
    });
    if (error) {
      console.error("[account email]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[account email]", e instanceof Error ? e.message : e);
    return false;
  }
}
