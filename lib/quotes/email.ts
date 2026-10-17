import "server-only";

import { Resend } from "resend";
import { escapeHtml } from "@/lib/requests/email";
import { SITE } from "@/lib/site";
import { getBusiness } from "@/lib/site-settings";
import { formatDueDate } from "@/lib/orders/types";
import { formatPrice } from "@/lib/utils";
import { quoteTotals } from "./logic";
import { lineValues, quoteKind, quoteTitle, type Quote } from "./store";

const money = (cents: number) => formatPrice(cents) ?? "";
const p = (html: string) => `<p style="font:15px/1.5 sans-serif">${html}</p>`;

/** The quote's lines and totals as a table (HTML) and plain lines (text). */
export function quoteSummary(quote: Quote): { html: string; text: string } {
  const lines = lineValues(quote.lines);
  const rows = lines.flatMap((l) => [
    { label: `${l.quantity} × ${l.description}${l.sku ? `, part # ${l.sku}` : ""}`, amount: money(l.unitPriceCents * l.quantity) },
    ...(l.coreChargeCents > 0
      ? [{ label: `   Core charge (refundable), ${l.quantity} × ${money(l.coreChargeCents)}`, amount: money(l.coreChargeCents * l.quantity) }]
      : []),
  ]);
  const pickup = quoteTotals(lines, quote.shipping_cents, "pickup");
  const totals = [
    { label: "Subtotal", amount: money(pickup.itemsCents) },
    ...(pickup.coreCents > 0 ? [{ label: "Core charges (refundable)", amount: money(pickup.coreCents) }] : []),
    {
      label: "Delivery",
      amount: quote.shipping_cents === null ? "Pickup from our shop" : `Shipping ${money(quote.shipping_cents)}, or free pickup`,
    },
    { label: "Total before tax (pickup)", amount: money(pickup.totalCents) },
  ];
  const row = (r: { label: string; amount: string }, bold = false) =>
    `<tr><td style="padding:4px 12px 4px 0${bold ? ";font-weight:bold" : ""}">${escapeHtml(r.label)}</td><td style="padding:4px 0;text-align:right${bold ? ";font-weight:bold" : ""}">${escapeHtml(r.amount)}</td></tr>`;
  return {
    html: `<table cellpadding="0" style="border-collapse:collapse;font:14px/1.5 sans-serif">${rows.map((r) => row(r)).join("")}${totals
      .map((r, i) => row(r, i === totals.length - 1))
      .join("")}</table>`,
    text: [...rows.map((r) => `${r.label}: ${r.amount}`), "", ...totals.map((r) => `${r.label}: ${r.amount}`)].join("\n"),
  };
}

function config() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MORSE_EMAIL_FROM;
  const staff = process.env.MORSE_STAFF_EMAIL?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return apiKey && from ? { resend: new Resend(apiKey), from, staff } : null;
}

async function report(label: string, send: Promise<{ error?: { message: string } | null }>): Promise<boolean> {
  try {
    const result = await send;
    if (result.error) {
      console.error(`[email] ${label}:`, result.error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[email] ${label}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Send the customer their quote with its link: when staff send it ("sent")
 * or when a repair is ready to pay for ("payment"). Returns whether it went
 * out, so staff can be told to send the link themselves if not.
 */
export async function sendQuoteEmail(quote: Quote, url: string, kind: "sent" | "payment"): Promise<boolean> {
  const mail = config();
  if (!mail) {
    console.warn(`[email] Resend not configured; quote ${quote.reference} not emailed.`);
    return false;
  }
  const business = await getBusiness();
  const repair = quoteKind(quote) === "repair";
  const job = quote.service_request?.reference;
  const subject =
    kind === "payment"
      ? `Your repair ${job} is ready: pay online`
      : repair
        ? `Your repair quote for job ${job} from ${SITE.name}`
        : `Your quote from ${SITE.name} (${quote.quote_request?.reference ?? quote.reference})`;
  const intro =
    kind === "payment"
      ? [`Your repair (job ${job}) is finished. You can pay online now, by card or bank transfer, and choose pickup or delivery.`]
      : [
          repair
            ? `Here’s our quote to repair your unit (job ${job}). Approve it online and we’ll start the work; you pay once it’s finished.`
            : `Here’s your quote. You can order and pay online, by card or bank transfer.`,
          `It’s valid until ${formatDueDate(quote.valid_until)}.`,
          ...(quote.message ? [quote.message] : []),
        ];
  const action = kind === "payment" ? "Pay online" : repair ? "View and approve the quote" : "View the quote and order";
  const summary = quoteSummary(quote);
  const footer = `Questions? Reply to this email or ${business.callUs}.`;
  return report(
    `quote ${quote.reference} ${kind}`,
    mail.resend.emails.send({
      from: mail.from,
      to: quote.email,
      ...(mail.staff[0] ? { replyTo: mail.staff[0] } : {}),
      subject,
      html: `${p(`Hi ${escapeHtml(quote.name)},`)}${intro.map((l) => p(escapeHtml(l))).join("")}${p(
        `<strong>${escapeHtml(quoteTitle(quote))}</strong>`,
      )}${summary.html}${p(`<a href="${escapeHtml(url)}"><strong>${escapeHtml(action)}</strong></a>`)}${p(escapeHtml(footer))}${p(
        `<span style="color:#4A5866;font-size:13px">${escapeHtml(SITE.name)} · <a href="${escapeHtml(SITE.url)}">${escapeHtml(new URL(SITE.url).host)}</a></span>`,
      )}`,
      text: `Hi ${quote.name},\n\n${intro.join("\n\n")}\n\n${quoteTitle(quote)}\n${summary.text}\n\n${action}: ${url}\n\n${footer}\n\n${SITE.name} · ${SITE.url}`,
    }),
  );
}

/** Tell staff the customer approved or declined a quote. Never throws. */
export async function sendQuoteResponseEmail(quote: Quote, approved: boolean): Promise<void> {
  const mail = config();
  if (!mail || !mail.staff.length) return;
  const what = quote.service_request ? `repair quote for job ${quote.service_request.reference}` : `quote for ${quote.quote_request?.reference}`;
  const adminUrl = `${SITE.url}${quote.service_request_id ? `/admin/service/${quote.service_request_id}` : `/admin/quotes/${quote.quote_request_id}`}`;
  const lines = [
    approved
      ? `${quote.name} approved the ${what} (${quote.reference}). You can start the work.`
      : `${quote.name} declined the ${what} (${quote.reference}).${quote.decline_reason ? ` Their reason: ${quote.decline_reason}` : ""}`,
  ];
  const summary = quoteSummary(quote);
  await report(
    `quote ${quote.reference} response`,
    mail.resend.emails.send({
      from: mail.from,
      to: mail.staff,
      replyTo: quote.email,
      subject: `${approved ? "Approved" : "Declined"}: ${what}`,
      html: `${lines.map((l) => p(escapeHtml(l))).join("")}${summary.html}${p(`<a href="${escapeHtml(adminUrl)}">Open in the admin</a>`)}`,
      text: `${lines.join("\n\n")}\n\n${summary.text}\n\nOpen in the admin: ${adminUrl}`,
    }),
  );
}
