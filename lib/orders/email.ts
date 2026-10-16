import "server-only";

import { Resend } from "resend";
import { CONDITION_LABELS } from "@/lib/catalog/types";
import { escapeHtml } from "@/lib/requests/email";
import { SITE } from "@/lib/site";
import { getBusiness } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { getOrder, shippingLines, type OrderWithItems } from "./types";

export type OrderEmailKind = "placed" | "paid" | "payment_failed" | "shipped" | "ready" | "cancelled" | "refunded";

const money = (cents: number) => formatPrice(cents) ?? "";
const p = (html: string) => `<p style="font:15px/1.5 sans-serif">${html}</p>`;

/** The order as a table (HTML) and plain lines (text). */
export function orderSummary(order: OrderWithItems): { html: string; text: string } {
  const items = order.items.map((i) => ({
    label: `${i.quantity} × ${i.name} (${CONDITION_LABELS[i.condition]}), part # ${i.sku}`,
    amount: money(i.unit_price_cents * i.quantity),
  }));
  const totals = [
    { label: "Subtotal", amount: money(order.subtotal_cents) },
    { label: order.fulfillment === "pickup" ? "Pickup" : "Shipping", amount: order.fulfillment === "pickup" ? "Free" : money(order.shipping_cents) },
    { label: "Tax", amount: money(order.tax_cents) },
    { label: "Total", amount: money(order.total_cents) },
  ];
  const row = (r: { label: string; amount: string }, bold = false) =>
    `<tr><td style="padding:4px 12px 4px 0${bold ? ";font-weight:bold" : ""}">${escapeHtml(r.label)}</td><td style="padding:4px 0;text-align:right${bold ? ";font-weight:bold" : ""}">${escapeHtml(r.amount)}</td></tr>`;
  const address = shippingLines(order);
  return {
    html: `<table cellpadding="0" style="border-collapse:collapse;font:14px/1.5 sans-serif">${items.map((r) => row(r)).join("")}${totals
      .map((r, i) => row(r, i === totals.length - 1))
      .join("")}</table>${address ? p(`<strong>Ship to</strong><br>${address.map(escapeHtml).join("<br>")}`) : ""}`,
    text: [
      ...items.map((r) => `${r.label}: ${r.amount}`),
      "",
      ...totals.map((r) => `${r.label}: ${r.amount}`),
      ...(address ? ["", "Ship to:", ...address] : []),
    ].join("\n"),
  };
}

interface Message {
  subject: string;
  /** Paragraphs before the order summary. */
  lines: string[];
}

async function customerMessage(kind: OrderEmailKind, order: OrderWithItems): Promise<Message | null> {
  const business = await getBusiness();
  const ref = order.reference;
  switch (kind) {
    case "placed":
      return order.status === "pending_payment"
        ? {
            subject: `Order ${ref} received: waiting for your bank payment`,
            lines: [
              `Thanks for your order. Your bank payment usually takes a few business days to clear; we’ll ${
                order.fulfillment === "pickup" ? "have it ready for pickup" : "ship it"
              } as soon as it does.`,
            ],
          }
        : {
            subject: `Order ${ref} confirmed`,
            lines: [
              order.fulfillment === "pickup"
                ? `Thanks for your order. We’ll email you when it’s ready to collect from ${business.street}, ${business.cityStateZip}.`
                : "Thanks for your order. We’ll email you the tracking number when it ships.",
            ],
          };
    case "payment_failed":
      return {
        subject: `Payment for order ${ref} didn’t go through`,
        lines: [`Your bank payment for order ${ref} failed, so we’ve cancelled the order. To order again, visit our website or ${business.callUs}.`],
      };
    case "shipped":
      return {
        subject: `Order ${ref} has shipped`,
        lines: [
          `Your order is on its way${order.carrier ? ` with ${order.carrier}` : ""}.`,
          ...(order.tracking_number ? [`Tracking number: ${order.tracking_number}`] : []),
        ],
      };
    case "ready":
      return {
        subject: `Order ${ref} is ready for pickup`,
        lines: [`Your order is ready to collect from ${business.street}, ${business.cityStateZip}. Our hours: ${business.hours}.`],
      };
    case "cancelled":
      return {
        subject: `Order ${ref} has been cancelled`,
        lines: [`We’ve cancelled order ${ref} and refunded your payment. Refunds take 5–10 business days to reach your account. Questions? ${business.callUs}.`],
      };
    case "refunded":
      return {
        subject: `Order ${ref} has been refunded`,
        lines: [`We’ve refunded order ${ref}. Refunds take 5–10 business days to reach your account. Questions? ${business.callUs}.`],
      };
    case "paid":
      return null;
  }
}

function staffMessage(kind: OrderEmailKind, order: OrderWithItems): Message | null {
  const ref = order.reference;
  const how = order.fulfillment === "pickup" ? "pickup" : "to ship";
  switch (kind) {
    case "placed":
      return order.status === "pending_payment"
        ? { subject: `New order ${ref} (${money(order.total_cents)}), ACH pending`, lines: ["Don’t release it until the bank payment clears; you’ll get another email."] }
        : { subject: `New order ${ref} (${money(order.total_cents)}), ${how}`, lines: [`From ${order.name ?? order.email ?? "a customer"}.`] };
    case "paid":
      return { subject: `Payment cleared for order ${ref}`, lines: [`The ACH payment cleared. Order ${ref} is ready to fulfil (${how}).`] };
    case "payment_failed":
      return { subject: `Payment failed: order ${ref} cancelled`, lines: ["The ACH payment failed. The order was cancelled and its stock returned."] };
    default:
      return null;
  }
}

/**
 * Email the customer and/or staff about an order. Never throws: the order is
 * already saved, and a mail outage must not undo or repeat anything.
 */
export async function sendOrderEmails(orderId: string, kind: OrderEmailKind): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MORSE_EMAIL_FROM;
  const staff = process.env.MORSE_STAFF_EMAIL?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (!apiKey || !from) {
    console.warn(`[email] Resend not configured; no ${kind} email for order ${orderId}.`);
    return;
  }
  try {
    const order = await getOrder(createAdminClient(), { id: orderId });
    if (!order) return;
    const resend = new Resend(apiKey);
    const summary = orderSummary(order);
    const sends: Promise<unknown>[] = [];

    const toCustomer = await customerMessage(kind, order);
    if (toCustomer && order.email) {
      const accountUrl = order.customer_id ? `${SITE.url}/account/orders/${order.reference}` : null;
      sends.push(
        resend.emails.send({
          from,
          to: order.email,
          ...(staff[0] ? { replyTo: staff[0] } : {}),
          subject: toCustomer.subject,
          html: `${p(`Hi ${escapeHtml(order.name ?? "there")},`)}${toCustomer.lines.map((l) => p(escapeHtml(l))).join("")}${p(
            `<strong>Order ${escapeHtml(order.reference)}</strong>`,
          )}${summary.html}${accountUrl ? p(`<a href="${escapeHtml(accountUrl)}">View your order</a>`) : ""}${p(
            `<span style="color:#4A5866;font-size:13px">${escapeHtml(SITE.name)} · <a href="${escapeHtml(SITE.url)}">${escapeHtml(new URL(SITE.url).host)}</a></span>`,
          )}`,
          text: `Hi ${order.name ?? "there"},\n\n${toCustomer.lines.join("\n\n")}\n\nOrder ${order.reference}\n${summary.text}${
            accountUrl ? `\n\nView your order: ${accountUrl}` : ""
          }\n\n${SITE.name} · ${SITE.url}`,
        }),
      );
    }

    const toStaff = staffMessage(kind, order);
    if (toStaff && staff.length) {
      const adminUrl = `${SITE.url}/admin/orders/${order.id}`;
      sends.push(
        resend.emails.send({
          from,
          to: staff,
          ...(order.email ? { replyTo: order.email } : {}),
          subject: toStaff.subject,
          html: `${toStaff.lines.map((l) => p(escapeHtml(l))).join("")}${summary.html}${p(`<a href="${escapeHtml(adminUrl)}">Open in the admin</a>`)}`,
          text: `${toStaff.lines.join("\n\n")}\n\n${summary.text}\n\nOpen in the admin: ${adminUrl}`,
        }),
      );
    }

    for (const result of await Promise.allSettled(sends)) {
      if (result.status === "rejected") console.error(`[email] order ${order.reference} ${kind}:`, result.reason);
      else if ((result.value as { error?: { message: string } | null })?.error) {
        console.error(`[email] order ${order.reference} ${kind}:`, (result.value as { error: { message: string } }).error.message);
      }
    }
  } catch (error) {
    console.error(`[email] order ${orderId} ${kind}:`, error instanceof Error ? error.message : error);
  }
}
