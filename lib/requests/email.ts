import "server-only";

import { Resend } from "resend";
import { SITE } from "@/lib/site";
import { getBusiness } from "@/lib/site-settings";

export type EmailRow = [label: string, value: string | null];

export interface RequestEmail {
  kind: "quote" | "service" | "account";
  reference: string;
  customerName: string;
  customerEmail: string;
  rows: EmailRow[];
  /** The request in the staff admin, linked from the staff email only. */
  adminPath: string;
}

const KIND_LABEL = { quote: "Quote request", service: "Service request", account: "Business account request" } as const;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c] ?? c);
}

export function renderRows(rows: EmailRow[]): { html: string; text: string } {
  const present = rows.filter((r): r is [string, string] => Boolean(r[1]));
  return {
    html: `<table cellpadding="6" style="border-collapse:collapse;font:14px/1.5 sans-serif">${present
      .map(
        ([label, value]) =>
          `<tr><td style="color:#4A5866;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}</table>`,
    text: present.map(([label, value]) => `${label}: ${value}`).join("\n"),
  };
}

/**
 * Notify Morse staff and confirm to the customer. Never throws: the request is
 * already stored, so a mail outage must not turn a saved request into an error.
 */
export async function sendRequestEmails(email: RequestEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MORSE_EMAIL_FROM;
  const staff = process.env.MORSE_STAFF_EMAIL;
  if (!apiKey || !from || !staff) {
    console.warn(`[email] Resend not configured; ${email.reference} stored without email.`);
    return;
  }

  const resend = new Resend(apiKey);
  const { callUs } = await getBusiness();
  const label = KIND_LABEL[email.kind];
  const body = renderRows(email.rows);
  const adminUrl = `${SITE.url}${email.adminPath}`;

  const results = await Promise.allSettled([
    resend.emails.send({
      from,
      to: staff.split(",").map((s) => s.trim()),
      replyTo: email.customerEmail,
      subject: `${label} ${email.reference} from ${email.customerName}`,
      html: `<p style="font:14px sans-serif"><strong>${label} ${escapeHtml(email.reference)}</strong></p>${body.html}
<p style="font:14px sans-serif"><a href="${escapeHtml(adminUrl)}">Open in the admin</a></p>`,
      text: `${label} ${email.reference}\n\n${body.text}\n\nOpen in the admin: ${adminUrl}`,
    }),
    resend.emails.send({
      from,
      to: email.customerEmail,
      replyTo: staff.split(",")[0].trim(),
      subject: `We received your ${label.toLowerCase()} (${email.reference})`,
      html: `<p style="font:15px/1.5 sans-serif">Hi ${escapeHtml(email.customerName)},</p>
<p style="font:15px/1.5 sans-serif">Thanks for contacting ${escapeHtml(SITE.name)}. Your reference is <strong>${escapeHtml(email.reference)}</strong>. A member of our team will follow up shortly. If it's urgent, ${escapeHtml(callUs)}.</p>
<p style="font:15px/1.5 sans-serif">Here's what you sent:</p>${body.html}
<p style="font:13px/1.5 sans-serif;color:#4A5866">${escapeHtml(SITE.name)} · <a href="${escapeHtml(SITE.url)}">${escapeHtml(new URL(SITE.url).host)}</a></p>`,
      text: `Hi ${email.customerName},\n\nThanks for contacting ${SITE.name}. Your reference is ${email.reference}. A member of our team will follow up shortly. If it's urgent, ${callUs}.\n\n${body.text}\n\n${SITE.name} · ${SITE.url}`,
    }),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[email] ${email.reference} send failed:`, result.reason);
    } else if (result.value.error) {
      console.error(`[email] ${email.reference} send failed:`, result.value.error.message);
    }
  }
}
